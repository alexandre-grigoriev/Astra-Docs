---
name: Graphviz diagram ingestion — SVG rendering pipeline
description: How graphviz fenced blocks in Markdown docs are rendered to SVG during ingestion
type: project
---

Markdown source files (e.g. `test_data_docs/andor-docs/Acquisition.md`) contain ` ```graphviz ` fenced blocks with DOT source.

**Implementation (2026-04-04):**
- `backend/ingestion/graphviz_renderer.js` — new file; lazy-loads `@hpcc-js/wasm` (pure WASM, no system `dot` binary); `renderGraphvizBlocks()` replaces each block with `[IMAGE_REF:graphviz-<sha256>.svg]` and returns SVG buffers in a `Map<string, Buffer>`
- `backend/ingestion/extractor.js` — `extractMarkdown()` calls `renderGraphvizBlocks()` before stripping code blocks; returns `generatedImages` in `ExtractionResult`
- `backend/ingestion/pipeline.js` — merges `generatedImages` into `imageMap` so `image_resolver.js` saves SVGs to `uploads/kb-images/<docId>/` and returns public URLs, exactly like PNGs

**Tests:** `backend/tests/graphviz_renderer.test.js` — unit tests for `dotToSvg` and `renderGraphvizBlocks`, uses `Acquisition.md` as fixture.

**Why SVG:** Graphviz native output, scales perfectly, served as static files via existing image URL infrastructure.
**How to apply:** When adding support for new diagram types (Mermaid, PlantUML), follow the same pattern — render to buffer, inject `IMAGE_REF` token, merge into `imageMap`.
