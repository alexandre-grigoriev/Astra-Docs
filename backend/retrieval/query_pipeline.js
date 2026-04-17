/**
 * retrieval/query_pipeline.js — orchestrates query steps 1–8.
 *
 * Step execution per RAG_PIPELINE.md B:
 *   1. Embed query (RETRIEVAL_QUERY)
 *   2. Run 4 retrieval strategies in parallel
 *   3. Merge & deduplicate (highest score per chunkId)
 *   4. Expand with sequential neighbors (±1, cap topK+2)
 *   5. Auto-translate (FR chunks → target language)
 *   6. Label chunks with filename + documentDate
 *   7. Collect & deduplicate image URLs
 *   8. Return result set
 *
 * The returned objects match the shape knowledgeBase.js reads:
 *   { text, filename, documentDate, images, chunkId, docId }
 */

import { embedQuery }         from '../ingestion/embedder.js';
import { runAllStrategies }   from './strategies.js';
import { mergeResults }       from './merger.js';
import { expandWithNeighbors } from './expander.js';
import { translateChunks }    from './translator.js';

const DEFAULT_TOP_K = 10;

/**
 * Runs the full retrieval pipeline for a user query.
 *
 * @param {string} query        - user question
 * @param {number} [topK=10]    - number of chunks to retrieve before expansion
 * @returns {Promise<Array<{text: string, filename: string|null, documentDate: string|null, images: string[], chunkId: string, docId: string}>>}
 */
export async function searchKnowledgeBase(query, topK = DEFAULT_TOP_K) {
  // Step 1: Embed query with RETRIEVAL_QUERY task type
  const queryEmbedding = await embedQuery(query);

  // Step 2: Run all 4 strategies in parallel
  const strategyResults = await runAllStrategies(queryEmbedding, topK);

  // Step 3: Merge — highest score per chunkId, sorted descending
  const merged = mergeResults(strategyResults, topK);

  // Step 3b: Filename keyword boost.
  // If a chunk's source filename (without extension) appears as a word in the query,
  // boost its score by 5% so explicit document references rank above generic matches.
  const queryLower = query.toLowerCase();
  const boosted = merged.map(c => {
    if (!c.filename) return c;
    const stem = c.filename.replace(/\.[^.]+$/, '').toLowerCase();
    const isKeyword = new RegExp(`\\b${stem}\\b`).test(queryLower);
    return isKeyword ? { ...c, score: (c.score ?? 0) * 1.30 } : c;
  }).sort((a, b) => b.score - a.score);

  // Step 4: Expand with sequential neighbors, cap at topK + 2
  const expanded = await expandWithNeighbors(boosted, topK);

  // Steps 5–8 are handled by the caller (knowledgeBase.js calls translateChunks separately)
  // Return the ScoredChunk objects with enrichedText set as text for downstream use
  return expanded
    .filter(c => c.enrichedText || c.text)
    .map(c => ({
      chunkId:      c.chunkId,
      docId:        c.docId,
      // Embed on enrichedText (better semantic signal) but answer on cleanText (exact source, tables intact)
      enrichedText: c.enrichedText ?? c.text ?? '',
      text:         c.text         ?? c.enrichedText ?? '',
      images:       c.images       ?? [],
      filename:     c.filename     ?? null,
      documentDate: c.documentDate ?? null,
    }));
}

// Re-exported so knowledgeBase.js can call it directly after searchKnowledgeBase
export { translateChunks } from './translator.js';
