/**
 * ingestion/pipeline.js — orchestrates ingestion steps 1–8 per document.
 *
 * Execution order per RAG_PIPELINE.md A.9:
 *   1. extractText
 *   2. detectLanguage
 *   3. generateDocumentSummary
 *   4. chunkText
 *   5. For each chunk (sequential — rate-limit protection):
 *      a. resolveChunkImages
 *      b. enrichChunk
 *      c. embedText (on enrichedText)
 *      d. upsertChunk
 *      e. For each entity: embedText, upsertEntity, createMentionsLink
 *      f. For each relation: createRelatedToLink
 *   6. upsertDocument (after all chunks)
 *   7. linkChunksSequentially (NEXT/PREV)
 *   8. Return counts
 *
 * Error contract:
 *   - Steps 1–2 failure → rethrow (document is unprocessable)
 *   - Step 3 failure    → continue with empty summary
 *   - Chunk step failure → skip that chunk, log, continue
 *   - > 50% chunks failed → log critical warning, do NOT abort
 */

import crypto             from 'crypto';
import { extractText }    from './extractor.js';
import { chunkText }      from './chunker.js';
import { resolveChunkImages } from './image_resolver.js';
import { generateDocumentSummary, enrichChunk } from './enricher.js';
import { embedText }      from './embedder.js';
import { upsertDocument } from '../graph/queries/document.js';
import { upsertChunk, linkChunksSequentially } from '../graph/queries/chunk.js';
import { upsertEntity, createMentionsLink, createRelatedToLink } from '../graph/queries/entity.js';
import { logger }         from '../utils/logger.js';

const FRENCH_WORDS = ['le','la','les','de','du','des','un','une','et','est','en','pour','dans','que','qui'];

/**
 * Builds the text input for generateDocumentSummary.
 *
 * For plain documents, returns the first 3000 chars of text.
 * For diagram-only documents (text is just IMAGE_REF tokens), falls back to the
 * DOT source content so Gemini can summarise the diagram rather than hallucinate.
 * The file path is always injected as a context header so the LLM can use the
 * folder name and filename to understand what the document is about.
 *
 * @param {string} text            - extracted text (may contain only IMAGE_REF tokens)
 * @param {string} dotContent      - raw DOT source from graphviz blocks (may be '')
 * @param {string} filepath        - full relative path inside ZIP (e.g. "andor-docs/Acquisition.md")
 * @returns {string}
 */
function buildSummaryInput(text, dotContent, filepath) {
  const header = filepath ? `File: ${filepath}\n\n` : '';

  // Strip IMAGE_REF tokens to get clean prose text
  const cleanText = text.replace(/\[IMAGE_REF:[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();

  if (cleanText.length >= 50) {
    // Enough prose — use it, prefixed with filepath context
    return (header + cleanText).slice(0, 3000);
  }

  // Diagram-only file — use DOT source so the LLM can describe the diagram
  if (dotContent) {
    return `${header}This file contains a diagram. Below is the diagram source (DOT/Graphviz):\n\n${dotContent.slice(0, 2800)}`;
  }

  // Fallback: just filepath
  return header || '(no content)';
}

/**
 * Detects document language from the first 500 characters.
 * Per RAG_PIPELINE.md A.2.
 *
 * @param {string} text
 * @returns {'en'|'fr'}
 */
function detectLanguage(text) {
  const sample = text.slice(0, 500).toLowerCase();
  const words  = sample.split(/\s+/);
  const frCount = words.filter(w => FRENCH_WORDS.includes(w)).length;
  return frCount >= 3 ? 'fr' : 'en';
}

/**
 * Ingests a single document through the full pipeline.
 *
 * Accepts an options object matching how knowledgeBase.js calls it:
 *   { buffer, filename, uploadedBy, documentDate, zipImages, zipDir }
 *
 * zipImages: Map<zipPath, Buffer> — image files extracted from the ZIP.
 * zipDir:    path prefix of the .md file inside the ZIP (e.g. "folder").
 * Both are optional (undefined for non-ZIP single-file uploads).
 *
 * @param {object}                opts
 * @param {Buffer}                opts.buffer
 * @param {string}                opts.filename
 * @param {string}                [opts.uploadedBy]    - user ID (stored for audit; not in graph schema)
 * @param {string|null}           [opts.documentDate]  - ISO date from ZIP metadata
 * @param {Map<string, Buffer>}   [opts.zipImages]     - image map for ZIP uploads
 * @param {string}                [opts.zipDir]        - directory of the file inside the ZIP
 * @param {string}                [opts.filepath]      - full relative path inside ZIP (e.g. "Block/Concept.md"); equals filename for single-file uploads
 * @param {function}              [opts.onProgress]    - optional progress callback
 * @returns {Promise<{ docId: string, filename: string, lang: string, chunkCount: number, entitiesWritten: number, summary: string }>}
 */
export async function ingestDocument({ buffer, filename, uploadedBy, documentDate = null, zipImages, zipDir, filepath, onProgress }) {
  const docId    = crypto.randomUUID();
  const imageMap = zipImages instanceof Map ? zipImages : new Map();
  // mdFilePath is used by image_resolver to resolve IMAGE_REF paths relative to the .md file
  const mdFilePath = zipDir ? `${zipDir}/${filename}` : filename;
  // filepath: full relative path inside ZIP, or just the filename for single-file uploads
  const resolvedFilepath = filepath ?? mdFilePath;

  // ── Step 1: Text extraction ────────────────────────────────────────────────
  let extraction;
  try {
    extraction = await extractText(buffer, filename);
  } catch (error) {
    logger.error('Text extraction failed — document unprocessable', { docId, filename, error: error.message });
    throw error;
  }

  const { text, mimeType, generatedImages, dotContent } = extraction;

  // Merge SVGs rendered from graphviz blocks into the image map.
  // Keys must be prefixed with the .md file's directory so image_resolver finds
  // them when it resolves IMAGE_REF tokens relative to that directory.
  // e.g. mdFilePath = "andor-docs/Acquisition.md" → dir = "andor-docs"
  //      key "graphviz-xxx.svg" → stored as "andor-docs/graphviz-xxx.svg"
  if (generatedImages instanceof Map) {
    const mdDir = mdFilePath.includes('/') ? mdFilePath.split('/').slice(0, -1).join('/') : '';
    for (const [key, buf] of generatedImages) {
      imageMap.set(mdDir ? `${mdDir}/${key}` : key, buf);
    }
  }

  if (!text?.trim()) {
    const err = new Error(`No text extracted from ${filename}`);
    logger.error('Empty extraction result', { docId, filename });
    throw err;
  }

  // ── Step 2: Language detection ─────────────────────────────────────────────
  const language = detectLanguage(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // ── Step 3: Document summary ───────────────────────────────────────────────
  // Build summary input: prefer actual document text; fall back to DOT source
  // content when the file is diagram-only (text would be just IMAGE_REF tokens).
  // Always inject the filepath so the LLM can use folder/filename as context.
  const textForSummary = buildSummaryInput(text, dotContent, resolvedFilepath);
  let summary = '';
  try {
    summary = await generateDocumentSummary(textForSummary);
  } catch (error) {
    // Non-fatal — proceed with empty summary
    logger.warn('Document summary failed, continuing with empty string', { docId, filename, error: error.message });
  }

  onProgress?.(`Extracted ${wordCount} words (${language})`);

  // ── Step 4: Upsert document node BEFORE chunks so HAS_CHUNK links resolve ──
  // upsertChunk does MATCH (d:KBDocument { id: $docId }) — the doc must exist first.
  await upsertDocument({
    docId,
    filename,
    filepath: resolvedFilepath,
    mimeType,
    language,
    summary,
    uploadedAt: new Date().toISOString(),
    wordCount,
    documentDate,
  });

  // ── Step 5: Chunking ───────────────────────────────────────────────────────
  const chunks = chunkText(text);
  onProgress?.(`Split into ${chunks.length} chunks`);

  // ── Step 6: Per-chunk processing (sequential — Gemini rate limit) ──────────
  let chunkCount    = 0;
  let entitiesWritten = 0;
  let failedChunks  = 0;

  for (const chunk of chunks) {
    try {
      // 5a. Image resolution
      const { cleanText, images } = await resolveChunkImages(chunk, docId, mdFilePath, imageMap);

      // 5b. LLM enrichment
      const { enrichedText, entities, relations } = await enrichChunk(
        cleanText, summary, chunk.index, chunks.length
      );

      // 5c. Embed enriched text
      const embedding = await embedText(enrichedText);

      // 5d. Write chunk to graph
      const chunkId = `${docId}_chunk_${chunk.index}`;
      await upsertChunk({
        chunkId,
        docId,
        chunkIndex: chunk.index,
        cleanText,
        enrichedText,
        images,
        embedding,
        wordCount: chunk.wordCount,
      });

      // 5e. Entities
      for (const entity of entities) {
        if (!entity.key) continue;
        try {
          const entityEmbedding = await embedText(`${entity.key}: ${entity.description}`);
          await upsertEntity({ key: entity.key, type: entity.type, description: entity.description, embedding: entityEmbedding });
          await createMentionsLink(chunkId, entity.key);
          entitiesWritten++;
        } catch (entityError) {
          logger.warn('Entity write failed — skipping entity', {
            docId, chunkIndex: chunk.index, entityKey: entity.key, error: entityError.message,
          });
        }
      }

      // 5f. Relations
      for (const rel of relations) {
        if (!rel.fromKey || !rel.toKey) continue;
        try {
          await createRelatedToLink(rel.fromKey, rel.toKey, rel.relation);
        } catch (relError) {
          logger.warn('Relation write failed — skipping relation', {
            docId, chunkIndex: chunk.index, fromKey: rel.fromKey, toKey: rel.toKey, error: relError.message,
          });
        }
      }

      chunkCount++;
      onProgress?.(`Chunk ${chunk.index + 1}/${chunks.length} done`);
    } catch (error) {
      failedChunks++;
      logger.error('Chunk processing failed — skipping chunk', {
        docId, chunkIndex: chunk.index, step: 'chunk_processing', error: error.message, stack: error.stack,
      });
    }
  }

  if (failedChunks > 0 && failedChunks > chunks.length / 2) {
    logger.warn('Over 50% of chunks failed — document may be poorly ingested', {
      docId, filename, failedChunks, totalChunks: chunks.length,
    });
  }

  // ── Step 7: Sequential NEXT/PREV links ────────────────────────────────────
  if (chunkCount > 1) {
    await linkChunksSequentially(docId);
  }

  logger.info('Document ingested', { docId, filename, chunkCount, entitiesWritten, failedChunks });
  return { docId, filename, lang: language, chunkCount, entitiesWritten, summary };
}
