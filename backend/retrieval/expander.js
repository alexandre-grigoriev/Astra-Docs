/**
 * retrieval/expander.js — sequential neighbor expansion.
 *
 * After merging, fetches PREV/NEXT neighbors for each top chunk that is
 * not already in the result set. Final list is capped at topK + 2.
 * Per RAG_PIPELINE.md B.4.
 */

import { getNeighborChunks } from '../graph/queries/chunk.js';

/**
 * @typedef {import('./strategies.js').ScoredChunk} ScoredChunk
 */

/**
 * Expands a merged result set with sequential (PREV/NEXT) neighbors.
 * Neighbors inherit 80% of the seed chunk's score so they rank below it.
 * Caps the final list at topK + 2.
 *
 * @param {ScoredChunk[]} topChunks - already-merged, sorted result set
 * @param {number}        [topK=10]
 * @returns {Promise<ScoredChunk[]>}
 */
export async function expandWithNeighbors(topChunks, topK = 10) {
  /** @type {Map<string, ScoredChunk>} */
  const resultMap = new Map();

  for (const chunk of topChunks) {
    resultMap.set(chunk.chunkId, chunk);
  }

  for (const chunk of topChunks) {
    let neighbors;
    try {
      neighbors = await getNeighborChunks(chunk.chunkId);
    } catch {
      // Skip silently — a missing neighbor must not abort expansion
      continue;
    }

    for (const [key, neighbor] of [['prev', neighbors.prev], ['nxt', neighbors.nxt]]) {
      if (!neighbor) continue;

      // neighbor is a Neo4j node object from the OPTIONAL MATCH; extract properties
      const props = neighbor.properties ?? neighbor;
      const neighborId = props.id;
      if (!neighborId || resultMap.has(neighborId)) continue;

      resultMap.set(neighborId, {
        chunkId:      neighborId,
        score:        chunk.score * 0.8,
        text:         props.text         ?? '',
        enrichedText: props.enrichedText ?? props.text ?? '',
        images:       props.images       ?? [],
        docId:        props.docId        ?? chunk.docId,
        filename:     chunk.filename,
        documentDate: chunk.documentDate,
      });
    }
  }

  return [...resultMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK + 2);
}
