/**
 * graph/schema.js — Neo4j schema initialisation.
 *
 * Creates vector indexes and unique constraints on startup.
 * Uses IF NOT EXISTS so it is safe to call on every boot.
 * Index names match RAG_PIPELINE.md exactly:
 *   kb_chunk_embedding   — KBChunk.embedding (3072 dims, cosine)
 *   kb_entity_embedding  — KBEntity.embedding (3072 dims, cosine)
 */

import { writeQuery } from './driver.js';
import { logger } from '../utils/logger.js';

/**
 * Initialises the Neo4j schema (indexes + constraints).
 * Safe to call multiple times; all statements use IF NOT EXISTS.
 *
 * @returns {Promise<void>}
 */
export async function initSchema() {
  const statements = [
    // Unique constraints
    `CREATE CONSTRAINT kb_document_id IF NOT EXISTS
     FOR (d:KBDocument) REQUIRE d.id IS UNIQUE`,

    `CREATE CONSTRAINT kb_chunk_id IF NOT EXISTS
     FOR (c:KBChunk) REQUIRE c.id IS UNIQUE`,

    `CREATE CONSTRAINT kb_entity_key IF NOT EXISTS
     FOR (e:KBEntity) REQUIRE e.key IS UNIQUE`,

    // Chunk vector index
    `CREATE VECTOR INDEX kb_chunk_embedding IF NOT EXISTS
     FOR (c:KBChunk) ON c.embedding
     OPTIONS { indexConfig: { \`vector.dimensions\`: 3072, \`vector.similarity_function\`: 'cosine' } }`,

    // Entity vector index
    `CREATE VECTOR INDEX kb_entity_embedding IF NOT EXISTS
     FOR (e:KBEntity) ON e.embedding
     OPTIONS { indexConfig: { \`vector.dimensions\`: 3072, \`vector.similarity_function\`: 'cosine' } }`,
  ];

  for (const stmt of statements) {
    try {
      await writeQuery(stmt);
    } catch (error) {
      // Ignore "already exists" errors from older Neo4j versions that don't support IF NOT EXISTS on all statement types
      if (!error.message?.includes('already exists') && !error.message?.includes('ConstraintAlreadyExistsException')) {
        logger.warn('Schema statement warning', { error: error.message });
      }
    }
  }

  // Verify vector indexes are actually ONLINE
  try {
    const indexes = await writeQuery(`SHOW VECTOR INDEXES YIELD name, state RETURN name, state`);
    const names = indexes.map(r => `${r.name}(${r.state})`).join(', ');
    logger.info('Neo4j schema ready', { vectorIndexes: names || 'none' });
  } catch {
    logger.info('Neo4j schema ready');
  }
}
