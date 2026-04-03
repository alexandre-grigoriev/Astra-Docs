/**
 * tests/retrieval.test.js — Integration tests for the RAG retrieval pipeline.
 *
 * Requires a running Neo4j instance with the astra-model data already ingested.
 * Run with:  node --test backend/tests/retrieval.test.js
 *
 * Uses Node.js built-in test runner (node:test) — no extra packages needed.
 */

import 'dotenv/config';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { searchKnowledgeBase } from '../retrieval/query_pipeline.js';
import { closeDriver }         from '../graph/driver.js';

const QUERY = 'i would like to have full overview of ASTRA MODEL BLOCKS Concept';

// ── Lifecycle ────────────────────────────────────────────────────────────────

after(async () => {
  await closeDriver();
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('searchKnowledgeBase returns results for a known query', async () => {
  const results = await searchKnowledgeBase(QUERY, 10);
  assert.ok(results.length > 0, 'Expected at least one result');
});

test('Concept.md is in the top-5 results', async () => {
  const results = await searchKnowledgeBase(QUERY, 10);
  const top5Files = results.slice(0, 5).map(r => r.filename);
  assert.ok(
    top5Files.includes('Concept.md'),
    `Expected Concept.md in top-5, got: ${top5Files.join(', ')}`
  );
});

test('Concept.md is the top-ranked result (rank 1)', async () => {
  // Pure Concept query — Design.md should not outrank Concept.md.
  const results = await searchKnowledgeBase(QUERY, 10);
  const rank1 = results[0]?.filename;
  assert.strictEqual(
    rank1,
    'Concept.md',
    `Expected Concept.md at rank 1.\nActual ranking:\n${
      results.map((r, i) => `  ${i+1}. ${r.filename}`).join('\n')
    }`
  );
});

test('Frontend image selection includes Block-Concept.png and no sandbox images', async () => {
  const results = await searchKnowledgeBase(QUERY, 10);

  // Simulate gemini.ts: images from top-2 unique files only
  const seenFiles = new Set();
  const topFiles = [];
  for (const r of results) {
    if (r.filename && !seenFiles.has(r.filename)) { seenFiles.add(r.filename); topFiles.push(r.filename); }
    if (topFiles.length === 2) break;
  }
  const allImages = [...new Set(results.filter(r => topFiles.includes(r.filename)).flatMap(r => r.images ?? []))];
  const imageNames = allImages.map(u => u.split('/').pop());

  const hasSandbox = allImages.some(u => u.toLowerCase().includes('sandbox'));
  assert.ok(
    !hasSandbox,
    `Frontend would show sandbox images.\nImages: ${imageNames.join(', ')}`
  );

  const hasConceptImg = allImages.some(u => u.includes('Block-Concept.png'));
  assert.ok(
    hasConceptImg,
    `Frontend would NOT show Block-Concept.png.\nImages: ${imageNames.join(', ') || '(none)'}`
  );
});

test('Block-Concept.png is in the images of a Concept.md chunk', async () => {
  const results = await searchKnowledgeBase(QUERY, 10);
  const conceptChunks = results.filter(r => r.filename === 'Concept.md');
  assert.ok(conceptChunks.length > 0, 'No Concept.md chunks found in results');

  const allImages = conceptChunks.flatMap(r => r.images ?? []);
  assert.ok(
    allImages.some(url => url.includes('Block-Concept.png')),
    `Expected Block-Concept.png in Concept.md chunk images.\nFound: ${allImages.join(', ') || '(none)'}`
  );
});

test('Concept.md chunks have no sandbox images', async () => {
  const results = await searchKnowledgeBase(QUERY, 10);
  const conceptChunks = results.filter(r => r.filename === 'Concept.md');
  const allImages = conceptChunks.flatMap(r => r.images ?? []);
  const sandboxImages = allImages.filter(url => url.toLowerCase().includes('sandbox'));
  assert.strictEqual(
    sandboxImages.length,
    0,
    `Concept.md chunks must not contain sandbox images. Found: ${sandboxImages.join(', ')}`
  );
});

test('No result has undefined chunkId or empty text', async () => {
  const results = await searchKnowledgeBase('ASTRA BLOCKS dataflow', 10);
  for (const r of results) {
    assert.ok(r.chunkId,      `Result missing chunkId: ${JSON.stringify(r)}`);
    assert.ok(r.text?.trim(), `Result has empty text for chunkId: ${r.chunkId}`);
  }
});
