# QUICK_REFERENCE.md — Astra Docs Cheat Sheet

> Print this mentally before every task. It's the 80% you'll need 80% of the time.

---

## Constants

```typescript
const CHUNK_SIZE_WORDS   = 500;
const CHUNK_OVERLAP_WORDS = 50;
const SUMMARY_CHARS      = 3000;
const EMBEDDING_DIMS     = 3072;
const DEFAULT_TOP_K      = 10;
const GRAPH_HOP_DEPTH    = 2;
const EMBED_TASK_DOCUMENT = 'RETRIEVAL_DOCUMENT';
const EMBED_TASK_QUERY    = 'RETRIEVAL_QUERY';
const GEMINI_LLM_MODEL    = 'gemini-2.0-flash';
const GEMINI_EMBED_MODEL  = 'gemini-embedding-001';
```

---

## Chunk ID Format

```
<docId>_chunk_<index>       e.g.  abc123_chunk_0
```

---

## Supported File Types

| Extension | Parser    | Notes                                       |
|-----------|-----------|---------------------------------------------|
| `.pdf`    | pdf-parse | Strip control chars, normalize whitespace   |
| `.md`     | regex     | Strip YAML front matter + markdown syntax   |
| `.docx`   | mammoth   | Strip residual HTML                         |
| images    | n/a       | Stored to disk, served via /uploads         |

---

## Entity Types (Gemini constraint)

```
DEVICE | CONCEPT | PROCESS | PERSON | LOCATION | ORGANIZATION | OTHER
```

---

## Relation Types (Gemini constraint)

```
USES | PART_OF | PRODUCES | REQUIRES | CONNECTS_TO | DESCRIBED_BY | OTHER
```

---

## Language Codes

```
en | fr | ar | ja | zh | ru
```

---

## File Paths

```
<project-root>/uploads/kb-images/<docId>/<relative-path>   ← disk storage
/uploads/kb-images/<docId>/<relative-path>                   ← public URL
```

---

## SSE Event Flow

```
processing → (file_done | file_error)* → done
```

---

## Retrieval Strategy Summary

| Strategy            | Index               | Output                        |
|---------------------|---------------------|-------------------------------|
| Chunk vector        | chunk_embedding_idx | Directly matched chunks       |
| Entity vector       | entity_embedding_idx| Chunks mentioning top entities|
| Graph traversal     | entity_embedding_idx| Chunks 1-2 hops from entities |
| Sequential neighbor | chunk_embedding_idx | PREV/NEXT of top chunks       |

All 4 run in parallel. Merge by highest score per chunkId. Expand ±1. Cap topK+2.

---

## Gemini Rate Limit Protection

- Chunk enrichment: **sequential** (never parallel)
- Entity embedding: **sequential**
- Retrieval: parallel is fine (read-only, no Gemini)
- Translation: single batched call

---

## Neo4j MERGE Cheat Sheet

```cypher
-- Document
MERGE (d:KBDocument { id: $docId }) SET d += $props

-- Chunk
MERGE (c:KBChunk { id: $chunkId }) SET c += $props

-- Entity (normalize key first: toLowerCase + replace spaces with _)
MERGE (e:KBEntity { key: $key }) SET e += $props

-- Document → Chunk
MERGE (d)-[:HAS_CHUNK]->(c)

-- Chunk → Entity
MERGE (c)-[:MENTIONS]->(e)

-- Entity → Entity
MERGE (a)-[r:RELATED_TO { relation: $relation }]->(b)

-- Sequential links (after all chunks written)
MATCH ... MERGE (curr)-[:NEXT]->(nxt) MERGE (nxt)-[:PREV]->(curr)
```

---

## Error Handling Quick Rules

| Failure point              | Action                                         |
|----------------------------|------------------------------------------------|
| Text extraction fails      | Rethrow (document unprocessable)               |
| Language detection fails   | Default to `'en'`                              |
| Summary generation fails   | Use empty string, continue                     |
| Chunk enrichment fails     | Log, use cleanText as enrichedText, continue   |
| Embedding fails (all retries)| Log critical, skip chunk, continue           |
| Neo4j write fails          | Log, skip chunk, continue                      |
| Batch file fails           | Emit `file_error`, continue to next file       |
| Translation fails          | Keep original text, never throw                |
| Query pipeline fails       | Return 500 with `{ error: '...' }`             |

---

## Startup Checklist

On server start, in this order:
1. Validate all env vars (config.ts parse)
2. Connect to Neo4j (`graph/driver.ts`)
3. Create vector indexes and constraints (`graph/schema.ts`)
4. Verify SMTP DNS resolution
5. Bind Express and listen on `config.PORT`

---

## Do Not

| ❌ Never do this                          | ✅ Do this instead                     |
|------------------------------------------|----------------------------------------|
| `CREATE (d:KBDocument ...)`              | `MERGE (d:KBDocument ...)`             |
| String-interpolate Cypher params         | Use `$param` placeholders              |
| `Promise.all` on Gemini enrichment       | Sequential `for...of` loop             |
| `console.log`                            | `logger.info/warn/error`               |
| Hardcode API keys                        | `config.GEMINI_API_KEY`                |
| `any` in TypeScript                      | Proper interface or `unknown`          |
| Delete KBEntity on document remove       | Only DETACH the MENTIONS relationship  |
| Duplicate chunk IDs                      | Always `<docId>_chunk_<index>`         |
| Random entity keys                       | Canonical snake_case from Gemini prompt|
