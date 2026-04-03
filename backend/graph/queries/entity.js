/**
 * graph/queries/entity.js — KBEntity Cypher operations.
 *
 * All writes use MERGE (never CREATE alone) per NEO4J_SCHEMA.md §8.
 * No variables are interpolated into Cypher strings.
 */

import { writeQuery } from '../driver.js';

/**
 * Upserts a KBEntity node.
 * Per RAG_PIPELINE.md A.8.4.
 *
 * @param {object} props
 * @param {string}   props.key         - canonical snake_case identifier
 * @param {string}   props.type        - DEVICE|CONCEPT|PROCESS|PERSON|LOCATION|ORGANIZATION|OTHER
 * @param {string}   props.description - one-sentence definition
 * @param {number[]} props.embedding   - 3072-dim vector of "key: description"
 * @returns {Promise<void>}
 */
export async function upsertEntity({ key, type, description, embedding }) {
  await writeQuery(
    `MERGE (e:KBEntity { key: $key })
     SET e.type        = $type,
         e.description = $description,
         e.embedding   = $embedding
     RETURN e`,
    { key, type, description, embedding }
  );
}

/**
 * Creates a MENTIONS link from a chunk to an entity.
 * Per RAG_PIPELINE.md A.8.5.
 *
 * @param {string} chunkId
 * @param {string} key - entity key
 * @returns {Promise<void>}
 */
export async function createMentionsLink(chunkId, key) {
  await writeQuery(
    `MATCH (c:KBChunk { id: $chunkId })
     MATCH (e:KBEntity { key: $key })
     MERGE (c)-[:MENTIONS]->(e)`,
    { chunkId, key }
  );
}

/**
 * Creates a RELATED_TO link between two entities.
 * Per RAG_PIPELINE.md A.8.6.
 *
 * @param {string} fromKey
 * @param {string} toKey
 * @param {string} relation - e.g. USES|PART_OF|PRODUCES|REQUIRES|CONNECTS_TO|DESCRIBED_BY|OTHER
 * @returns {Promise<void>}
 */
export async function createRelatedToLink(fromKey, toKey, relation) {
  await writeQuery(
    `MATCH (a:KBEntity { key: $fromKey })
     MATCH (b:KBEntity { key: $toKey })
     MERGE (a)-[r:RELATED_TO { relation: $relation }]->(b)`,
    { fromKey, toKey, relation }
  );
}
