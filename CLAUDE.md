# CLAUDE.md — Astra Docs

> **This file is mandatory reading for Claude Code before any task.**
> Read it fully before writing, editing, or deleting a single line of code.

---

## 1. Project Identity

**Astra Docs** is a GraphRAG-based documentation intelligence system for HORIBA.
It ingests Markdown, PDF, and DOCX files into a Neo4j knowledge graph and exposes
a conversational interface with multi-lingual support.

The UI is **already implemented and must not be restructured**.
Your task is to implement the **RAG backend** as described in this file and the
`docs/` specification files referenced below.

---

## 2. Mandatory Reading Order

Before starting any task, read the following files in order:

```
CLAUDE.md                        ← this file (always first)
docs/ARCHITECTURE.md             ← system layout, folder structure, data flow
docs/RAG_PIPELINE.md             ← ingestion + query pipeline, exact implementation steps
docs/NEO4J_SCHEMA.md             ← graph schema, Cypher patterns, index definitions
docs/API_CONTRACTS.md            ← all REST endpoints, request/response shapes
docs/CODING_STANDARDS.md         ← style, naming, error handling, logging rules
```

Then read any `SPEC.md` file inside the feature folder you are about to touch.

---

## 3. Tech Stack (Non-Negotiable)

| Layer           | Technology                                  |
|-----------------|---------------------------------------------|
| Frontend        | React 19, Vite, TypeScript, Tailwind CSS 4  |
| Animations      | Framer Motion                               |
| Icons           | Lucide React                                |
| Backend         | Node.js + Express (JavaScript ES modules)   |
| LLM             | Google Gemini 2.0 Flash                     |
| Embeddings      | `gemini-embedding-001` (3072 dims)          |
| Graph/Vector DB | Neo4j 5.x                                   |
| User DB         | SQLite via `better-sqlite3`                 |
| Auth            | Email + Google OAuth + LDAP/AD              |

**Do not introduce new dependencies** without a comment explaining why it is
necessary and why the existing stack cannot satisfy the requirement.

---

## 4. Repository Layout

```
astra-docs/
├── CLAUDE.md                        ← you are here
├── PLANS.md                         ← product roadmap (read-only reference)
├── DEPLOYMENT.md                    ← Docker + HTTPS deployment guide
├── MCP.md                           ← Claude Code MCP integration guide
├── ROOTCASES.md                     ← known issues & root causes log
├── .mcp.json                        ← MCP server config (Claude Code)
├── plans/                           ← feature planning documents
│   ├── Initial developement plan.md
│   └── Dépasser Karpathy LLM-wiki.md
├── docs/                            ← specification files
│   ├── ARCHITECTURE.md
│   ├── RAG_PIPELINE.md
│   ├── NEO4J_SCHEMA.md
│   ├── API_CONTRACTS.md
│   ├── CODING_STANDARDS.md
│   └── QUICK_REFERENCE.md
├── backend/
│   ├── server.js                    ← Express app entry point
│   ├── email.js                     ← Resend / SMTP email transport
│   ├── kb.js                        ← knowledge base helpers
│   ├── shared.js                    ← shared utilities
│   ├── mcp-server.js                ← MCP stdio server (for Claude Code)
│   ├── ingestion/                   ← document parsing, chunking, enrichment, embedding
│   │   ├── extractor.js
│   │   ├── chunker.js
│   │   ├── image_resolver.js
│   │   ├── graphviz_renderer.js
│   │   ├── enricher.js
│   │   ├── embedder.js
│   │   └── pipeline.js
│   ├── retrieval/                   ← query pipeline, ranking, graph expansion
│   │   ├── strategies.js
│   │   ├── merger.js
│   │   ├── expander.js
│   │   ├── translator.js
│   │   └── query_pipeline.js
│   ├── graph/                       ← Neo4j driver, Cypher queries, schema
│   │   ├── driver.js
│   │   ├── schema.js
│   │   └── queries/
│   │       ├── document.js
│   │       ├── chunk.js
│   │       └── entity.js
│   ├── routes/                      ← Express routers
│   │   ├── auth.js
│   │   ├── knowledgeBase.js
│   │   ├── conversations.js
│   │   ├── users.js
│   │   ├── mcp.js                   ← token-protected /api/mcp/* endpoints
│   │   └── presentations.js
│   └── utils/
│       ├── config.js
│       └── logger.js
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── utils.ts
│   │   ├── components/
│   │   │   ├── admin/               ← ValidationDialog
│   │   │   ├── auth/                ← AuthDialog
│   │   │   ├── chat/                ← ChatPanel
│   │   │   ├── knowledge-base/      ← AddPdfDialog
│   │   │   └── ui/                  ← Card, TopSelect
│   │   ├── hooks/
│   │   │   └── useSpeechRecognition.ts
│   │   └── services/
│   │       └── gemini.ts            ← Gemini chat API (frontend direct call)
│   └── static/                      ← logo, icon assets
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── nginx.conf                   ← HTTPS + reverse proxy config
│   ├── docker-compose.yml
│   ├── docker-compose.release.yml   ← production (HTTPS ports, cert volume)
│   ├── push.ps1 / push.sh
│   ├── export.ps1 / export.sh
│   ├── install.sh
│   └── data/
│       └── backend.env.example      ← all runtime secrets template
├── tests/
│   ├── graphviz_renderer.test.js
│   └── retrieval.test.js
└── uploads/
    └── kb-images/                   ← <docId>/<relative-path> image storage
```

---

## 5. Core Implementation Rules

### 5.1 Never Break the UI Contract

The frontend is complete. Backend API changes must preserve every existing
endpoint shape. Adding fields is safe. Removing or renaming fields is forbidden
without explicit instruction.

### 5.2 Atomicity

Each ingestion step must be independently retryable. If a document fails at the
embedding step, the pipeline must not re-parse or re-enrich it on retry — use
the intermediate state stored in the graph.

### 5.3 Idempotency

All `POST /api/knowledge-base/*` handlers must be idempotent. Uploading the same
document twice must update the existing graph nodes, not duplicate them.
Use Neo4j `MERGE` — never `CREATE` alone — for documents, chunks, and entities.

### 5.4 Error Isolation

A single document failure during batch ingestion must never abort the batch.
Log the error, emit a `file_error` SSE event, and continue to the next file.

### 5.5 Secrets

All credentials live in `.env`. Never hardcode API keys, passwords, or connection
strings. Use the `config` module at `backend/utils/config.js`.

---

## 6. Environment Variables

All env vars live in `backend/.env` (dev) or `docker/data/backend.env` (production).
See `docker/data/backend.env.example` for the full template.

```env
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
APP_BASE_URL=http://localhost:5173

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=

# Google Gemini
GEMINI_API_KEY=

# Cookie
COOKIE_NAME=astra_session
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# Email — Resend (primary) or SMTP (fallback)
RESEND_API_KEY=
RESEND_FROM="HORIBA Astra Knowledge System" <do_not_reply@horiba.com>
# SMTP_HOST=  SMTP_PORT=587  SMTP_USER=  SMTP_PASS=  SMTP_FROM=

# MCP (Claude Code integration)
MCP_SECRET=

# LDAP / Active Directory
LDAP_ENABLED=false
LDAP_URL=ldaps://HFRDC01.jy.fr
LDAP_DOMAIN=jy.fr
LDAP_BASE_DN=DC=jy,DC=fr
LDAP_SEARCH_ATTR=sAMAccountName

# Google OAuth
GOOGLE_OAUTH_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# SVG diagram sizing
SVG_MAX_WIDTH=800
SVG_MAX_HEIGHT=600
```

---

## 7. What Claude Code Must Never Do

- Rewrite or restructure the existing frontend components
- Drop or rename existing REST endpoints
- Use `CREATE` alone in Neo4j (always `MERGE`)
- Swallow errors silently (always log with context)
- Use `any` in TypeScript
- Hardcode credentials or environment-specific values
- Introduce a new npm package without a justification comment
- Delete migration logic without archiving it in `docs/migrations/`
