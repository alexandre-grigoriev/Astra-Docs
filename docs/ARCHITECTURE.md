# ARCHITECTURE.md — Astra Docs

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                     │
│  Left panel: chat history    Right panel: chat + images     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────▼────────────────────────────────┐
│                    Backend (Express / Node)                  │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  Ingestion   │   │   Retrieval  │   │      Auth      │  │
│  │  Pipeline    │   │   Pipeline   │   │  LDAP/OAuth    │  │
│  └──────┬───────┘   └──────┬───────┘   └────────────────┘  │
│         │                  │                                 │
│  ┌──────▼───────────────────▼───────┐                       │
│  │         Neo4j 5.x (GraphRAG)     │   SQLite              │
│  │  KBDocument → KBChunk → KBEntity │   users/projects/     │
│  │  Vector indexes (3072 dims)      │   chats/messages      │
│  └──────────────────────────────────┘                       │
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │      Google Gemini               │                       │
│  │  gemini-2.0-flash  (LLM)        │                       │
│  │  gemini-embedding-001 (embed)    │                       │
│  └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow

### 2.1 Ingestion Flow

```
File upload (PDF / MD / DOCX / ZIP)
        │
        ▼
[1] Text Extraction
        │  raw text + [IMAGE_REF:path] tokens (MD only)
        ▼
[2] Language Detection
        │  'en' | 'fr'
        ▼
[3] Document Summary  ←── Gemini (first 3000 chars)
        │  summary string
        ▼
[4] Chunking
        │  500 words / 50-word overlap
        │  IMAGE_REF tokens preserved inside chunks
        ▼
[5] Image Resolution  (per chunk)
        │  IMAGE_REF → public URL → saved to disk
        │  uploads/kb-images/<docId>/<relative-path>
        ▼
[6] LLM Enrichment    ←── Gemini (per chunk)
        │  enriched_text, entities[], relations[]
        ▼
[7] Embedding         ←── gemini-embedding-001
        │  float[3072]
        ▼
[8] Neo4j Write
        │  MERGE KBDocument → HAS_CHUNK → KBChunk → MENTIONS → KBEntity
        │  NEXT/PREV sequential links between chunks
        ▼
[9] SSE progress event: file_done | file_error
```

### 2.2 Query Flow

```
User message (text + language)
        │
        ▼
[1] Embed query        ←── gemini-embedding-001
        │
        ▼
[2] 4× Parallel Neo4j retrieval
        │  a) Chunk vector search (cosine, top-K)
        │  b) Entity vector search → related chunks
        │  c) Graph traversal (1-2 hops from top entities)
        │  d) Sequential neighbors (NEXT/PREV of top chunks)
        │
        ▼
[3] Merge & deduplicate by chunkId (highest score wins)
        │
        ▼
[4] Expand with sequential neighbors (±1 chunk, cap topK+2)
        │
        ▼
[5] Auto-translate FR→target language (Gemini batch, skip if FR)
        │
        ▼
[6] Label chunks with actual filename
        │
        ▼
[7] Collect & deduplicate image URLs from all chunks
        │
        ▼
[8] Build Gemini prompt (system + history + labeled chunks)
        │
        ▼
[9] Gemini response
        │
        ▼
[10] Return { text: string, images: string[] }
```

---

## 3. Folder Responsibilities

### `backend/` (root)

| File                  | Responsibility                                           |
|-----------------------|----------------------------------------------------------|
| `server.js`           | Express app entry point, middleware setup, route wiring  |
| `email.js`            | Resend (primary) / SMTP (fallback) email transport       |
| `kb.js`               | Knowledge base shared helpers                            |
| `shared.js`           | Cross-module utilities                                   |
| `mcp-server.js`       | MCP stdio server — connects to production API via HTTP   |

### `backend/ingestion/`

| File                     | Responsibility                                      |
|--------------------------|-----------------------------------------------------|
| `extractor.js`           | PDF / MD / DOCX text extraction + graphviz pre-pass |
| `chunker.js`             | 500-word sliding window, IMAGE_REF preservation     |
| `image_resolver.js`      | Resolve IMAGE_REF tokens → disk + public URL        |
| `graphviz_renderer.js`   | Render ```graphviz blocks to SVG via @hpcc-js/wasm  |
| `enricher.js`            | Gemini enrichment call, entity/relation extraction  |
| `embedder.js`            | Gemini embedding call, retry logic                  |
| `pipeline.js`            | Orchestrates steps 1–8, handles errors per doc      |

### `backend/retrieval/`

| File                     | Responsibility                                      |
|--------------------------|-----------------------------------------------------|
| `strategies.js`          | 4 retrieval functions (chunk, entity, graph, seq)   |
| `merger.js`              | Deduplicate + score merge across strategies         |
| `expander.js`            | Sequential neighbor expansion                       |
| `translator.js`          | Auto-translate chunks via Gemini                    |
| `query_pipeline.js`      | Orchestrates query steps 1–10                       |

### `backend/graph/`

| File                     | Responsibility                                      |
|--------------------------|-----------------------------------------------------|
| `driver.js`              | Neo4j driver singleton                              |
| `schema.js`              | Index creation, constraint creation on startup      |
| `queries/document.js`    | Cypher queries for KBDocument nodes                 |
| `queries/chunk.js`       | Cypher queries for KBChunk nodes                    |
| `queries/entity.js`      | Cypher queries for KBEntity nodes                   |

### `backend/routes/`

| File                     | Responsibility                                      |
|--------------------------|-----------------------------------------------------|
| `knowledgeBase.js`       | Upload, batch, reset, SSE progress                  |
| `conversations.js`       | Chat + message + project CRUD                       |
| `auth.js`                | Login, logout, OAuth callback, LDAP                 |
| `users.js`               | Admin: list, approve, deny                          |
| `mcp.js`                 | Token-protected /api/mcp/* endpoints                |
| `presentations.js`       | Presentation management                             |

### `backend/utils/`

| File          | Responsibility                             |
|---------------|--------------------------------------------|
| `config.js`   | All env var reads, typed config object     |
| `logger.js`   | Structured logger (console + file)         |

---

## 4. Key Constraints

- Neo4j vector index dimension: **3072** (matches `gemini-embedding-001`)
- Chunk size: **500 words**, overlap: **50 words**
- Document summary: first **3000 characters**
- Graph expansion: **1–2 hops** from top entities
- Neighbor expansion: **±1 chunk**, result cap: **topK + 2**
- Batch upload max: **200 MB**
- Single upload max: **50 MB**
- Session TTL: **7 days**
- Email verification TTL: **30 minutes**
