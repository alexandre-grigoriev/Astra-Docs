/**
 * graph/queries/chunk.js — KBChunk Cypher operations.
 *
 * All writes use MERGE (never CREATE alone) per NEO4J_SCHEMA.md §8.
 * No variables are interpolated into Cypher strings.
 */

import { readQuery, writeQuery } from '../driver.js';

/**
 * Upserts a KBChunk node and links it to its parent KBDocument.
 * Per RAG_PIPELINE.md A.8.2.
 *
 * @param {object} props
 * @param {string}   props.chunkId      - '<docId>_chunk_<index>'
 * @param {string}   props.docId
 * @param {number}   props.chunkIndex   - 0-based
 * @param {string}   props.cleanText    - chunk text with IMAGE_REF tokens removed
 * @param {string}   props.enrichedText - Gemini-rewritten self-contained text
 * @param {string[]} props.images       - public URLs of images in this chunk
 * @param {number[]} props.embedding    - 3072-dim float vector
 * @param {number}   props.wordCount
 * @returns {Promise<void>}
 */
export async function upsertChunk({ chunkId, docId, chunkIndex, cleanText, enrichedText, images, embedding, wordCount }) {
  await writeQuery(
    `MERGE (c:KBChunk { id: $chunkId })
     SET c.docId        = $docId,
         c.index        = $chunkIndex,
         c.text         = $cleanText,
         c.enrichedText = $enrichedText,
         c.images       = $images,
         c.embedding    = $embedding,
         c.wordCount    = $wordCount
     WITH c
     MATCH (d:KBDocument { id: $docId })
     MERGE (d)-[:HAS_CHUNK]->(c)
     RETURN c`,
    { chunkId, docId, chunkIndex, cleanText, enrichedText, images, embedding, wordCount }
  );
}

/**
 * Creates NEXT/PREV sequential links between all chunks of a document.
 * Must be called after ALL chunks of the document are written.
 * Per RAG_PIPELINE.md A.8.3.
 *
 * @param {string} docId
 * @returns {Promise<void>}
 */
export async function linkChunksSequentially(docId) {
  await writeQuery(
    `MATCH (d:KBDocument { id: $docId })-[:HAS_CHUNK]->(c:KBChunk)
     WITH c ORDER BY c.index ASC
     WITH collect(c) AS chunks
     UNWIND range(0, size(chunks)-2) AS i
     WITH chunks[i] AS curr, chunks[i+1] AS nxt
     MERGE (curr)-[:NEXT]->(nxt)
     MERGE (nxt)-[:PREV]->(curr)`,
    { docId }
  );
}

/**
 * Fetches PREV and NEXT neighbors of a chunk.
 * Per RAG_PIPELINE.md B.4.
 *
 * @param {string} chunkId
 * @returns {Promise<{ prev: object|null, nxt: object|null }>}
 */
export async function getNeighborChunks(chunkId) {
  const records = await readQuery(
    `MATCH (c:KBChunk { id: $chunkId })
     OPTIONAL MATCH (prev:KBChunk)-[:NEXT]->(c)
     OPTIONAL MATCH (c)-[:NEXT]->(nxt:KBChunk)
     RETURN prev, nxt`,
    { chunkId }
  );
  if (!records[0]) return { prev: null, nxt: null };
  return {
    prev: records[0].prev ?? null,
    nxt:  records[0].nxt  ?? null,
  };
}
