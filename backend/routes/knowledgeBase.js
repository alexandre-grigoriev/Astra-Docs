/**
 * routes/knowledgeBase.js — Graph RAG knowledge base endpoints
 */
import express from "express";
import multer from "multer";
import JSZip from "jszip";
import crypto from "crypto";
import fs from "fs/promises";
import { requireAuth, requireAdmin } from "../shared.js";
import { ingestDocument, searchKnowledgeBase, translateChunks, listDocuments, deleteDocument, getDriver, SUPPORTED_EXTS, KB_IMAGES_DIR } from "../kb.js";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"]);

export const router = express.Router();

const kbUpload      = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50  * 1024 * 1024 } });
const kbBatchUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ── SSE job store ──────────────────────────────────────────────────────────────
// jobId -> { res: ServerResponse | null, queue: string[], done: boolean }
const _jobs = new Map();

function _sseEmit(jobId, event, data) {
  const job = _jobs.get(jobId);
  if (!job) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  if (job.res) job.res.write(msg);
  else         job.queue.push(msg);
}

function _sseFinish(jobId) {
  const job = _jobs.get(jobId);
  if (!job) return;
  job.done = true;
  const msg = `event: done\ndata: {}\n\n`;
  if (job.res) { job.res.write(msg); job.res.end(); }
  else         job.queue.push(msg);
  // Keep entry briefly so the client can still connect and drain
  setTimeout(() => _jobs.delete(jobId), 30_000);
}

// ── Single file upload (PDF / Markdown / DOCX) ────────────────────────────────

router.post("/api/knowledge-base/upload", requireAuth, requireAdmin, kbUpload.any(), async (req, res) => {
  const file = req.files?.[0];
  if (!file) return res.status(400).json({ error: "File required (pdf, md, docx)" });
  try {
    const filename     = Buffer.from(file.originalname, "latin1").toString("utf8");
    const documentDate = req.body.documentDate?.trim() || null;
    const result = await ingestDocument({ buffer: file.buffer, filename, uploadedBy: req.session.user.id, documentDate });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[KB] Ingest error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── Batch upload — starts job, returns jobId immediately ──────────────────────

router.post("/api/knowledge-base/upload-batch", requireAuth, requireAdmin, kbBatchUpload.array("files", 100), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: "No files provided" });

  const jobId  = crypto.randomUUID();
  const userId = req.session.user.id;
  _jobs.set(jobId, { res: null, queue: [], done: false });
  res.json({ jobId });

  // Process in background
  (async () => {
    for (const f of req.files) {
      const filename = Buffer.from(f.originalname, "latin1").toString("utf8");
      const ext      = filename.toLowerCase().split(".").pop();

      if (ext === "zip") {
        let zip;
        try { zip = await JSZip.loadAsync(f.buffer); }
        catch (e) { _sseEmit(jobId, "file_error", { filename, error: `ZIP read failed: ${e.message}` }); continue; }

        const entries = Object.entries(zip.files).filter(([, e]) => !e.dir);

        // Pre-collect all image files from ZIP into memory map (keyed by full ZIP path)
        const zipImages = new Map();
        for (const [zipPath, zipEntry] of entries) {
          const ext = zipPath.toLowerCase().split(".").pop();
          if (IMAGE_EXTS.has(ext)) {
            zipImages.set(zipPath, await zipEntry.async("nodebuffer"));
          }
        }

        for (const [zipPath, zipEntry] of entries) {
          const innerExt = zipPath.toLowerCase().split(".").pop();
          if (!SUPPORTED_EXTS.includes(innerExt)) continue;
          const basename  = zipPath.split("/").pop();
          const zipDir    = zipPath.split("/").slice(0, -1).join("/");
          const entryDate = zipEntry.date ? zipEntry.date.toISOString().slice(0, 10) : null;
          _sseEmit(jobId, "processing", { filename: basename });
          try {
            const buf = await zipEntry.async("nodebuffer");
            const r   = await ingestDocument({ buffer: buf, filename: basename, uploadedBy: userId, documentDate: entryDate, zipImages, zipDir });
            _sseEmit(jobId, "file_done", { filename: basename, chunkCount: r.chunkCount });
          } catch (e) {
            _sseEmit(jobId, "file_error", { filename: basename, error: e.message });
          }
        }
      } else if (SUPPORTED_EXTS.includes(ext)) {
        _sseEmit(jobId, "processing", { filename });
        try {
          const r = await ingestDocument({ buffer: f.buffer, filename, uploadedBy: userId, documentDate: null });
          _sseEmit(jobId, "file_done", { filename, chunkCount: r.chunkCount });
        } catch (e) {
          _sseEmit(jobId, "file_error", { filename, error: e.message });
        }
      } else {
        _sseEmit(jobId, "file_error", { filename, error: `Unsupported format: .${ext}` });
      }
    }
    _sseFinish(jobId);
  })();
});

// ── SSE progress stream ────────────────────────────────────────────────────────

router.get("/api/knowledge-base/batch-progress/:jobId", requireAuth, requireAdmin, (req, res) => {
  const job = _jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  job.res = res;
  // Drain any messages emitted before client connected
  for (const msg of job.queue) res.write(msg);
  job.queue = [];

  if (job.done) { res.write(`event: done\ndata: {}\n\n`); res.end(); }

  req.on("close", () => { if (_jobs.has(req.params.jobId)) _jobs.get(req.params.jobId).res = null; });
});

// ── List documents ─────────────────────────────────────────────────────────────

router.get("/api/knowledge-base/documents", requireAuth, async (_req, res) => {
  try { res.json(await listDocuments()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Delete document ────────────────────────────────────────────────────────────

router.delete("/api/knowledge-base/documents/:id", requireAuth, requireAdmin, async (req, res) => {
  try { await deleteDocument(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reset knowledge base ───────────────────────────────────────────────────────

router.delete("/api/knowledge-base/reset", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const session = getDriver().session();
    try {
      await session.run("MATCH (n:KBDocument)-[:HAS_CHUNK]->(c:KBChunk) DETACH DELETE c");
      await session.run("MATCH (e:KBEntity) WHERE NOT (()-[:MENTIONS]->(e)) DETACH DELETE e");
      await session.run("MATCH (d:KBDocument) DETACH DELETE d");
    } finally { await session.close(); }
    await fs.rm(KB_IMAGES_DIR, { recursive: true, force: true }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Search ─────────────────────────────────────────────────────────────────────

router.post("/api/knowledge-base/search", requireAuth, express.json(), async (req, res) => {
  const { query, lang } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });
  try {
    const results    = await searchKnowledgeBase(query);
    const translated = await translateChunks(results, lang ?? "fr");
    const chunks      = translated.map(c => c.text);
    const chunkFiles  = translated.map(c => c.filename ?? null);
    const chunkImages = translated.map(c => c.images ?? []);
    const seen        = new Map();
    for (const c of translated) {
      if (c.filename && !seen.has(c.filename)) seen.set(c.filename, c.documentDate ?? null);
    }
    const sources = [...seen.entries()].map(([filename, documentDate]) => ({ filename, documentDate }));
    res.json({ chunks, chunkFiles, chunkImages, sources });
  } catch (e) {
    console.error("[KB] Search error:", e);
    res.json({ chunks: [] });
  }
});
