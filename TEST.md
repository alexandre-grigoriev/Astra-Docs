# TEST.md — Test Suites

All test files live in `tests/` at the repo root and are run with the Node.js
built-in test runner — no extra packages required.

> `tests/` is git-ignored. Run tests from the **repo root**.

---

## Suite 1 — Graphviz Renderer (unit)

**File:** `tests/graphviz_renderer.test.js`  
**Run:** `node --test tests/graphviz_renderer.test.js`  
**Prerequisites:** `.env` present (needed by `config.js` for `SVG_MAX_WIDTH` / `SVG_MAX_HEIGHT`)

Tests `backend/ingestion/graphviz_renderer.js` — the module that renders
`` ```graphviz `` fenced blocks in Markdown files to SVG during ingestion.

### Test 1 — dotToSvg: valid SVG output
Renders `digraph { A -> B }` and asserts the result is a string containing `<svg` and `</svg>`.

### Test 2 — dotToSvg: node labels preserved
Asserts that node labels (`Alpha`, `Beta`) appear verbatim in the SVG output.

### Test 3 — dotToSvg: rejects invalid DOT
Asserts that malformed DOT source causes a rejection (error thrown).

### Test 4 — renderGraphvizBlocks: processes Acquisition.md fixture
Reads `test_data_docs/andor-docs/Acquisition.md` (contains one `` ```graphviz `` block)
and asserts `generatedImages.size >= 1` and no `` ```graphviz `` fence remains in the output.

### Test 5 — renderGraphvizBlocks: Acquisition.md SVG is valid
Asserts the rendered buffer starts with valid SVG markup and contains the label
`Acquisition` from the DOT source's `Title` node.

### Test 6 — renderGraphvizBlocks: IMAGE_REF token injected
Asserts the output Markdown contains `[IMAGE_REF:graphviz-<hash>.svg]` in place
of the original fenced block.

### Test 7 — renderGraphvizBlocks: deterministic filenames
Runs `renderGraphvizBlocks` twice on the same input and asserts both `Map` keys are identical.
Guarantees idempotent ingestion (same DOT → same filename → `MERGE` in Neo4j is safe).

### Test 8 — disk output: SVG written to tests/output/
Writes all rendered SVGs to `tests/output/` and asserts each file exists and is non-empty.
**Inspect the result:** open `tests/output/graphviz-f4f541340df1.svg` in a browser or VS Code.

### Test 9 — diagram-only file produces a chunk (chunker IMAGE_REF exception)
`Acquisition.md` has no text — only a diagram. Asserts that `chunkText()` still produces
at least one chunk (the `IMAGE_REF` token triggers the minimum-word exception in `chunker.js`).

### Test 10 — full pipeline: SVG saved to disk and public URL returned
Runs the full extractor → chunker → image_resolver chain on `Acquisition.md`.
Asserts: public URL ends in `.svg`, contains the doc ID, file exists on disk with correct
`width`, `height`, and `viewBox` SVG attributes (required for `<img>` sizing in the frontend).

### Test 11 — no-op on plain Markdown
Asserts that Markdown with no `` ```graphviz `` blocks is returned unchanged and
`generatedImages` is empty.

### Last run
```
TAP version 13
ok 1 - dotToSvg renders a minimal digraph to valid SVG
ok 2 - dotToSvg output contains expected node labels
ok 3 - dotToSvg rejects invalid DOT source
ok 4 - renderGraphvizBlocks processes Acquisition.md fixture
ok 5 - Acquisition.md graphviz block renders to a valid SVG buffer
ok 6 - IMAGE_REF token is injected in place of the graphviz block
ok 7 - rendering is deterministic — same DOT source produces same filename
ok 8 - Acquisition.md graphviz block is written to tests/output/
ok 9 - diagram-only file produces a chunk (chunker IMAGE_REF exception)
ok 10 - full pipeline: SVG is saved to disk and public URL is returned
ok 11 - renderGraphvizBlocks is a no-op on markdown with no graphviz blocks

# tests 11  pass 11  fail 0  duration_ms ~663
```
Date: 2026-04-07

---

## Suite 2 — Retrieval Pipeline (integration)

**File:** `tests/retrieval.test.js`  
**Run:** `node --env-file=backend/.env --test tests/retrieval.test.js`  
**Prerequisites:**
- Neo4j running on `bolt://localhost:7687`
- `astra-model.zip` and `andor-docs.zip` both ingested (Batch processing tab)
- `backend/.env` present with `NEO4J_*` and `GEMINI_API_KEY`

---

### Test Group 1 — Astra Model: Concept & Design Query

**Query:** `"i would like to have full overview of ASTRA MODEL BLOCKS Concept"`  
**Source document:** `test_data_docs/astra-model/Block/Concept.md`  
**Expected image:** `test_data_docs/astra-model/Block/Concept/Block-Concept.png`

#### Test 1 — Basic retrieval
`searchKnowledgeBase()` returns at least 1 result.

#### Test 2 — Concept.md in top-5
`Concept.md` appears in the filenames of the top 5 scored chunks.

#### Test 3 — Concept.md is the top-ranked result
`Concept.md` is rank 1. Design.md may legitimately rank higher for "design" queries but
this query is purely about Concept.

#### Test 4 — Frontend shows Block-Concept.png, no sandbox images
Simulates frontend image selection (top-2 unique files). Images must contain
`Block-Concept.png` and must not contain any `Sandbox` image.

#### Test 5 — Block-Concept.png present in Concept.md chunks
At least one chunk from `Concept.md` has an image URL containing `Block-Concept.png`.

#### Test 6 — No sandbox images in Concept.md chunks
Guards against `Examples.md` images leaking into `Concept.md` results.

### Test Group 2 — Data Integrity

**Query:** `"ASTRA BLOCKS dataflow"`

#### Test 7 — No malformed chunks
Every result has a non-empty `chunkId` and non-empty `text`.

---

### Test Group 3 — Andor acquisition process

**Query:** `"what is an Andor acquisition process ?"`  
**Source documents:** `abstract.md`, `BLOCKS.md`, `connections.md`, `parametersAndSetupUI.md`  
**Expected diagrams:** `AndorHW.svg`, `AndorBlock.svg` (from `BLOCKS.md` chunks)  
**Regression guard:** previously regressed from rich multi-source answer with diagram to thin answer with no images after re-ingestion.

#### Test 8 — Returns results
`searchKnowledgeBase()` returns at least 1 result.

#### Test 9 — abstract.md and BLOCKS.md both appear
Both primary source documents surface for this query.

#### Test 10 — BLOCKS.md or abstract.md in top-5
At least one of the two primary sources ranks in the top 5.

#### Test 11 — At least one result chunk has images
Guards against diagram-loss regression — verifies that SVG files saved to
`uploads/kb-images/` are stored on chunk nodes and returned by the retrieval pipeline.

#### Test 12 — AndorHW.svg or AndorBlock.svg in BLOCKS.md chunk images
Specifically asserts the hardware diagram is attached to `BLOCKS.md` chunks.

### Last run
```
TAP version 13
ok 1 - searchKnowledgeBase returns results for a known query
not ok 2 - Concept.md is in the top-5 results         ← astra-model not yet re-ingested
not ok 3 - Concept.md is the top-ranked result (rank 1)
not ok 4 - Frontend image selection includes Block-Concept.png and no sandbox images
not ok 5 - Block-Concept.png is in the images of a Concept.md chunk
ok 6 - Concept.md chunks have no sandbox images
ok 7 - No result has undefined chunkId or empty text
ok 8 - [andor] returns results
ok 9 - [andor] abstract.md and BLOCKS.md both appear in results
ok 10 - [andor] BLOCKS.md appears in top-5
ok 11 - [andor] at least one result chunk has images (SVG diagrams from BLOCKS.md)
ok 12 - [andor] AndorHW.svg or AndorBlock.svg present in BLOCKS.md chunk images

# tests 12  pass 8  fail 4  duration_ms ~12000
```
Date: 2026-04-07  
Note: tests 2–5 will pass once `astra-model.zip` is re-ingested with the current pipeline.

**Regression guard — duplicate images (fixed 2026-04-07):**  
Batch re-ingest now calls `purgeByFilepath()` before each file, so old chunks and image URLs are
removed from Neo4j and disk before new ones are written. Previously, re-ingesting a ZIP left stale
`KBDocument` nodes with old image URLs that caused duplicate (and partially broken) images in chat.
