/**
 * ingestion/image_resolver.js — resolve [IMAGE_REF:path] tokens to disk files and public URLs.
 *
 * Per RAG_PIPELINE.md A.5.
 */

import path   from 'path';
import fs     from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { logger }  from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the kb-images directory on disk.
 *  image_resolver.js lives at backend/ingestion/, so ../../uploads → project root /uploads */
export const KB_IMAGES_DIR = path.join(__dirname, '..', '..', 'uploads', 'kb-images');

const IMAGE_REF_RE = /\[IMAGE_REF:([^\]]+)\]/g;

/**
 * @typedef {object} ResolvedChunk
 * @property {string}   cleanText - chunk text with all IMAGE_REF tokens removed
 * @property {string[]} images    - resolved public URLs for images found in this chunk
 */

/**
 * Resolves [IMAGE_REF:path] tokens in a chunk to disk files and public URLs.
 *
 * @param {{ index: number, text: string, wordCount: number }} chunk
 * @param {string}              docId       - document UUID
 * @param {string}              mdFilePath  - path of the .md file inside ZIP (e.g. "folder/doc.md")
 * @param {Map<string, Buffer>} imageMap    - zipPath → buffer (empty Map for non-ZIP uploads)
 * @returns {Promise<ResolvedChunk>}
 */
export async function resolveChunkImages(chunk, docId, mdFilePath, imageMap) {
  const images = [];

  // Directory of the .md file within the ZIP (uses POSIX separators for zip paths)
  const mdDir = mdFilePath.includes('/') ? mdFilePath.split('/').slice(0, -1).join('/') : '';

  const matches = [...chunk.text.matchAll(IMAGE_REF_RE)];

  for (const [, imgRef] of matches) {
    // Resolve the ref relative to the .md file's directory (POSIX path arithmetic)
    const resolvedZipPath = resolveZipPath(mdDir, imgRef);

    // Security: reject path traversal attempts
    if (resolvedZipPath.includes('../') || resolvedZipPath.startsWith('/')) {
      logger.warn('Image path traversal rejected', { imgRef, resolvedZipPath });
      continue;
    }

    const buf = imageMap.get(resolvedZipPath);
    if (!buf) {
      logger.warn('Image not found in imageMap', { imgRef, resolvedZipPath, docId });
      continue;
    }

    // Relative path on disk preserves subfolder structure
    const relPath = resolvedZipPath; // e.g. "folder/sub/image.png"
    const savePath = path.join(KB_IMAGES_DIR, docId, relPath.replace(/\//g, path.sep));

    // Create parent dirs
    fs.mkdirSync(path.dirname(savePath), { recursive: true });

    // Never overwrite an existing file with different content
    if (fs.existsSync(savePath)) {
      const existing = fs.readFileSync(savePath);
      const existingHash = crypto.createHash('sha256').update(existing).digest('hex');
      const newHash      = crypto.createHash('sha256').update(buf).digest('hex');
      if (existingHash !== newHash) {
        logger.warn('Image hash mismatch — keeping existing file', { savePath });
      }
      // Either identical or conflict: keep existing, still return the URL
    } else {
      fs.writeFileSync(savePath, buf);
    }

    images.push(`/uploads/kb-images/${docId}/${relPath}`);
  }

  // Strip all IMAGE_REF tokens from the text
  const cleanText = chunk.text
    .replace(IMAGE_REF_RE, '')
    .replace(/  +/g, ' ')
    .trim();

  return { cleanText, images };
}

// ---------------------------------------------------------------------------

/**
 * Resolves a relative image path against the directory of the .md file in the ZIP.
 * Uses POSIX path logic (ZIP paths are always forward-slash).
 *
 * @param {string} mdDir   - directory portion of the .md file's zip path (may be '')
 * @param {string} imgRef  - raw path from IMAGE_REF token (e.g. './Concept/image.png')
 * @returns {string}       - normalised zip path (e.g. 'folder/Concept/image.png')
 */
function resolveZipPath(mdDir, imgRef) {
  // Remove leading ./
  const cleaned = imgRef.replace(/^\.\//, '');

  if (mdDir) {
    // Join: "folder/sub" + "image.png" → "folder/sub/image.png"
    // Handle ../ by normalising the joined path
    const joined = `${mdDir}/${cleaned}`;
    return normalisePosix(joined);
  }
  return normalisePosix(cleaned);
}

/**
 * Normalises a POSIX path by resolving '..' and removing redundant '.'.
 *
 * @param {string} p
 * @returns {string}
 */
function normalisePosix(p) {
  const parts = p.split('/');
  const result = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.') {
      result.push(part);
    }
  }
  return result.join('/');
}
