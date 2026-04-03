/**
 * ingestion/extractor.js — text extraction from PDF, Markdown, DOCX.
 *
 * Returns { text, imageRefs, mimeType } per RAG_PIPELINE.md A.1.
 * All IMAGE_REF tokens are preserved for position-aware chunking.
 */

import pdfParse from 'pdf-parse';
import mammoth  from 'mammoth';

/**
 * @typedef {object} ExtractionResult
 * @property {string}   text      - extracted and normalised text
 * @property {string[]} imageRefs - all [IMAGE_REF:path] tokens found (MD only)
 * @property {'pdf'|'md'|'docx'} mimeType
 */

/**
 * Extracts text from a file buffer.
 *
 * @param {Buffer} fileBuffer
 * @param {string} filename
 * @returns {Promise<ExtractionResult>}
 */
export async function extractText(fileBuffer, filename) {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'pdf')  return extractPdf(fileBuffer);
  if (ext === 'md' || ext === 'markdown') return extractMarkdown(fileBuffer);
  if (ext === 'docx') return extractDocx(fileBuffer);

  throw new Error(`Unsupported file type: .${ext}. Supported: .pdf, .md, .docx`);
}

// ---------------------------------------------------------------------------

async function extractPdf(buffer) {
  const parsed = await pdfParse(buffer);
  // Strip control characters (except \n, \t) and normalize whitespace
  let text = parsed.text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]+/g, ' ');
  text = normalise(text);
  return { text, imageRefs: [], mimeType: 'pdf' };
}

function extractMarkdown(buffer) {
  let text = buffer.toString('utf8');

  // Strip YAML front matter (--- blocks at top of file)
  text = text.replace(/^---[\s\S]*?---\s*\n?/, '');

  // Replace image references with [IMAGE_REF:path] BEFORE stripping other syntax
  const imageRefs = [];
  text = text.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, _alt, imgPath) => {
    const token = `[IMAGE_REF:${imgPath.trim()}]`;
    imageRefs.push(`[IMAGE_REF:${imgPath.trim()}]`);
    return token;
  });

  // Strip remaining Markdown syntax
  text = text.replace(/```[^\n]*\n[\s\S]*?```/g, '');   // fenced code blocks
  text = text.replace(/`[^`]*`/g, '');                   // inline code
  text = text.replace(/^#{1,6}\s+/gm, '');               // headings
  text = text.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1'); // bold/italic *
  text = text.replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1');   // bold/italic _
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');   // non-image links
  text = text.replace(/<[^>]+>/g, '');                    // residual HTML tags

  text = normalise(text);
  return { text, imageRefs, mimeType: 'md' };
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  // Strip residual HTML tags mammoth may produce in edge cases
  let text = result.value.replace(/<[^>]+>/g, '');
  text = normalise(text);
  return { text, imageRefs: [], mimeType: 'docx' };
}

// ---------------------------------------------------------------------------

/**
 * Normalises line endings to \n and trims leading/trailing whitespace.
 *
 * @param {string} text
 * @returns {string}
 */
function normalise(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}
