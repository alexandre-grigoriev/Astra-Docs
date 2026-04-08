# ROOTCASES.md — Root Cause Registry

Documented root causes of significant bugs found and fixed during development.
Each entry records what failed, why it failed, and what was changed to fix it.

---

## RC-001 — HAS_CHUNK = 0 (no chunks linked to documents)

**Symptom:** Knowledge base search returned 0 results. Documents appeared in the
graph but no `HAS_CHUNK` relationships existed.

**Root cause:** In `backend/ingestion/pipeline.js`, `upsertDocument()` was called
*after* the chunk loop. `upsertChunk()` contained a `MATCH (d:KBDocument { id: $docId })`
that found nothing because the document node didn't exist yet, so the `HAS_CHUNK`
relationship was never created.

**Fix:** Moved `upsertDocument()` call to *before* the chunk loop.

**File:** `backend/ingestion/pipeline.js`

---

## RC-002 — Wrong Neo4j vector index names

**Symptom:** All 4 retrieval strategies silently returned empty arrays.

**Root cause:** Strategy queries used index names `chunk_embedding_index` and
`entity_embedding_index`, but the actual indexes created by `schema.js` are
named `kb_chunk_embedding` and `kb_entity_embedding`. The mismatch caused
`db.index.vector.queryNodes()` to fail silently (errors were caught and logged
at WARN level but not surfaced to the user).

**Fix:** Replaced all occurrences in `backend/retrieval/strategies.js`.

**File:** `backend/retrieval/strategies.js`

---

## RC-003 — Float passed to Neo4j LIMIT / queryNodes procedure argument

**Symptom:** Neo4j rejected the `topK` parameter with a type error.

**Root cause:** The neo4j-driver sends plain JS numbers as floating-point. Neo4j
requires integer arguments for `LIMIT` clauses and vector procedure parameters.

**Fix:** Wrapped every `$topK` and `$seedK` occurrence in `toInteger()` within
the Cypher queries.

**File:** `backend/retrieval/strategies.js`

---

## RC-004 — UNION variable scoping in sequentialNeighbors Cypher

**Symptom:** The sequential-neighbor strategy crashed with a Cypher compilation
error about undefined variables in the second UNION branch.

**Root cause:** In a Cypher `UNION`, the second branch cannot reference variables
introduced in the first branch. The original query tried to use `seed` (defined
in the first `CALL … YIELD` block) in the second `UNION` branch.

**Fix:** Rewrote the query using `OPTIONAL MATCH` + `UNWIND [prev, nxt]` instead
of `UNION`, keeping everything within a single scope.

**File:** `backend/retrieval/strategies.js`

---

## RC-005 — graphTraversal integer scores dominated vector cosine scores

**Symptom:** After RC-002 and RC-003 were fixed and results appeared, the ranking
was wrong — graph-traversal results dominated regardless of semantic relevance.

**Root cause:** `graphTraversal` returns `count(related)` as its score (integer
values such as 22). Vector strategies return cosine similarities (0.85–0.99).
Without any normalisation the traversal count dominated: a chunk with count=22
ranked above a chunk with cosine=0.99.

**Fix (first attempt):** Per-strategy min-max normalisation in `merger.js`.
This solved the scale mismatch but introduced RC-006.

**File:** `backend/retrieval/merger.js`

---

## RC-006 — entityVectorSearch returned duplicate chunkIds, inflating scores

**Symptom:** After adding per-strategy normalisation, Design.md had a merged score
of 3.14 — far above the theoretical maximum of ~1.55. Concept.md ranked third
even with a keyword boost applied.

**Root cause:** `entityVectorSearch` joins matched entities back to chunks via
`MATCH (c:KBChunk)-[:MENTIONS]->(e)`. A single chunk can MENTION many entities.
If several of those entities all appear in the top-K entity results, the same
`chunkId` appears multiple times in the result set, and the merger accumulated its
score contribution once per occurrence. For Design.md (a rich document with many
entity connections) this multiplied its effective score several times over.

**Fix:** Added intra-strategy deduplication inside `mergeResults()` — before
processing each strategy's records, build a per-`chunkId` map keeping only the
highest-scoring occurrence. This is done independently per strategy so cross-strategy
accumulation (the intentional weighted sum) is unaffected.

**File:** `backend/retrieval/merger.js`

---

## RC-007 — Min-max normalisation of chunkVector destroyed keyword boost effectiveness

**Symptom:** Even after RC-006, Design.md still ranked above Concept.md for the
query *"i would like to have full overview of ASTRA MODEL BLOCKS Concept"*, and
a 30 % filename keyword boost was insufficient to correct the ranking.

**Root cause:** Applying min-max normalisation to chunkVector scores within the
result batch amplified small absolute cosine differences into large relative
ones. For example, cosine scores 0.88 and 0.91 (range 0.03) normalise to 0.33
and 1.0 — a 3× difference. A 30 % multiplicative boost on 0.33 gives 0.43,
which is still far below 1.0. The normalisation effectively cancelled any
document-name keyword signal.

**Fix:** Vector strategies (chunkVector, entityVector) now use **raw cosine scores**
without normalisation; their absolute values are already meaningful and comparable.
Only `graphTraversal` (integer counts) is normalised before its small weight
(0.15) is applied. The keyword boost was kept at 30 %.

The final merger weights: `chunkVector × 1.0 (raw) + entityVector × 0.4 (raw) +
graphTraversal × 0.15 (normalised)`.

**File:** `backend/retrieval/merger.js`, `backend/retrieval/query_pipeline.js`

---

## RC-008 — Wrong image shown (sandbox screenshots instead of Block-Concept.png)

**Symptom:** Asking about "ASTRA MODEL BLOCKS Concept" showed 7 sandbox
screenshots from `Examples.md` instead of the concept diagram `Block-Concept.png`
from `Concept.md`.

**Root cause (ranking):** Due to RC-005 through RC-007, `Examples.md` ranked in
the top-2 unique files. `gemini.ts` collects images from the top-2 unique files
in the result list. With `Examples.md` ranked #2, its 7 sandbox images were
included while `Concept.md`'s concept diagram was not.

**Root cause (image path):** `KB_IMAGES_DIR` in `image_resolver.js` was computed
using `process.cwd()`, which is unpredictable depending on how the server is
started. Images were saved to a different path than they were served from.

**Fix (ranking):** See RC-005 through RC-007.
**Fix (image path):** Changed `KB_IMAGES_DIR` to use `import.meta.url` + `fileURLToPath`
to derive an absolute path relative to the source file itself.

**Files:** `backend/ingestion/image_resolver.js`, `backend/retrieval/merger.js`,
`backend/retrieval/query_pipeline.js`

---

## RC-009 — enricher.js JSON truncated (maxTokens too low)

**Symptom:** Chunk enrichment silently fell back to using raw `cleanText` with
zero extracted entities, causing poor graph connectivity and weak graph traversal.

**Root cause:** `callGeminiJson()` inside `enricher.js` was called with
`maxTokens: 1000`. For longer chunks, Gemini's response JSON was truncated
mid-object, causing the JSON parse to fail. The catch block fell back to
`{ enrichedText: cleanText, entities: [] }`.

**Fix:** Increased `maxTokens` from 1000 to 2000.

**File:** `backend/ingestion/enricher.js`

---

## RC-010 — Reset endpoint deleted 0 nodes (wrong Cypher traversal)

**Symptom:** "Reset Knowledge Base" appeared to succeed but documents, chunks,
and entities remained in the graph.

**Root cause:** The reset Cypher was:
```cypher
MATCH (n:KBDocument)-[:HAS_CHUNK]->(c:KBChunk) DETACH DELETE n, c
```
Because `HAS_CHUNK` relationships were missing (RC-001), this pattern matched
nothing and deleted nothing.

**Fix:** Changed the reset query to delete all KB nodes directly by label:
```cypher
MATCH (n) WHERE n:KBChunk OR n:KBEntity OR n:KBDocument DETACH DELETE n
```

**File:** `backend/routes/knowledgeBase.js`

---

## RC-011 — Documents tab crash (lang field null)

**Symptom:** Clicking the Documents tab caused a React crash:
`Cannot read properties of null (reading 'toUpperCase')`.

**Root cause:** `listDocuments()` in `graph/queries/document.js` returned the
`language` property as-is from Neo4j. Nodes ingested before the `language`
property was added had `null` for that field. The frontend called
`doc.lang.toUpperCase()` without a null guard.

**Fix:** Added `?? 'en'` default in the graph query return mapping and renamed
the field to `lang` (matching the frontend's expected key name).

**File:** `backend/graph/queries/document.js`

---

## RC-012 — KB images written to wrong path inside Docker (404 after ingestion)

**Symptom:** Images were ingested and appeared to succeed, but all
`/uploads/kb-images/…` URLs returned 404 when running in Docker.
Files were not found in the mounted volume at `data/uploads/kb-images/` on the
host.

**Root cause:** `KB_IMAGES_DIR` in `image_resolver.js` was computed as:
```js
path.join(__dirname, '..', '..', 'uploads', 'kb-images')
```
Inside the Docker container `__dirname` resolves to `/app/backend/ingestion/`,
so images were written to `/app/uploads/kb-images/` — a path **inside the
container image layer**, not in the mounted volume at `/data/uploads/`.
The `UPLOADS_DIR=/data/uploads` environment variable injected by
`docker-compose.yml` was completely ignored.

**Fix:** Changed `KB_IMAGES_DIR` to respect `UPLOADS_DIR`:
```js
export const KB_IMAGES_DIR = path.join(
  process.env.UPLOADS_DIR ?? path.join(__dirname, '..', '..', 'uploads'),
  'kb-images'
);
```
With `UPLOADS_DIR=/data/uploads` set in compose, images are now written to
`/data/uploads/kb-images/` which is the volume-mounted path.

**File:** `backend/ingestion/image_resolver.js`

---

## RC-013 — Nginx static-assets regex intercepted `/uploads/` paths (SVG 404)

**Symptom:** After fixing RC-012, images were present on disk and visible inside
the container, but SVG files (Graphviz diagrams) still returned HTTP 404 from
Nginx. PNG/JPG files were also affected. Backend logs showed no request ever
reached the backend for these URLs.

**Root cause:** `docker/nginx.conf` had two relevant locations:
```nginx
# 1. static assets regex — matched FIRST
location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|…)$ {
    try_files $uri =404;   # looks in /usr/share/nginx/html — file not there → 404
}

# 2. backend proxy — never reached for image extensions
location ~ ^/(api|auth|uploads)(/.*)?$ {
    proxy_pass http://backend:3001;
}
```
In Nginx, **regex locations (`~`, `~*`) are tested in declaration order**.
A request for `/uploads/kb-images/docId/image.svg` matched the static-assets
regex first (because `.svg` is in the extension list) and hit `try_files $uri =404`
against the HTML root — where the file does not exist — returning 404 without
ever proxying to the backend.

**Fix:** Added a `location ^~ /uploads/` block **before** the static-assets regex:
```nginx
location ^~ /uploads/ {
    proxy_pass http://backend:3001;
    …
}
```
The `^~` (prefix with no-regex) modifier has higher Nginx priority than any
regex location and prevents further regex matching once it matches, so all
`/uploads/` paths are always proxied regardless of file extension.

**File:** `docker/nginx.conf`

---
