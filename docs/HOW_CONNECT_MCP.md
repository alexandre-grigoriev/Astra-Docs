# How to connect VS Code to Astra Docs (MCP)

This guide lets any team member query the HORIBA Astra Docs knowledge base **directly
inside VS Code** via the Claude Code extension — no browser, no separate login.

You ask a question in the Claude Code chat and Claude searches the documentation for
you in real time using the RAG pipeline.

---

## What you will need

| Requirement | How to get it |
|-------------|---------------|
| **Node.js ≥ 18** | Download from [nodejs.org](https://nodejs.org) — choose the LTS installer. After installing, open a terminal and run `node -v` to confirm. |
| **VS Code** | Already installed |
| **Claude Code extension** | VS Code → Extensions (`Ctrl+Shift+X`) → search **Claude Code** → Install |
| **Two files** | `mcp-server.js` and `package.json` — ask the administrator (see Step 1) |
| **Network access** | Your machine must reach `172.31.14.92` on port `5234` (internal network / VPN) |

---

## Step 1 — Get the two adapter files

Ask the administrator (or a colleague with the Astra Docs repository) for:

```
backend/mcp-server.js
backend/package.json
```

Create a permanent folder on your machine and put both files in it.
Recommended location:

```
C:\Users\<your-windows-username>\astra-mcp\
    mcp-server.js
    package.json
```

> This folder stays on your machine for as long as you use the MCP connection.
> Do not delete it later.

---

## Step 2 — Install the Node.js dependencies

Open PowerShell (or Command Prompt), navigate to the folder, and run:

```powershell
cd C:\Users\<your-windows-username>\astra-mcp
npm install
```

This downloads about 7 small packages (the MCP SDK). It takes under a minute.
A `node_modules\` subfolder will appear — that is correct.

---

## Step 3 — Connect Claude Code

Create a file called **`.mcp.json`** at the root of the VS Code workspace (project
folder) where you want to use Astra Docs.

```json
{
  "mcpServers": {
    "astra-docs": {
      "command": "node",
      "args": ["C:/Users/<your-windows-username>/astra-mcp/mcp-server.js"],
      "env": {
        "ASTRA_BASE_URL": "https://172.31.14.92:5234",
        "ASTRA_MCP_TOKEN": "astra-mcp-horiba-2026",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

> **Important:** use **forward slashes** in the `args` path (e.g. `C:/Users/…`), not
> backslashes. JSON does not allow unescaped backslashes.

> `NODE_TLS_REJECT_UNAUTHORIZED=0` is required because the Astra Docs server uses a
> self-signed certificate. This is safe on the internal corporate network.

### Want it available in every workspace?

Instead of adding `.mcp.json` to each project, edit the **global** Claude Code
settings file. Its location on Windows:

```
C:\Users\<your-windows-username>\.claude\settings.json
```

Add or merge the same `mcpServers` block there:

```json
{
  "mcpServers": {
    "astra-docs": {
      "command": "node",
      "args": ["C:/Users/<your-windows-username>/astra-mcp/mcp-server.js"],
      "env": {
        "ASTRA_BASE_URL": "https://172.31.14.92:5234",
        "ASTRA_MCP_TOKEN": "astra-mcp-horiba-2026",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

If `settings.json` already exists and has other content, add `mcpServers` alongside
the existing keys — do not replace the whole file.

---

## Step 4 — Reload Claude Code

After saving the config file:

1. Open the Command Palette: `Ctrl+Shift+P`
2. Run: **Developer: Reload Window**

Or close and reopen the VS Code window.

---

## Step 5 — Approve the tools (first time only)

The first time Claude tries to use an Astra Docs tool, Claude Code will show a
permission prompt. Click **Allow** (or **Allow for this session**).

You can also pre-approve all three tools by adding them to the `permissions.allow`
array in `settings.json`:

```json
"permissions": {
  "allow": [
    "mcp__astra-docs__search_docs",
    "mcp__astra-docs__list_documents",
    "mcp__astra-docs__get_kb_stats"
  ]
}
```

---

## Step 6 — Verify the connection

In the Claude Code chat panel, type:

```
/mcp
```

You should see **astra-docs** listed as **connected** with three tools:

| Tool | What it does |
|------|-------------|
| `search_docs` | Semantic RAG search — returns ranked chunks with source filenames |
| `list_documents` | Lists all ingested documents with language, summary, chunk count |
| `get_kb_stats` | Shows total document / chunk / entity counts |

---

## Step 7 — Try it

Type natural-language questions directly in the chat:

```
Search astra docs for Raman spectrometer calibration procedure
```

```
List all documents in astra docs
```

```
Get astra docs knowledge base stats
```

Claude will call the Astra Docs RAG pipeline and return the most relevant
documentation chunks with their source filenames, inline in the conversation.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `astra-docs` not listed in `/mcp` | `.mcp.json` missing or wrong path in `args` | Verify the file is at the workspace root and the path points exactly to `mcp-server.js` |
| `Cannot find module` | `npm install` not run | Run `npm install` inside the `astra-mcp` folder |
| `Error: 401 Invalid or missing X-MCP-Token` | Wrong or missing token | Confirm `ASTRA_MCP_TOKEN` is `astra-mcp-horiba-2026` |
| TLS / certificate error | Self-signed cert rejected | Add `"NODE_TLS_REJECT_UNAUTHORIZED": "0"` to the `env` block |
| `ECONNREFUSED` or timeout | Cannot reach the server | Check VPN / internal network access to `172.31.14.92:5234` |
| Tool returns empty results | No documents ingested | Contact the administrator to upload documents to the knowledge base |

---

## Files on your machine after setup

```
C:\Users\<your-windows-username>\
├── .claude\
│   └── settings.json          ← optional: global config (all workspaces)
└── astra-mcp\
    ├── mcp-server.js           ← MCP adapter (from administrator)
    ├── package.json            ← dependency manifest (from administrator)
    └── node_modules\           ← created by npm install

<your-project-folder>\
└── .mcp.json                  ← per-workspace config (alternative to global)
```

---

## For the administrator — what to share

Give each developer:

1. The two files: `backend/mcp-server.js` and `backend/package.json` (or a zip)
2. The token: `astra-mcp-horiba-2026`
3. This document

No other access, credentials, or source code is required.
