---
name: Astra Docs — tech stack and repo layout
description: Core technologies, folder layout, and non-negotiable constraints for Astra Docs
type: project
---

GraphRAG documentation intelligence system for HORIBA.

**Stack:** React 19 + Vite + TS frontend (complete, do not restructure), Node.js + Express backend (JS, not TS), Google Gemini 2.0 Flash + `gemini-embedding-001`, Neo4j 5.x (graph + vector), SQLite (`better-sqlite3`).

**Backend layout:** `backend/` — `ingestion/`, `retrieval/`, `graph/`, `routes/`, `utils/`, `tests/`

**Key constraints:**
- All Neo4j writes use `MERGE`, never bare `CREATE`
- No `any` in TypeScript; no hardcoded secrets
- Do not restructure existing frontend components
- Tests use Node.js built-in test runner (`node:test`) — no extra test packages

**Why:** CLAUDE.md mandates these as non-negotiable rules.
**How to apply:** Check constraints before adding deps or touching graph queries or frontend.
