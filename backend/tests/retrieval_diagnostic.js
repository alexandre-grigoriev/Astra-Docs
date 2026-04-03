/**
 * Diagnostic: prints full ranking + images for the Concept & Design query.
 * Run while the backend server is running (Neo4j must be accessible):
 *   node tests/retrieval_diagnostic.js
 */
import 'dotenv/config';
import { searchKnowledgeBase } from '../retrieval/query_pipeline.js';
import { closeDriver }         from '../graph/driver.js';

const QUERY = 'i would like to have full overview of ASTRA MODEL BLOCKS Concept and Design';

const results = await searchKnowledgeBase(QUERY, 10);

console.log(`\nQuery: "${QUERY}"`);
console.log(`Total results: ${results.length}\n`);
console.log('Rank | Score  | File           | Images');
console.log('-----|--------|----------------|-------');
results.forEach((r, i) => {
  const score   = typeof r.score === 'number' ? r.score.toFixed(4) : String(r.score);
  const file    = (r.filename ?? 'null').padEnd(16);
  const images  = (r.images ?? []).map(u => u.split('/').pop()).join(', ') || '(none)';
  console.log(`  ${String(i+1).padStart(2)} | ${score} | ${file} | ${images}`);
});

// What the frontend would pick
const topFile   = results.find(r => r.filename)?.filename ?? null;
const topImages = [...new Set(results.filter(r => r.filename === topFile).flatMap(r => r.images ?? []))];
console.log(`\nFrontend would show images from: ${topFile}`);
console.log('Images:', topImages.map(u => u.split('/').pop()).join(', ') || '(none)');

await closeDriver();
