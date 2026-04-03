/**
 * retrieval/merger.js — deduplicate results across strategies, keep highest score per chunkId.
 *
 * Per RAG_PIPELINE.md B.3.
 * Input: array of ScoredChunk[] arrays (one per strategy).
 * Output: flat ScoredChunk[] sorted descending by score, capped at topK.
 */

/**
 * @typedef {import('./strategies.js').ScoredChunk} ScoredChunk
 */

/**
 * Merges results from multiple retrieval strategies using a weighted sum.
 *
 * Strategy order (from runAllStrategies):
 *   0: chunkVectorSearch   → cosine similarity [0, 1]   weight 1.0  raw score (no normalization)
 *   1: entityVectorSearch  → cosine similarity [0, 1]   weight 0.4  raw score (no normalization)
 *   2: graphTraversal      → count(related) integers    weight 0.15 normalized to [0,1]
 *   3: sequentialNeighbors → fixed 0.5                  weight 0    (expands context pool only)
 *
 * Vector strategies (0, 1) use raw cosine scores.  Normalizing them would amplify
 * the small absolute gap between nearby results (e.g. 0.88 vs 0.91 becomes 0.4 vs 1.0),
 * which neutralises the keyword boost applied later in query_pipeline.js.
 *
 * graphTraversal returns integer relation counts that need normalization to be
 * comparable with cosines, but its weight is kept small (0.15) so it can only
 * provide a minor tie-breaker bonus, never override vector similarity.
 *
 * sequentialNeighbors (weight=0) adds neighbouring chunks to the result pool so
 * the expander in query_pipeline.js can pick them up, but contributes nothing
 * to the score so context-only chunks don't crowd out semantically relevant ones.
 *
 * @param {ScoredChunk[][]} resultSets
 * @param {number}          [topK=10]
 * @returns {ScoredChunk[]}
 */
export function mergeResults(resultSets, topK = 10) {
  /** @type {Map<string, ScoredChunk>} */
  const scoreMap = new Map();

  // Per-strategy config: weight + whether to normalize before weighting.
  const STRATEGY_CONFIG = [
    { weight: 1.00, normalize: false }, // 0: chunkVectorSearch  — raw cosine
    { weight: 0.40, normalize: false }, // 1: entityVectorSearch — raw cosine
    { weight: 0.15, normalize: true  }, // 2: graphTraversal     — integer counts → [0,1]
    { weight: 0.00, normalize: false }, // 3: sequentialNeighbors — context only
  ];

  for (let si = 0; si < resultSets.length; si++) {
    // Deduplicate within this strategy — entityVectorSearch can return the same
    // chunkId multiple times (once per matched entity). Keep only the best score.
    const seen = new Map();
    for (const r of resultSets[si]) {
      if (!r.chunkId) continue;
      const s = Number(r.score) || 0;
      if (!seen.has(r.chunkId) || seen.get(r.chunkId).score < s) seen.set(r.chunkId, r);
    }
    const records = [...seen.values()];

    const { weight, normalize } = STRATEGY_CONFIG[si] ?? { weight: 0, normalize: false };
    if (!records.length || weight === 0) continue;

    const rawScores = records.map(r => Number(r.score) || 0);

    let effectiveScores;
    if (normalize) {
      const max = Math.max(...rawScores);
      const min = Math.min(...rawScores);
      const range = max - min || 1;
      effectiveScores = rawScores.map(s => (s - min) / range);
    } else {
      effectiveScores = rawScores;
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r.chunkId) continue;
      const contribution = effectiveScores[i] * weight;

      if (!scoreMap.has(r.chunkId)) {
        scoreMap.set(r.chunkId, { ...r, score: contribution });
      } else {
        scoreMap.get(r.chunkId).score += contribution;
      }
    }
  }

  // seqNeighbors (weight=0) chunks are only added to the pool if they haven't
  // already been scored by a vector strategy.  They get score=0 here and will
  // rank at the bottom unless bumped by the expander later.
  for (const records of [resultSets[3]].filter(Boolean)) {
    for (const r of records) {
      if (!r.chunkId) continue;
      if (!scoreMap.has(r.chunkId)) {
        scoreMap.set(r.chunkId, { ...r, score: 0 });
      }
    }
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
