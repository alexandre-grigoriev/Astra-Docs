/**
 * ingestion/embedder.js — Gemini embedding with task-type support and retry.
 *
 * Per RAG_PIPELINE.md A.7 and B.1:
 * - embedText()  uses RETRIEVAL_DOCUMENT (ingestion)
 * - embedQuery() uses RETRIEVAL_QUERY    (query time)
 * - 3 retries with exponential backoff: 1s, 2s, 4s
 * - Throws EmbeddingError after all retries fail
 * - Input truncated to 8000 chars before embedding
 */

import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const EMBED_MODEL = 'gemini-embedding-001';
const GEN_MODEL   = 'gemini-2.0-flash';
const API_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_INPUT_CHARS = 8000;
const BACKOFF_MS      = [1000, 2000, 4000]; // 3 attempts

/** Thrown when all embedding retries are exhausted. */
export class EmbeddingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

/**
 * Generates a 3072-dim embedding vector for ingestion (RETRIEVAL_DOCUMENT task).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  return _embed(text, 'RETRIEVAL_DOCUMENT');
}

/**
 * Generates a 3072-dim embedding vector for queries (RETRIEVAL_QUERY task).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedQuery(text) {
  return _embed(text, 'RETRIEVAL_QUERY');
}

async function _embed(text, taskType) {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  const url   = `${API_BASE}/${EMBED_MODEL}:embedContent?key=${config.GEMINI_API_KEY}`;
  const body  = JSON.stringify({
    taskType,
    content: { parts: [{ text: input }] },
  });

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return data.embedding.values;
    }

    const errText = `HTTP ${res.status}`;
    if (attempt < BACKOFF_MS.length - 1) {
      logger.warn('Embed retry', { attempt: attempt + 1, status: res.status, taskType });
      await sleep(BACKOFF_MS[attempt]);
    } else {
      throw new EmbeddingError(`Embedding failed after ${BACKOFF_MS.length} attempts: ${errText}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Text generation helpers (used by enricher + retrieval)
// ---------------------------------------------------------------------------

/**
 * Calls Gemini generative model and returns the response text.
 *
 * @param {string} prompt
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function callGemini(prompt, { maxTokens = 300 } = {}) {
  const url  = `${API_BASE}/${GEN_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) throw new Error(`Gemini generation error: HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * Calls Gemini with a system instruction and user prompt, expecting JSON output.
 * Retries once on HTTP 429 or 503 with a 2-second delay.
 *
 * @param {string} system - system instruction
 * @param {string} prompt - user prompt
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<string>} - raw response text (JSON string)
 */
export async function callGeminiJson(system, prompt, { maxTokens = 1000 } = {}) {
  const url  = `${API_BASE}/${GEN_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents:          [{ parts: [{ text: prompt }] }],
    generationConfig:  {
      maxOutputTokens:   maxTokens,
      responseMimeType: 'application/json',
    },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return data.candidates[0].content.parts[0].text;
    }

    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      logger.warn('Gemini JSON retry', { status: res.status });
      await sleep(2000);
    } else {
      throw new Error(`Gemini JSON error: HTTP ${res.status}`);
    }
  }
}

// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
