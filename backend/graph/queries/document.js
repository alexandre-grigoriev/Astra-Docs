/**
 * graph/queries/document.js — KBDocument Cypher operations.
 *
 * All writes use MERGE (never CREATE alone) per NEO4J_SCHEMA.md §8.
 * No variables are interpolated into Cypher strings.
 */

import neo4j from 'neo4j-driver';
import { readQuery, writeQuery } from '../driver.js';

/**
 * @typedef {object} KBDocumentProps
 * @property {string}        docId
 * @property {string}        filename      - basename only (e.g. "Concept.md")
 * @property {string}        filepath      - full relative path inside ZIP (e.g. "Block/Concept.md"); equals filename for single-file uploads
 * @property {string}        mimeType      - 'pdf' | 'md' | 'docx'
 * @property {string}        language      - 'en' | 'fr'
 * @property {string}        summary
 * @property {string}        uploadedAt    - ISO 8601
 * @property {number}        wordCount
 * @property {string|null}   [documentDate] - optional date string from ZIP metadata
 */

/**
 * Upserts a KBDocument node.
 * Uses MERGE so uploading the same document twice updates, not duplicates.
 *
 * @param {KBDocumentProps} props
 * @returns {Promise<void>}
 */
export async function upsertDocument({ docId, filename, filepath, mimeType, language, summary, uploadedAt, wordCount, documentDate = null }) {
  await writeQuery(
    `MERGE (d:KBDocument { id: $docId })
     SET d.filename     = $filename,
         d.filepath     = $filepath,
         d.mimeType     = $mimeType,
         d.language     = $language,
         d.summary      = $summary,
         d.uploadedAt   = $uploadedAt,
         d.wordCount    = $wordCount,
         d.documentDate = $documentDate
     RETURN d`,
    { docId, filename, filepath, mimeType, language, summary, uploadedAt, wordCount, documentDate }
  );
}

/**
 * Returns all documents ordered by upload date descending.
 *
 * @returns {Promise<object[]>}
 */
export async function listDocuments() {
  const records = await readQuery(
    `MATCH (d:KBDocument)
     OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c:KBChunk)
     RETURN d.id AS id, d.filename AS filename, d.mimeType AS mimeType,
            d.language AS language, d.summary AS summary,
            d.uploadedAt AS uploadedAt, d.wordCount AS wordCount,
            d.documentDate AS documentDate,
            count(c) AS chunkCount
     ORDER BY d.uploadedAt DESC`
  );
  return records.map(r => ({
    id:           r.id,
    filename:     r.filename     ?? '',
    mimeType:     r.mimeType     ?? '',
    lang:         r.language     ?? 'en',
    summary:      r.summary      ?? '',
    uploadedAt:   r.uploadedAt   ?? '',
    documentDate: r.documentDate ?? null,
    wordCount:    typeof r.wordCount?.toNumber === 'function' ? r.wordCount.toNumber() : Number(r.wordCount ?? 0),
    chunkCount:   typeof r.chunkCount?.toNumber === 'function' ? r.chunkCount.toNumber() : Number(r.chunkCount ?? 0),
  }));
}

/**
 * Deletes a document and its chunks.
 * Does NOT delete KBEntity nodes — they may be shared across documents.
 * Per NEO4J_SCHEMA.md §6.3.
 *
 * @param {string} docId
 * @returns {Promise<void>}
 */
export async function deleteDocument(docId) {
  await writeQuery(
    `MATCH (d:KBDocument { id: $docId })
     OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c:KBChunk)
     OPTIONAL MATCH (c)-[:MENTIONS]->(e:KBEntity)
     DETACH DELETE d, c`,
    { docId }
  );
}

/**
 * Deletes all KBDocument, KBChunk, and KBEntity nodes.
 * Per NEO4J_SCHEMA.md §6.4.
 *
 * @returns {Promise<void>}
 */
export async function resetKnowledgeBase() {
  await writeQuery(
    `MATCH (n)
     WHERE n:KBDocument OR n:KBChunk OR n:KBEntity
     DETACH DELETE n`
  );
}

/**
 * Returns all image URLs from all chunks of a document.
 * Used to attach images to search results even when the image chunk wasn't retrieved.
 *
 * @param {string} filename
 * @returns {Promise<string[]>}
 */
export async function getDocumentImagesByFilename(filename) {
  const records = await readQuery(
    `MATCH (d:KBDocument { filename: $filename })-[:HAS_CHUNK]->(c:KBChunk)
     WHERE size(coalesce(c.images, [])) > 0
     RETURN c.images AS images`,
    { filename }
  );
  return [...new Set(records.flatMap(r => r.images ?? []))];
}
