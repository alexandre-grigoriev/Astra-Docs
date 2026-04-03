# RAG_PIPELINE.md — Ingestion & Query Implementation

> Implement every step exactly as specified. Do not skip steps or reorder them.
> Each step section includes the function signature, input/output contract,
> and the exact Gemini prompt or Cypher query to use.

---

## Part A — Ingestion Pipeline

### A.1 Text Extraction (`ingestion/extractor.ts`)

```typescript
interface ExtractionResult {
  text: string;          // raw extracted text
  imageRefs: string[];   // all [IMAGE_REF:path] tokens found (MD only)
  mimeType: 'pdf' | 'md' | 'docx';
}

async function extractText(
  fileBuffer: Buffer,
  filename: string
): Promise<ExtractionResult>
```

**Rules:**
- `.pdf` → use `pdf-parse`; strip control characters; normalize whitespace
- `.md` → strip YAML front matter (`---` blocks at top); strip markdown syntax
  (headings `#`, bold `**`, italic `*`, code fences ` ``` `);
  replace `![alt](path)` with `[IMAGE_REF:path]` **preserving position**
- `.docx` → use `mammoth` with default options; strip residual HTML tags
- After extraction, normalize all line endings to `\n`
- Trim leading/trailing whitespace from the full text

---

### A.2 Language Detection (`ingestion/pipeline.ts`)

```typescript
function detectLanguage(text: string): 'en' | 'fr'
```

**Rules:**
- Sample the **first 500 characters** of extracted text
- Count French indicator words: `['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'est', 'en', 'pour', 'dans', 'que', 'qui']`
- If French word count ≥ 3 → return `'fr'`; else return `'en'`
- This is a heuristic; do not use an external library

---

### A.3 Document Summary (`ingestion/pipeline.ts`)

```typescript
async function generateDocumentSummary(text: string): Promise<string>
```

**Gemini call:**
```
model: gemini-2.0-flash
max_tokens: 300

prompt:
"""
Summarize the following technical documentation in 2–3 sentences.
Focus on the main topic, key concepts, and intended audience.
Output only the summary, no preamble.

DOCUMENT:
{text.slice(0, 3000)}
"""
```

---

### A.4 Chunking (`ingestion/chunker.ts`)

```typescript
interface Chunk {
  index: number;          // 0-based position in document
  text: string;           // chunk text WITH IMAGE_REF tokens intact
  wordCount: number;
}

function chunkText(text: string): Chunk[]
```

**Algorithm:**
1. Split text into words on whitespace
2. Slide a window of **500 words**, step **450 words** (50-word overlap)
3. Join words back with single space
4. `[IMAGE_REF:path]` tokens count as one word each — never split them
5. Assign sequential `index` starting at 0
6. Discard chunks with fewer than 20 words (end-of-document remnants)

---

### A.5 Image Resolution (`ingestion/image_resolver.ts`)

```typescript
interface ResolvedChunk {
  cleanText: string;      // chunk text with IMAGE_REF tokens removed
  images: string[];       // resolved public URLs for this chunk
}

async function resolveChunkImages(
  chunk: Chunk,
  docId: string,
  mdFilePath: string,                     // path of .md inside ZIP or on disk
  imageMap: Map<string, Buffer>           // zipPath → buffer (empty for non-ZIP)
): Promise<ResolvedChunk>
```

**Algorithm:**
1. Extract all `[IMAGE_REF:path]` tokens from `chunk.text` with a global regex
2. For each ref:
   a. Resolve path relative to `mdFilePath`'s directory
   b. Look up in `imageMap`; if found, save to disk:
      `uploads/kb-images/<docId>/<resolved-relative-path>`
   c. Set public URL: `/uploads/kb-images/<docId>/<resolved-relative-path>`
   d. If not found in imageMap, skip silently (log warning)
3. Remove all `[IMAGE_REF:*]` tokens from text → `cleanText`
4. Return `{ cleanText, images: string[] }`

**Disk write rules:**
- Create parent directories with `fs.mkdirSync(..., { recursive: true })`
- Never overwrite an existing file with different content (check hash first)
- Preserve subfolder structure to avoid filename collisions

---

### A.6 LLM Enrichment (`ingestion/enricher.ts`)

```typescript
interface Entity {
  key: string;            // canonical snake_case identifier, e.g. "raman_spectrometer"
  type: string;           // e.g. "DEVICE", "CONCEPT", "PROCESS", "PERSON", "LOCATION"
  description: string;   // one sentence
}

interface Relation {
  fromKey: string;
  toKey: string;
  relation: string;       // e.g. "USES", "PART_OF", "PRODUCES", "REQUIRES"
}

interface EnrichedChunk {
  enrichedText: string;
  entities: Entity[];
  relations: Relation[];
}

async function enrichChunk(
  cleanText: string,
  documentSummary: string,
  chunkIndex: number,
  totalChunks: number
): Promise<EnrichedChunk>
```

**Gemini call:**
```
model: gemini-2.0-flash
max_tokens: 1000
response_mime_type: application/json

system:
"""
You are a technical documentation analyst.
You extract structured information from documentation chunks.
Always respond with valid JSON matching the schema exactly.
"""

prompt:
"""
DOCUMENT CONTEXT:
{documentSummary}

CHUNK {chunkIndex + 1} of {totalChunks}:
{cleanText}

Your tasks:
1. Rewrite this chunk as a self-contained paragraph. Resolve any pronouns
   to their referents. Add a one-sentence context prefix using the document summary.
   Keep technical terms exact. Output as "enrichedText".

2. Extract named entities. For each, provide:
   - key: canonical snake_case identifier (stable across documents)
   - type: one of DEVICE | CONCEPT | PROCESS | PERSON | LOCATION | ORGANIZATION | OTHER
   - description: one sentence defining this entity in this context

3. Extract relations between extracted entities only.
   Each relation: { fromKey, toKey, relation }
   Relation verbs: USES | PART_OF | PRODUCES | REQUIRES | CONNECTS_TO | DESCRIBED_BY | OTHER

Respond ONLY with this JSON structure:
{
  "enrichedText": "...",
  "entities": [{ "key": "...", "type": "...", "description": "..." }],
  "relations": [{ "fromKey": "...", "toKey": "...", "relation": "..." }]
}
"""
```

**Error handling:**
- If Gemini returns invalid JSON → log warning, use `cleanText` as `enrichedText`,
  set `entities: []`, `relations: []`
- Retry once on HTTP 429 or 503 with 2-second delay
- Never throw — always return a valid `EnrichedChunk`

---

### A.7 Embedding (`ingestion/embedder.ts`)

```typescript
async function embedText(text: string): Promise<number[]>  // float[3072]
```

**Rules:**
- Use Gemini `gemini-embedding-001`, task type `RETRIEVAL_DOCUMENT`
- Retry up to **3 times** on failure with exponential backoff: 1s, 2s, 4s
- If all retries fail → throw `EmbeddingError` with original message
- Input text must be ≤ 8192 tokens; if longer, truncate to 8000 chars before embedding

---

### A.8 Neo4j Write (`graph/queries/document.ts`)

**Node labels:** `KBDocument`, `KBChunk`, `KBEntity`
**Relationship types:** `HAS_CHUNK`, `NEXT`, `PREV`, `MENTIONS`, `RELATED_TO`

#### A.8.1 Upsert Document

```cypher
MERGE (d:KBDocument { id: $docId })
SET d.filename   = $filename,
    d.mimeType   = $mimeType,
    d.language   = $language,
    d.summary    = $summary,
    d.uploadedAt = $uploadedAt,
    d.wordCount  = $wordCount
RETURN d
```

#### A.8.2 Upsert Chunk

```cypher
MERGE (c:KBChunk { id: $chunkId })
SET c.docId        = $docId,
    c.index        = $chunkIndex,
    c.text         = $cleanText,
    c.enrichedText = $enrichedText,
    c.images       = $images,
    c.embedding    = $embedding,
    c.wordCount    = $wordCount
WITH c
MATCH (d:KBDocument { id: $docId })
MERGE (d)-[:HAS_CHUNK]->(c)
RETURN c
```

`$chunkId` format: `<docId>_chunk_<index>` (e.g. `abc123_chunk_0`)

#### A.8.3 Sequential Links (run after ALL chunks of a document are written)

```cypher
MATCH (d:KBDocument { id: $docId })-[:HAS_CHUNK]->(c:KBChunk)
WITH c ORDER BY c.index ASC
WITH collect(c) AS chunks
UNWIND range(0, size(chunks)-2) AS i
WITH chunks[i] AS curr, chunks[i+1] AS nxt
MERGE (curr)-[:NEXT]->(nxt)
MERGE (nxt)-[:PREV]->(curr)
```

#### A.8.4 Upsert Entity

```cypher
MERGE (e:KBEntity { key: $key })
SET e.type        = $type,
    e.description = $description,
    e.embedding   = $embedding
RETURN e
```

Entity embedding: embed `"$key: $description"` string.

#### A.8.5 Chunk→Entity Link

```cypher
MATCH (c:KBChunk { id: $chunkId })
MATCH (e:KBEntity { key: $key })
MERGE (c)-[:MENTIONS]->(e)
```

#### A.8.6 Entity→Entity Relation

```cypher
MATCH (a:KBEntity { key: $fromKey })
MATCH (b:KBEntity { key: $toKey })
MERGE (a)-[r:RELATED_TO { relation: $relation }]->(b)
```

---

### A.9 Pipeline Orchestrator (`ingestion/pipeline.ts`)

```typescript
async function ingestDocument(
  fileBuffer: Buffer,
  filename: string,
  docId: string,
  imageMap: Map<string, Buffer>,   // empty Map for non-ZIP uploads
  onProgress?: (msg: string) => void
): Promise<{ chunksWritten: number; entitiesWritten: number }>
```

**Execution order (strict):**
1. `extractText` → ExtractionResult
2. `detectLanguage`
3. `generateDocumentSummary`
4. `chunkText`
5. For each chunk (sequentially, not parallel — rate limit protection):
   a. `resolveChunkImages`
   b. `enrichChunk`
   c. `embedText` (on enrichedText)
   d. Neo4j write: upsert chunk
   e. For each entity: `embedText`, upsert entity, write MENTIONS link
   f. For each relation: write RELATED_TO link
6. Neo4j write: upsert document node (after all chunks succeed)
7. Neo4j write: sequential NEXT/PREV links
8. Return counts

**Error contract:**
- Any step throwing must be caught; log with `{ docId, chunkIndex, step, error }`
- If step 1 or 2 fails → rethrow (document is unprocessable)
- If a chunk step fails → skip that chunk, continue to next
- If > 50% of chunks fail → log critical warning but do not abort

---

## Part B — Query Pipeline

### B.1 Query Embedding

```typescript
async function embedQuery(query: string): Promise<number[]>
```

Use `gemini-embedding-001`, task type `RETRIEVAL_QUERY`.

---

### B.2 Retrieval Strategies (`retrieval/strategies.ts`)

All four run in parallel via `Promise.all`.

#### B.2.1 Chunk Vector Search

```cypher
CALL db.index.vector.queryNodes('kb_chunk_embedding', $topK, $queryEmbedding)
YIELD node AS c, score
RETURN c.id AS chunkId, score, c.text AS text, c.enrichedText AS enrichedText,
       c.images AS images, c.docId AS docId
ORDER BY score DESC
```

#### B.2.2 Entity Vector Search → Chunks

```cypher
CALL db.index.vector.queryNodes('kb_entity_embedding', $topK, $queryEmbedding)
YIELD node AS e, score
MATCH (c:KBChunk)-[:MENTIONS]->(e)
RETURN c.id AS chunkId, score, c.text AS text, c.enrichedText AS enrichedText,
       c.images AS images, c.docId AS docId
ORDER BY score DESC
LIMIT $topK
```

#### B.2.3 Graph Traversal (1–2 hops)

```cypher
CALL db.index.vector.queryNodes('kb_entity_embedding', $seedK, $queryEmbedding)
YIELD node AS seed
MATCH (seed)-[:RELATED_TO*1..2]-(related:KBEntity)
MATCH (c:KBChunk)-[:MENTIONS]->(related)
WITH c, count(related) AS relevance
RETURN c.id AS chunkId, toFloat(relevance) AS score,
       c.text AS text, c.enrichedText AS enrichedText,
       c.images AS images, c.docId AS docId
ORDER BY score DESC
LIMIT $topK
```

`$seedK = 5` (top 5 entities as seeds)

#### B.2.4 Sequential Neighbors

```cypher
CALL db.index.vector.queryNodes('kb_chunk_embedding', toInteger($seedK), $queryEmbedding)
YIELD node AS seed
OPTIONAL MATCH (prev:KBChunk)-[:NEXT]->(seed)
OPTIONAL MATCH (seed)-[:NEXT]->(nxt:KBChunk)
WITH [prev, nxt] AS neighbors
UNWIND neighbors AS neighbor
WITH neighbor WHERE neighbor IS NOT NULL
OPTIONAL MATCH (d:KBDocument { id: neighbor.docId })
RETURN neighbor.id AS chunkId, 0.5 AS score, neighbor.text AS text,
       neighbor.enrichedText AS enrichedText,
       coalesce(neighbor.images, []) AS images,
       neighbor.docId AS docId, d.filename AS filename, d.documentDate AS documentDate
```

`$seedK = 3` (top 3 chunks as seeds for neighbor expansion)

> Note: UNION was replaced with OPTIONAL MATCH + UNWIND because Cypher UNION creates
> independent subqueries — variables from the first branch are not in scope in the second.

---

### B.3 Merge & Deduplicate (`retrieval/merger.ts`)

```typescript
interface ScoredChunk {
  chunkId: string;
  score: number;
  text: string;
  enrichedText: string;
  images: string[];
  docId: string;
}

function mergeResults(resultSets: ScoredChunk[][]): ScoredChunk[]
```

**Algorithm:**
1. Flatten all result sets into one array
2. Group by `chunkId`
3. For each group, keep the **highest score**
4. Sort descending by score
5. Return top `topK` (default 10)

---

### B.4 Sequential Neighbor Expansion (`retrieval/expander.ts`)

After merging, fetch `PREV` and `NEXT` neighbors for each top chunk that is
not already in the result set. Cap final list at `topK + 2`.

```cypher
MATCH (c:KBChunk { id: $chunkId })
OPTIONAL MATCH (prev:KBChunk)-[:NEXT]->(c)
OPTIONAL MATCH (c)-[:NEXT]->(nxt:KBChunk)
RETURN prev, nxt
```

---

### B.5 Auto-Translation (`retrieval/translator.ts`)

```typescript
async function translateChunks(
  chunks: ScoredChunk[],
  targetLanguage: string
): Promise<ScoredChunk[]>
```

**Rules:**
- Skip entirely if `targetLanguage === 'fr'`
- Skip chunks where `docId` language is already `targetLanguage`
- Translate only French-language chunks to target
- Batch all translations into a single Gemini call:

```
prompt:
"""
Translate each numbered passage to {targetLanguageName}.
Preserve technical terms, product names, and formatting exactly.
Output ONLY the translated passages numbered the same way.

{chunks.map((c, i) => `[${i+1}]\n${c.enrichedText}`).join('\n\n')}
"""
```

- Parse response by `[N]` markers; update `enrichedText` in place
- On failure → keep original text (never throw)

---

### B.6 Prompt Assembly & Generation (`retrieval/query_pipeline.ts`)

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function runQueryPipeline(
  query: string,
  language: string,
  history: ChatMessage[],
  topK: number = 10
): Promise<{ text: string; images: string[] }>
```

**System prompt:**
```
You are Astra, an expert technical assistant for HORIBA documentation.
Answer in {languageName}.
Base your answer ONLY on the provided documentation chunks.
Cite document names naturally in your answer (they are labeled in brackets).
If the answer is not in the provided chunks, say so clearly.
Be precise, concise, and technical.
```

**Context injection (into final user message):**
```
DOCUMENTATION CONTEXT:
{chunks.map(c => `[${filename(c.docId)}]\n${c.enrichedText}`).join('\n\n---\n\n')}

USER QUESTION:
{query}
```

**Image collection:**
```typescript
const images = [...new Set(chunks.flatMap(c => c.images))];
```

**Return:** `{ text: geminiResponse, images }`

---

## Part C — Neo4j Index Definitions

Run once at server startup via `graph/schema.ts`:

```cypher
-- Chunk vector index
CREATE VECTOR INDEX kb_chunk_embedding IF NOT EXISTS
FOR (c:KBChunk) ON c.embedding
OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } }

-- Entity vector index
CREATE VECTOR INDEX kb_entity_embedding IF NOT EXISTS
FOR (e:KBEntity) ON e.embedding
OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } }

-- Unique constraints
CREATE CONSTRAINT kb_document_id IF NOT EXISTS FOR (d:KBDocument) REQUIRE d.id IS UNIQUE
CREATE CONSTRAINT kb_chunk_id    IF NOT EXISTS FOR (c:KBChunk)    REQUIRE c.id IS UNIQUE
CREATE CONSTRAINT kb_entity_key  IF NOT EXISTS FOR (e:KBEntity)   REQUIRE e.key IS UNIQUE
```

---

## Part D — Batch Processing & SSE (`ingestion/batch_processor.ts`)

```typescript
interface BatchJob {
  jobId: string;
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  errors: string[];
}
```

**SSE event types:**

| Event         | Data shape                                              |
|---------------|---------------------------------------------------------|
| `processing`  | `{ filename: string }`                                  |
| `file_done`   | `{ filename: string, chunks: number }`                  |
| `file_error`  | `{ filename: string, error: string }`                   |
| `done`        | `{ total: number, success: number, failed: number }`    |

**ZIP processing rules:**
1. Extract ZIP in memory with `jszip` or `adm-zip`
2. Collect all image files into `imageMap: Map<zipPath, Buffer>`
3. For each supported file (`.md`, `.pdf`, `.docx`):
   - Emit `processing`
   - Call `ingestDocument(buffer, filename, docId, imageMap)`
   - On success: emit `file_done`
   - On error: emit `file_error`, continue
4. After all files: emit `done`
5. `docId` = `nanoid()` or `crypto.randomUUID()` — consistent per file entry
