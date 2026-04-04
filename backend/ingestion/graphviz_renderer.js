/**
 * ingestion/graphviz_renderer.js — render Graphviz DOT source to SVG buffers.
 *
 * Uses @hpcc-js/wasm (pure WASM — no system `dot` binary required).
 * The Graphviz instance is lazy-loaded and reused across calls.
 */

import crypto from 'crypto';
import { Graphviz } from '@hpcc-js/wasm';
import { logger }   from '../utils/logger.js';

/** @type {import('@hpcc-js/wasm').Graphviz | null} */
let _gv = null;

async function getGraphviz() {
  if (!_gv) _gv = await Graphviz.load();
  return _gv;
}

/**
 * Renders a DOT source string to an SVG string.
 *
 * @param {string} dot  - raw DOT source (the contents of the graphviz fenced block)
 * @returns {Promise<string>}  - SVG markup string
 */
export async function dotToSvg(dot) {
  const gv = await getGraphviz();
  return gv.dot(dot);
}

/**
 * Renders all graphviz fenced blocks in a Markdown string to SVG, replacing
 * each block with an [IMAGE_REF:graphviz-<hash>.svg] token.
 *
 * Fenced block syntax recognised (attrs after language tag are ignored):
 *   ```graphviz ...
 *   <DOT source>
 *   ```
 *
 * @param {string} markdown  - raw Markdown text (after front-matter stripping)
 * @returns {Promise<{ markdown: string, generatedImages: Map<string, Buffer> }>}
 *   - `markdown`        — text with graphviz blocks replaced by IMAGE_REF tokens
 *   - `generatedImages` — zipPath-style key → SVG buffer, ready to merge into imageMap
 */
export async function renderGraphvizBlocks(markdown) {
  // Match ``` graphviz (with optional attrs) ... ``` blocks
  const GRAPHVIZ_BLOCK_RE = /^```graphviz[^\n]*\n([\s\S]*?)^```/gm;

  /** @type {Map<string, Buffer>} */
  const generatedImages = new Map();

  let result = markdown;
  const matches = [...markdown.matchAll(GRAPHVIZ_BLOCK_RE)];

  for (const match of matches) {
    const [fullBlock, dotSource] = match;
    const hash = crypto.createHash('sha256').update(dotSource).digest('hex').slice(0, 12);
    const filename = `graphviz-${hash}.svg`;

    try {
      const svg     = await dotToSvg(dotSource.trim());
      const buf     = Buffer.from(svg, 'utf8');
      const token   = `[IMAGE_REF:${filename}]`;

      generatedImages.set(filename, buf);
      result = result.replace(fullBlock, token);
    } catch (err) {
      logger.warn('Graphviz render failed — block removed', { filename, error: err.message });
      // Remove the unrenderable block so it does not pollute chunk text
      result = result.replace(fullBlock, '');
    }
  }

  return { markdown: result, generatedImages };
}
