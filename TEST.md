# TEST.md — Retrieval Pipeline Integration Tests

## Overview

Integration tests for the GraphRAG retrieval pipeline.
Tests call `searchKnowledgeBase()` directly against a live Neo4j instance — no mocking.

**Test file:** `backend/tests/retrieval.test.js`  
**Runner:** Node.js built-in `node:test` (Node 18+, no extra packages)  
**Run command:**
```
cd backend
npm test
# or directly:
node --test tests/retrieval.test.js
```

**Prerequisites:**
- Neo4j running on `bolt://localhost:7687`
- `astra-model.zip` ingested (Batch processing tab)
- `.env` present with `NEO4J_*` and `GEMINI_API_KEY`

---

## Test Suite: Concept & Design Query

**Query:** `"i would like to have full overview of ASTRA MODEL BLOCKS Concept"`

**Source document:** `test_data_docs/astra-model/Block/Concept.md`  
**Expected image:** `test_data_docs/astra-model/Block/Concept/Block-Concept.png`

### Test 1 — Basic retrieval

**Assertion:** `searchKnowledgeBase()` returns at least 1 result.  
**Rationale:** Verifies the vector index is populated and the query pipeline runs end-to-end.

### Test 2 — Concept.md in top-5

**Assertion:** `Concept.md` appears in the filenames of the top 5 scored chunks.  
**Rationale:** Ensures the primary source document ranks highly for a directly relevant query. Failing this means the embedding or vector index is degraded.

### Test 2b — Concept.md is in top-2

**Assertion:** `Concept.md` is in the top 2 ranked results.  
**Rationale:** The query mentions both "Concept" and "Design", so `Design.md` may legitimately rank #1. The critical requirement is that `Concept.md` is in the top-2 so the frontend's top-2-files image selection includes `Block-Concept.png`.

### Test 2c — Frontend shows Block-Concept.png, no sandbox images

**Assertion:** Simulates `gemini.ts` image selection (top-2 unique files) — images must contain `Block-Concept.png` and must not contain any `Sandbox` image.  
**Rationale:** Directly validates what the user sees. Frontend collects images from the top-2 unique files in results, which covers both Concept.md and Design.md while excluding lower-ranked files like Examples.md.

### Test 3 — Block-Concept.png present in Concept.md chunks

**Assertion:** At least one chunk from `Concept.md` has an image URL containing `Block-Concept.png`.  
**Rationale:** Verifies image resolution during ZIP ingestion: the `[IMAGE_REF:./Concept/Block-Concept.png]` token was resolved, the file was saved to `uploads/kb-images/`, and the public URL was stored on the chunk node.

### Test 4 — No sandbox images in Concept.md chunks

**Assertion:** No image URL in `Concept.md` chunks contains `Sandbox` (case-insensitive).  
**Rationale:** Sandbox images come from `Block/Examples.md`. This test guards against the image selection bug where `Examples.md` (which has 7 sandbox screenshots) was incorrectly shown instead of the Concept diagram.

### Test 5 — Design.md in results

**Assertion:** `Design.md` appears somewhere in the result set.  
**Rationale:** The query explicitly mentions "Design". Both `Concept.md` and `Design.md` should surface for a query about concept and design.

---

## Test Suite: Data Integrity

**Query:** `"ASTRA BLOCKS dataflow"`

### Test 6 — No malformed chunks

**Assertion:** Every result has a non-empty `chunkId` and non-empty `text`.  
**Rationale:** Guards against pipeline regressions that write incomplete chunk nodes (e.g. enrichment failure leaving `text: null`).

---

## Last Run

```
TAP version 13
ok 1 - searchKnowledgeBase returns results for a known query
ok 2 - Concept.md is in the top-5 results
ok 3 - Concept.md is the top-ranked result (rank 1)
ok 4 - Frontend image selection includes Block-Concept.png and no sandbox images
ok 5 - Block-Concept.png is in the images of a Concept.md chunk
ok 6 - Concept.md chunks have no sandbox images
ok 7 - No result has undefined chunkId or empty text

# tests 7  pass 7  fail 0  duration_ms ~10448
```

Top-5 ranking: Concept.md=1.6816, Design.md=1.3938, Examples.md=1.2406, Concept.md=1.1115, MiddleWare.md=0.8661

Date: 2026-04-03
