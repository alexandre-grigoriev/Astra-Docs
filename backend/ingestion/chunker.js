/**
 * ingestion/chunker.js — 500-word sliding-window chunker.
 *
 * Per RAG_PIPELINE.md A.4:
 * - Window: 500 words, step: 450 words (50-word overlap)
 * - [IMAGE_REF:path] tokens count as one word and are never split
 * - Chunks with fewer than 20 words are discarded (end-of-document remnants)
 * - Returns Chunk[] with { index, text, wordCount }
 */

const WINDOW_SIZE = 500;
const STEP_SIZE   = 450; // window - overlap(50)
const MIN_WORDS   = 20;

/**
 * @typedef {object} Chunk
 * @property {number} index     - 0-based position in document
 * @property {string} text      - chunk text with IMAGE_REF tokens intact
 * @property {number} wordCount
 */

/**
 * Splits text into overlapping word-based chunks.
 *
 * @param {string} text - full extracted text (with IMAGE_REF tokens)
 * @returns {Chunk[]}
 */
export function chunkText(text) {
  // [IMAGE_REF:path] tokens contain no spaces so they naturally split as one word
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let pos = 0;

  while (pos < words.length) {
    const slice = words.slice(pos, pos + WINDOW_SIZE);
    const wordCount = slice.length;

    const chunkText = slice.join(' ');
    // Keep chunks that meet the word minimum OR contain at least one IMAGE_REF
    // (a diagram-only file would otherwise produce zero chunks and lose its images)
    if (wordCount >= MIN_WORDS || chunkText.includes('[IMAGE_REF:')) {
      chunks.push({
        index: chunks.length,
        text: chunkText,
        wordCount,
      });
    }

    pos += STEP_SIZE;
  }

  return chunks;
}
