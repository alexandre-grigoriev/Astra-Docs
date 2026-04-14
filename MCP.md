# MCP.md — Connecting Astra Docs to Claude Code

Astra Docs exposes a **Model Context Protocol (MCP) server** that lets Claude Code
query the HORIBA knowledge base directly from VS Code — no browser, no login required.

The MCP server connects to the production instance at `https://172.31.14.92:5234`
over HTTP. No source code clone, no Neo4j access, and no local backend needed.

---

## What you can do

Once connected, ask Claude Code things like:

- *"Search astra docs for Raman spectrometer calibration procedure"*
- *"List all documents in the knowledge base"*
- *"How many chunks and entities are in the KB?"*

Claude calls the Astra Docs RAG pipeline and returns ranked documentation chunks
with their source filenames, inline in the chat.

---

## Available tools

| Tool | Description |
|------|-------------|
| `search_docs` | Semantic RAG search — returns ranked chunks + source filenames |
| `list_documents` | All ingested documents with summary, language, word count, chunk count |
| `get_kb_stats` | Document / chunk / entity counts |

---

## Installation on a developer machine

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | Must be on `PATH` — download from [nodejs.org](https://nodejs.org) |
| VS Code | With the **Claude Code** extension installed |
| Network access | Must be able to reach `172.31.14.92:5234` |

No Neo4j, no Python, no source code clone required.

---

### Step 1 — Copy the MCP server files

You only need two files from the repository. Copy them to any folder on your machine,
for example `C:\Users\you\astra-mcp\`:

```
backend/mcp-server.js          → astra-mcp/mcp-server.js
backend/package.json           → astra-mcp/package.json
```

Or ask the administrator to share a zip of those two files.

---

### Step 2 — Install dependencies

```bash
cd astra-mcp
npm install
```

This installs only the MCP SDK (~7 packages, no native addons, fast).

---

### Step 3 — Configure Claude Code

Create or edit the file `.claude/settings.json` **at the root of your VS Code workspace**:

```json
{
  "mcpServers": {
    "astra-docs": {
      "command": "node",
      "args": ["C:/Users/you/astra-mcp/mcp-server.js"],
      "env": {
        "ASTRA_BASE_URL": "https://172.31.14.92:5234",
        "ASTRA_MCP_TOKEN": "astra-mcp-horiba-2026",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

> Adjust `args` to the full path where you placed `mcp-server.js`.

> `NODE_TLS_REJECT_UNAUTHORIZED=0` is required because the server uses a
> self-signed certificate. This is safe for an internal corporate network.

---

### Step 4 — Reload Claude Code

In VS Code:
- Open the Command Palette (`Ctrl+Shift+P`)
- Run **"Claude Code: Reload MCP Servers"**

Or simply close and reopen the VS Code window.

---

### Step 5 — Verify the connection

In the Claude Code chat panel, type:

```
/mcp
```

You should see `astra-docs` listed as **connected** with three tools.

---

## Usage examples

```
Search astra docs for acquisition sequence diagram
```

```
List all documents in astra docs
```

```
Get astra docs knowledge base stats
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `astra-docs` not listed in `/mcp` | `.claude/settings.json` missing or wrong path | Check the file is at workspace root under `.claude/settings.json` |
| `Error: 401 Invalid or missing X-MCP-Token` | Wrong or missing token | Check `ASTRA_MCP_TOKEN` matches the value set by the administrator |
| `Error: 503 MCP_SECRET not configured` | Server not updated yet | Ask administrator to set `MCP_SECRET` in `backend.env` and redeploy |
| `CERT_HAS_EXPIRED` or TLS error | Self-signed cert rejected | Add `"NODE_TLS_REJECT_UNAUTHORIZED": "0"` to the `env` block |
| `ECONNREFUSED` | Server unreachable | Check VPN / network access to `172.31.14.92:5234` |
| `Cannot find module` | `npm install` not run | Run `npm install` in the folder containing `mcp-server.js` |
| Tool returns empty results | Knowledge base is empty | Contact the administrator to ingest documents |

---

## For the administrator — server setup

### 1. Add `MCP_SECRET` to the server

In `~/astra-docs/data/backend.env` on the Linux server:

```env
MCP_SECRET=astra-mcp-horiba-2026
```

Then:
```bash
docker compose restart backend
```

### 2. Push a new backend image (if not already done)

The `/api/mcp/*` endpoints are included in the backend image.
If the server is running an older image, rebuild and push from Windows:

```powershell
.\docker\push.ps1
```

Then on the server:
```bash
docker compose pull && docker compose up -d
```

### 3. Share with developers

Give each developer:
- The two files: `mcp-server.js` and `package.json` from `backend/`
- The token: `astra-mcp-horiba-2026`
- This document

---

## Architecture

```
Developer machine (VS Code)
      │  stdin/stdout — MCP protocol
      ▼
mcp-server.js  (Node.js, local)
      │
      │  HTTPS  X-MCP-Token header
      ▼
https://172.31.14.92:5234/api/mcp/*
      │
      ▼
Astra Docs backend (Docker)
      │
      ├── RAG pipeline  ← search_docs
      ├── Neo4j         ← list_documents, get_kb_stats
      └── No session cookie required
```
