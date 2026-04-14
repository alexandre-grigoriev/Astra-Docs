/**
 * routes/mcp.js — MCP-specific API endpoints
 *
 * Protected by a shared secret token (X-MCP-Token header).
 * No session cookie required — intended for Claude Code MCP clients.
 *
 * Endpoints:
 *   POST /api/mcp/search       — RAG query
 *   GET  /api/mcp/documents    — list all documents
 *   GET  /api/mcp/stats        — KB statistics
 */
import express from "express";
import { searchKnowledgeBase } from "../retrieval/query_pipeline.js";
import { listDocuments }       from "../graph/queries/document.js";
import { readQuery }           from "../graph/driver.js";

export const router = express.Router();

// ── Token auth middleware ─────────────────────────────────────────────────────
const MCP_SECRET = process.env.MCP_SECRET;

function requireMcpToken(req, res, next) {
  if (!MCP_SECRET) {
    return res.status(503).json({ error: "MCP_SECRET not configured on this server" });
  }
  const token = req.headers["x-mcp-token"];
  if (!token || token !== MCP_SECRET) {
    return res.status(401).json({ error: "Invalid or missing X-MCP-Token" });
  }
  next();
}

// ── POST /api/mcp/search ──────────────────────────────────────────────────────
router.post("/api/mcp/search", requireMcpToken, async (req, res) => {
  const { query, topK = 8 } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query (string) is required" });
  }
  const k = Math.min(Math.max(1, Number(topK)), 20);
  const chunks = await searchKnowledgeBase(query.trim(), k);
  res.json({ chunks });
});

// ── GET /api/mcp/documents ────────────────────────────────────────────────────
router.get("/api/mcp/documents", requireMcpToken, async (_req, res) => {
  const docs = await listDocuments();
  res.json({ documents: docs });
});

// ── GET /api/mcp/stats ────────────────────────────────────────────────────────
router.get("/api/mcp/stats", requireMcpToken, async (_req, res) => {
  const [docRes, chunkRes, entityRes] = await Promise.all([
    readQuery("MATCH (d:KBDocument) RETURN count(d) AS n"),
    readQuery("MATCH (c:KBChunk)    RETURN count(c) AS n"),
    readQuery("MATCH (e:KBEntity)   RETURN count(e) AS n"),
  ]);
  res.json({
    documents: docRes[0]?.n  ?? 0,
    chunks:    chunkRes[0]?.n ?? 0,
    entities:  entityRes[0]?.n ?? 0,
  });
});
