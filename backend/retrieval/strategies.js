/**
 * retrieval/strategies.js — 4 Cypher vector retrieval strategies.
 *
 * All 4 run in parallel via Promise.all per RAG_PIPELINE.md B.2.
 * Each returns ScoredChunk[] (plain JS objects — readQuery already unwraps records).
 *
 * Index names (must match graph/schema.js):
 *   kb_chunk_embedding   — KBChunk.embedding
 *   kb_entity_embedding  — KBEntity.embedding
 *
 * Note: topK/seedK are passed through toInteger() in Cypher because neo4j-driver
 * sends plain JS numbers as floats, which Neo4j rejects in LIMIT and procedure args.
 */

import { readQuery } from '../graph/driver.js';
import { logger }    from '../utils/logger.js';

/**
 * @typedef {object} ScoredChunk
 * @property {string}   chunkId
 * @property {number}   score
 * @property {string}   text          - clean text (no IMAGE_REF tokens)
 * @property {string}   enrichedText  - Gemini-rewritten self-contained text
 * @property {string[]} images        - public image URLs
 * @property {string}   docId
 * @property {string}   filename
 * @property {string|null} documentDate
 */

/**
 * B.2.1 — Chunk vector search.
 * Direct cosine similarity against chunk embeddings.
 *
 * @param {number[]} queryEmbedding
 * @param {number}   topK
 * @returns {Promise<ScoredChunk[]>}
 */
async function chunkVectorSearch(queryEmbedding, topK) {
  return readQuery(
    `CALL db.index.vector.queryNodes('kb_chunk_embedding', toInteger($topK), $queryEmbedding)
     YIELD node AS c, score
     OPTIONAL MATCH (d:KBDocument { id: c.docId })
     RETURN c.id             AS chunkId,
            score,
            c.text           AS text,
            c.enrichedText   AS enrichedText,
            coalesce(c.images, []) AS images,
            c.docId          AS docId,
            d.filename       AS filename,
            d.documentDate   AS documentDate
     ORDER BY score DESC`,
    { topK, queryEmbedding }
  ).catch(err => {
    logger.warn('chunkVectorSearch failed', { error: err.message });
    return [];
  });
}

/**
 * B.2.2 — Entity vector search → chunks that MENTION the matched entities.
 *
 * @param {number[]} queryEmbedding
 * @param {number}   topK
 * @returns {Promise<ScoredChunk[]>}
 */
async function entityVectorSearch(queryEmbedding, topK) {
  return readQuery(
    `CALL db.index.vector.queryNodes('kb_entity_embedding', toInteger($topK), $queryEmbedding)
     YIELD node AS e, score
     MATCH (c:KBChunk)-[:MENTIONS]->(e)
     OPTIONAL MATCH (d:KBDocument { id: c.docId })
     RETURN c.id             AS chunkId,
            score,
            c.text           AS text,
            c.enrichedText   AS enrichedText,
            coalesce(c.images, []) AS images,
            c.docId          AS docId,
            d.filename       AS filename,
            d.documentDate   AS documentDate
     ORDER BY score DESC
     LIMIT toInteger($topK)`,
    { topK, queryEmbedding }
  ).catch(err => { logger.warn('entityVectorSearch failed', { error: err.message }); return []; });
}

/**
 * B.2.3 — Graph traversal: 1–2 hops from top-5 seed entities.
 *
 * @param {number[]} queryEmbedding
 * @param {number}   topK
 * @returns {Promise<ScoredChunk[]>}
 */
async function graphTraversal(queryEmbedding, topK) {
  // seedK=5 per spec
  const SEED_K = 5;
  return readQuery(
    `CALL db.index.vector.queryNodes('kb_entity_embedding', toInteger($seedK), $queryEmbedding)
     YIELD node AS seed
     MATCH (seed)-[:RELATED_TO*1..2]-(related:KBEntity)
     MATCH (c:KBChunk)-[:MENTIONS]->(related)
     OPTIONAL MATCH (d:KBDocument { id: c.docId })
     WITH c, d, count(related) AS relevance
     RETURN c.id             AS chunkId,
            toFloat(relevance) AS score,
            c.text           AS text,
            c.enrichedText   AS enrichedText,
            coalesce(c.images, []) AS images,
            c.docId          AS docId,
            d.filename       AS filename,
            d.documentDate   AS documentDate
     ORDER BY score DESC
     LIMIT toInteger($topK)`,
    { seedK: SEED_K, topK, queryEmbedding }
  ).catch(err => { logger.warn('graphTraversal failed', { error: err.message }); return []; });
}

/**
 * B.2.4 — Sequential neighbors of top-3 seed chunks.
 *
 * Uses OPTIONAL MATCH + UNWIND instead of UNION to avoid Cypher scoping issues
 * where the second UNION branch cannot reference variables from the first.
 *
 * @param {number[]} queryEmbedding
 * @param {number}   topK
 * @returns {Promise<ScoredChunk[]>}
 */
async function sequentialNeighbors(queryEmbedding, topK) {
  // seedK=3 per spec
  const SEED_K = 3;
  return readQuery(
    `CALL db.index.vector.queryNodes('kb_chunk_embedding', toInteger($seedK), $queryEmbedding)
     YIELD node AS seed
     OPTIONAL MATCH (prev:KBChunk)-[:NEXT]->(seed)
     OPTIONAL MATCH (seed)-[:NEXT]->(nxt:KBChunk)
     WITH [prev, nxt] AS neighbors
     UNWIND neighbors AS neighbor
     WITH neighbor WHERE neighbor IS NOT NULL
     OPTIONAL MATCH (d:KBDocument { id: neighbor.docId })
     RETURN neighbor.id           AS chunkId,
            0.5                   AS score,
            neighbor.text         AS text,
            neighbor.enrichedText AS enrichedText,
            coalesce(neighbor.images, []) AS images,
            neighbor.docId        AS docId,
            d.filename            AS filename,
            d.documentDate        AS documentDate`,
    { seedK: SEED_K, queryEmbedding }
  ).catch(err => { logger.warn('sequentialNeighbors failed', { error: err.message }); return []; });
}

/**
 * Runs all 4 retrieval strategies in parallel.
 * Per RAG_PIPELINE.md B.2 — all run concurrently via Promise.all.
 *
 * @param {number[]} queryEmbedding
 * @param {number}   topK
 * @returns {Promise<ScoredChunk[][]>} - array of 4 result arrays
 */
export async function runAllStrategies(queryEmbedding, topK) {
  return Promise.all([
    chunkVectorSearch(queryEmbedding, topK),
    entityVectorSearch(queryEmbedding, topK),
    graphTraversal(queryEmbedding, topK),
    sequentialNeighbors(queryEmbedding, topK),
  ]);
}
