# PLANS.md

## PROJECT: Astra Docs

---

## Overview

Astra Docs is a GraphRAG system designed to centralize, index, and make searchable all Astra documentation, including:

- Markdown (.md) files
- PDF documents
- DOCX files

Documentation is organized in folder hierarchies (e.g. `docs/andor-docs/`). Astra Docs replaces brute-force PDF aggregation with an intelligent conversational interface backed by a knowledge graph.

**Objective:**  
Provide a conversational interface (GraphRAG-based) that enables users to query documentation semantically and retrieve precise, contextual answers in any language.

---

## Tech Stack

| Layer           | Technology                                      |
|-----------------|-------------------------------------------------|
| Frontend        | React 19, Vite, TypeScript, Tailwind CSS 4      |
| Animations      | Framer Motion                                   |
| Icons           | Lucide React                                    |
| Backend         | Node.js + Express                               |
| LLM             | Google Gemini 2.0 Flash                         |
| Embeddings      | Gemini `gemini-embedding-001` (3072 dims)       |
| Graph/Vector DB | Neo4j 5.x (GraphRAG)                            |
| User DB         | SQLite (via better-sqlite3)                     |
| Auth            | Email + Google OAuth + LDAP/Active Directory    |

---

## Core Features

### 1. GraphRAG System

Documents are ingested into a Neo4j knowledge graph and queried at runtime using 4 parallel retrieval strategies:

1. **Chunk vector search** — cosine similarity on enriched chunk embeddings
2. **Entity vector search** → chunks that mention the top matching entities
3. **Graph traversal** — entities related (1–2 hops) to top entities → their chunks
4. **Sequential neighbors** — NEXT/PREV chunk links around top-scoring chunks

Results are merged by highest score per chunk ID, then expanded with neighbors and capped at `topK + 2`.

---

### 2. User Interface

Two-panel layout separated by a resizable splitter (default ratio **1:3**, left:right).

#### Left Panel — Navigation / History

- Chat history grouped by projects (per authenticated user)
- Create / delete projects; delete individual chats
- Conversations persisted in SQLite with cascade deletes

#### Right Panel — Chat

- Markdown-rendered assistant responses
- Images from retrieved KB chunks displayed below the assistant response bubble
- **Image lightbox** — click any image to open full-screen; scroll wheel or click to zoom in (up to 6×); +/- keys also zoom; Escape or click outside to close
- Full multi-turn history per chat (context-aware)
- Voice input (Web Speech API)
- Language selector (EN / FR / AR / JA / ZH / RU) — persisted per chat in SQLite; restored when the user reopens a chat
- Welcome message localised to selected language

#### Top Bar

- HORIBA + AI Lab logos (left)
- "ASTRA DOCS" brand centered
- User menu with role indicator and sign-out (right)
- Admin buttons: Knowledge base, Validate users (with pending badge)

---

### 3. Authentication & Authorization

#### Methods

- **LDAP / Active Directory** — HORIBA `jy.fr` domain; auto-approved on first login. **Default screen** shown on login dialog open.
- **Google OAuth** — auto-approved
- **Email** — requires email verification (token, 30-min TTL), then admin approval

#### Validate Users Workflow

1. User registers by email → email verification link sent (Nodemailer/SMTP)
2. After email confirmed → `status = 'pending'`; login is blocked with a clear message
3. Admin opens **Validate users** dialog → lists pending users with name, email, provider, date
4. Admin clicks **Grant** → `status = 'approved'`; approval email sent to user
5. Admin clicks **Deny** → user deleted; rejection email sent
6. Users with `status = 'rejected'` cannot log in

#### User Roles

| Role  | Permissions |
|-------|-------------|
| USER  | Chat, manage own projects/chats |
| ADMIN | All USER permissions + manage users, upload/manage KB documents, reset KB |

---

### 4. Document Management (Admin)

#### Supported Formats

| Format   | Parser            |
|----------|-------------------|
| PDF      | `pdf-parse`       |
| Markdown | Built-in regex stripper (removes YAML front matter, syntax markers); image references replaced with inline `[IMAGE_REF:path]` tokens to preserve position through chunking; `` ```graphviz `` fenced blocks rendered to SVG (see §4.3) |
| DOCX     | `mammoth`         |

#### Upload Modes

- **Single document** (Add document tab): PDF, MD, or DOCX; optional document date
- **Batch / ZIP** (Batch processing tab): upload a `.zip` archive → backend extracts all supported files; image files (`png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp`) are collected separately and associated with their parent Markdown document by folder structure; each entry's last-modified date from the ZIP is used as `documentDate`

#### Image Handling (Markdown + ZIP)

When a `.md` file is uploaded inside a ZIP archive that also contains image files:

1. All image files in the ZIP are collected into an in-memory map keyed by their full ZIP path
2. `[IMAGE_REF:path]` tokens injected during Markdown parsing are resolved against the MD file's folder in the ZIP (e.g., `Block/Design.md` + `./Design/Blocks.png` → ZIP path `Block/Design/Blocks.png`)
3. Resolved images are saved to disk at `uploads/kb-images/<docId>/<relative-path>`, **preserving the subfolder structure** to avoid filename collisions across different folders
4. Each `KBChunk` node stores the resolved public URLs of images that appeared within it
5. Images are served via the existing `/uploads` static route

#### 4.3 Graphviz Diagram Rendering

Markdown files may contain `` ```graphviz `` fenced blocks with DOT source (e.g. flow diagrams
in Andor documentation). These are handled during extraction:

1. `renderGraphvizBlocks()` in `backend/ingestion/graphviz_renderer.js` renders each block to SVG
   using `@hpcc-js/wasm` (pure WASM — no system `dot` binary required)
2. Each SVG is resized to fit within `SVG_MAX_WIDTH × SVG_MAX_HEIGHT` (default 800 × 600 px,
   configurable via `.env`); aspect ratio is always preserved
3. The block is replaced with an `[IMAGE_REF:graphviz-<sha256>.svg]` token
4. The SVG buffer is merged into the `imageMap` with the correct `zipDir` prefix so
   `image_resolver` can find it by path
5. Chunks containing only an `IMAGE_REF` token (diagram-only files) are kept by the chunker
   via a minimum-word-count exception, so the image is never lost

Filename is content-addressed (SHA-256 of DOT source) → idempotent re-ingestion.

#### 4.4 Idempotent Batch Re-ingestion

Before ingesting each file in a batch ZIP, the backend calls `purgeByFilepath(zipPath)`:
1. Finds all `KBDocument` nodes with the same `filepath` in Neo4j
2. Deletes their graph nodes (document + chunks) via `deleteDocument()`
3. Removes the corresponding `uploads/kb-images/<docId>/` directory from disk

This guarantees that re-uploading a ZIP never creates duplicate chunks or duplicate images in search results.

#### Real-time Progress (Batch)

Batch ingestion uses **Server-Sent Events (SSE)**:
1. `POST /api/knowledge-base/upload-batch` — receives ZIP, starts background job, returns `{ jobId }` immediately
2. `GET /api/knowledge-base/batch-progress/:jobId` — SSE stream; emits `processing`, `file_done`, `file_error`, `done` events
3. Frontend shows a live log panel (monospace, auto-scroll) with `⚙ filename…`, `✓ filename (N chunks)`, `✗ filename: error`

---

### 5. Document Ingestion Pipeline

For each document:

1. **Text extraction** — by file extension (PDF / MD / DOCX); for Markdown, `` ```graphviz `` blocks are rendered to SVG first, then image refs become `[IMAGE_REF:path]` tokens; DOT source is captured separately for summary generation
2. **Language detection** — heuristic on first 500 chars (English vs French default)
3. **Document summary** — `buildSummaryInput()` constructs the Gemini prompt: uses prose text when available; falls back to the raw DOT source + filepath when the file is diagram-only (otherwise the LLM hallucinates with no content to summarise)
4. **Chunking** — 500-word chunks, 50-word overlap (IMAGE_REF tokens travel with their surrounding text)
5. **Image extraction** — `[IMAGE_REF:path]` tokens stripped from each chunk; resolved to public URLs using the saved image map; stored as `images: string[]` on the chunk; clean text used for enrichment
6. **LLM enrichment per chunk** (single Gemini call):
   - Rewrites chunk as self-contained text (resolves pronouns, injects context prefix)
   - Extracts named entities with canonical keys, types, descriptions
   - Extracts relations between entities
7. **Embedding** — `gemini-embedding-001` (3072 dims) on enriched text
8. **Neo4j graph construction**:
   - `KBDocument` node → `HAS_CHUNK` → `KBChunk` nodes → `NEXT` sequential links
   - `KBChunk` stores `images: string[]` (public URLs)
   - `KBChunk` → `MENTIONS` → `KBEntity` nodes (merged by canonical key)
   - `KBEntity` → `RELATED_TO { relation }` → `KBEntity`

---

### 6. Query Pipeline

1. Embed the user query
2. Run 4 retrieval strategies in parallel (see §1)
3. Expand top-K chunks with sequential neighbors
4. **Auto-translate** retrieved French chunks to the user's selected language (Gemini batch call) — skipped when target language is French
5. Label each chunk with its **actual filename** from the KB (not anonymous `[source 1]` labels)
6. Collect `images` arrays from all retrieved chunks; deduplicate into a flat list of public URLs
7. Inject translated chunks + sources into the Gemini chat prompt
8. Gemini response naturally cites document names, since chunks are labeled with them
9. Return `{ text, images }` to frontend; images displayed below the assistant response bubble

---

### 7. Document Management UI (Admin — Knowledge Base dialog)

The Knowledge Base dialog has four tabs:

| Tab | Purpose |
|-----|---------|
| Add document | Single PDF / MD / DOCX upload with optional document date |
| Batch processing | ZIP upload with live SSE progress log (preserved across tab switches) |
| Documents | Folder tree + per-document preview + update button |
| Management | Full KB reset |

#### Documents tab — folder tree
Documents are grouped by the folder prefix of their `filepath` (the full path inside the ZIP,
e.g. `Block/Concept.md` → folder `Block`). Folders are collapsible; root-level files always visible.
The document count in the tab button updates live as each file finishes ingestion.

#### Per-document expand / preview
Clicking a document row expands it to show:
- The stored **summary** (2–3 sentence LLM-generated description; for diagram-only files the summary describes the diagram content derived from the DOT source and filepath)
- Up to 4 **image thumbnails** fetched from `GET /api/knowledge-base/documents/:id/images`
  (click to open full-size in a new tab)

#### Update button
Each document row has a ↻ button that opens a file picker. After selecting a replacement file,
a "Confirm update / Cancel" prompt appears inline. On confirm:
1. `POST /api/knowledge-base/documents/:id/update` — deletes old graph nodes + images,
   re-ingests the new file, **preserves the original `filepath`** so the document stays in the
   same folder in the tree
2. Image cache for that document is cleared so the preview reloads fresh

#### filepath persistence
`KBDocument` nodes store a `filepath` property (full ZIP-relative path, e.g. `Block/Concept.md`).
Single-file uploads use the filename as filepath. The field is populated during ingestion and
returned by `GET /api/knowledge-base/documents`.

---

### 8. Conversation Persistence

All conversations stored in SQLite:

```
users → projects → chats → messages
```

- Cascade deletes: removing a project deletes all its chats and messages
- `GET /api/projects`, `POST /api/projects`, `PATCH/DELETE /api/projects/:id`
- `POST /api/projects/:id/chats`, `PATCH/DELETE /api/chats/:id`
- `GET/POST /api/chats/:id/messages`
- `messages` table stores `images TEXT DEFAULT '[]'` (JSON array of public URLs) so
  assistant responses with diagrams/images are fully restored on session reload

#### Language persistence
- `chats.lang` (SQLite) stores the selected language per chat
- Language is saved on: chat creation, rename, and every time the user changes the selector
- Language is restored when switching to a chat; if it already matches the UI state the
  persist effect is skipped (no spurious PATCH)
- Local `projects` state is kept in sync with the saved lang to prevent stale-state overwrite
  during auto-title updates (first message)

---

### 9. Non-Functional Requirements

- Cookie-based sessions (7-day TTL, in-memory store — lost on restart)
- SMTP email (Nodemailer, sender: "HORIBA Astra Knowledge System"): verification, approval, rejection emails
- DNS IPv4 resolution for SMTP host at startup
- Role-based access control enforced server-side (`requireAuth`, `requireAdmin` middleware)
- Multer file size limits: 50 MB (single), 200 MB (batch ZIP)

---

### 10. Docker Deployment

All deployment artifacts live in `docker/`.

#### Services

| Service | Image | Exposed port |
|---------|-------|--------------|
| `backend` | `node:22-bookworm-slim` (multi-stage) | internal :3001 |
| `frontend` | `nginx:1.27-alpine` (multi-stage React build) | host `HTTP_PORT` (default 80) |

Nginx serves the compiled React SPA and reverse-proxies `/api/*`, `/auth/*`, `/uploads/*` to the backend container. SSE buffering is disabled on the proxy for real-time batch progress.

#### External mounts (nothing persistent bakes into images)

| Host path | Container path | Content |
|-----------|---------------|---------|
| `docker/data/backend.env` | `/app/.env` (read-only) | All runtime secrets |
| `docker/data/uploads/` | `/data/uploads` | KB images |
| `docker/data/users.db` | `/data/users.db` | SQLite DB |

#### Build-time variables

`VITE_GEMINI_API_KEY` is passed as a Docker build ARG and embedded in the frontend JS bundle at build time (the frontend calls Gemini directly for chat). Changing the key requires a frontend rebuild.

#### Quick start

```bash
cd docker/
cp .env.example .env                          # set VITE_GEMINI_API_KEY, HTTP_PORT
cp data/backend.env.example data/backend.env  # set all credentials
touch data/users.db && mkdir -p data/uploads
docker compose up -d --build
```

---

## Future Extensions

- Server-side session persistence (survive restarts)
- Streaming LLM responses to frontend
- Feedback system (thumbs up/down per answer)
- Code-aware search (README + source code)
- Git repository integration
- Answer highlighting in source documents
- Fine-tuning / reranking for relevance improvement
