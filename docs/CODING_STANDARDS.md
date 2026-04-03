# CODING_STANDARDS.md — Astra Docs

> These rules apply to every file Claude Code writes or modifies.
> **Backend = JavaScript. Frontend = TypeScript. Rules differ — read the right section.**

---

## 1. Backend — JavaScript (Node.js + Express)

### 1.1 Module System

Use **CommonJS** (`require` / `module.exports`) throughout the backend.
Do not mix ESM `import/export` syntax — Node is not configured for ESM here.

```js
// ✅ Correct
const { getDriver } = require('../graph/driver');
const neo4j = require('neo4j-driver');

module.exports = { ingestDocument };

// ❌ Wrong
import { getDriver } from '../graph/driver';
export function ingestDocument() { ... }
```

---

### 1.2 JSDoc on All Exported Functions

Every exported function must have a JSDoc block. This replaces TypeScript type
annotations and is what Claude Code uses to understand contracts.

```js
/**
 * Resolves [IMAGE_REF:path] tokens in a chunk to public disk URLs.
 * Saves resolved images to uploads/kb-images/<docId>/<relative-path>.
 *
 * @param {object} chunk - Raw chunk with IMAGE_REF tokens in text
 * @param {string} chunk.text - Chunk text containing IMAGE_REF tokens
 * @param {number} chunk.index - 0-based chunk position
 * @param {string} docId - Document ID used as storage namespace
 * @param {string} mdFilePath - Path of the .md file for relative resolution
 * @param {Map<string, Buffer>} imageMap - zipPath → Buffer from ZIP extraction
 * @returns {Promise<{cleanText: string, images: string[]}>}
 */
async function resolveChunkImages(chunk, docId, mdFilePath, imageMap) { ... }
```

---

### 1.3 Object Shapes as JSDoc Typedefs

Define reusable shapes once at the top of the file that owns them:

```js
/**
 * @typedef {object} ScoredChunk
 * @property {string} chunkId
 * @property {number} score
 * @property {string} text
 * @property {string} enrichedText
 * @property {string[]} images
 * @property {string} docId
 */

/**
 * @typedef {object} EnrichedChunk
 * @property {string} enrichedText
 * @property {Entity[]} entities
 * @property {Relation[]} relations
 */
```

---

### 1.4 No `var` — Use `const` and `let`

```js
// ❌ Wrong
var topK = 10;

// ✅ Correct
const topK = 10;
let score = 0;
```

---

### 1.5 Async / Await — No Raw Promises

```js
// ❌ Wrong
enrichChunk(text).then(result => { ... }).catch(err => { ... });

// ✅ Correct
try {
  const result = await enrichChunk(text);
} catch (error) {
  logger.error('Enrichment failed', { chunkIndex, docId, error: error.message });
}
```

---

### 1.6 Destructuring

Use destructuring for clarity:

```js
// ✅ Preferred
const { chunkId, score, enrichedText } = chunk;
const [first, ...rest] = results;
```

---

### 1.7 Error Handling — Never Swallow

```js
// ❌ Wrong
try {
  await enrichChunk(text);
} catch (_) {}

// ✅ Correct — log with context, then decide: rethrow or continue
try {
  await enrichChunk(text);
} catch (error) {
  logger.error('Enrichment failed', {
    chunkIndex,
    docId,
    error: error.message,
    stack: error.stack,
  });
  // rethrow if fatal, otherwise continue
}
```

---

### 1.8 Custom Error Classes

```js
class EmbeddingError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'EmbeddingError';
    this.cause = cause;
  }
}

class ExtractionError extends Error {
  constructor(message, filename) {
    super(message);
    this.name = 'ExtractionError';
    this.filename = filename;
  }
}

module.exports = { EmbeddingError, ExtractionError };
```

---

### 1.9 Async: Sequential vs Parallel

**Sequential** for all Gemini LLM/embedding calls (rate limit protection):

```js
// ✅ Correct — sequential enrichment
for (const chunk of chunks) {
  await enrichChunk(chunk);
}

// ❌ Wrong — parallel Gemini calls will hit 429
await Promise.all(chunks.map(c => enrichChunk(c)));
```

**Parallel** for Neo4j reads and multi-strategy retrieval:

```js
// ✅ Correct — parallel Neo4j reads are fine
const [chunkResults, entityResults, graphResults, seqResults] = await Promise.all([
  chunkVectorSearch(embedding, topK),
  entityVectorSearch(embedding, topK),
  graphTraversal(embedding, topK),
  sequentialNeighbors(embedding, topK),
]);
```

---

### 1.10 No `console.log` — Use the Logger

```js
// ❌ Wrong
console.log('Ingestion started', docId);
console.error(err);

// ✅ Correct
const { logger } = require('../utils/logger');
logger.info('Ingestion started', { docId, filename });
logger.error('Embedding failed', { chunkId, error: err.message });
```

---

### 1.11 Config — No `process.env` Inline

All environment variables go through `utils/config.js`:

```js
// ❌ Wrong
const apiKey = process.env.GEMINI_API_KEY;

// ✅ Correct
const { config } = require('../utils/config');
const apiKey = config.GEMINI_API_KEY;
```

`utils/config.js` must validate all required vars at startup and throw
a descriptive error if any are missing.

---

### 1.12 Neo4j — Always `MERGE`, Never Interpolate

```js
// ❌ Wrong — SQL injection equivalent
const cypher = `MATCH (d:KBDocument { id: '${docId}' })`;

// ❌ Wrong — creates duplicates
await writeQuery(`CREATE (d:KBDocument { id: $docId })`, { docId });

// ✅ Correct
await writeQuery(
  `MERGE (d:KBDocument { id: $docId }) SET d += $props RETURN d`,
  { docId, props }
);
```

---

### 1.13 File Structure Per Module

Each backend module file must follow this order:

```js
// 1. External requires
const neo4j = require('neo4j-driver');

// 2. Internal requires
const { getDriver } = require('../graph/driver');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

// 3. Constants
const MAX_RETRIES = 3;
const CHUNK_SIZE_WORDS = 500;

// 4. JSDoc typedefs (if this file owns them)

// 5. Exported functions

// 6. Private helper functions

// 7. module.exports
module.exports = { ingestDocument };
```

---

## 2. Frontend — TypeScript (React 19 + Vite)

### 2.1 Strict Mode

`tsconfig.json` must have:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

---

### 2.2 No `any`

```typescript
// ❌ Wrong
function process(data: any) { ... }

// ✅ Correct — use unknown and narrow, or define an interface
function process(data: unknown) {
  if (typeof data === 'string') { ... }
}
```

---

### 2.3 Explicit Interfaces for All Data Shapes

```typescript
// ❌ Wrong
const message = { id: '...', role: '...', content: '...' };

// ✅ Correct
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images: string[];
  createdAt: string;
}
```

---

### 2.4 Explicit Return Types on All Exported Functions

```typescript
// ❌ Wrong
export async function fetchMessages(chatId: string) { ... }

// ✅ Correct
export async function fetchMessages(chatId: string): Promise<ChatMessage[]> { ... }
```

---

### 2.5 Functional Components Only

```typescript
// ❌ Wrong — class component
class ChatBubble extends React.Component { ... }

// ✅ Correct
interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function ChatBubble({ message, isStreaming = false }: ChatBubbleProps) {
  return ...;
}
```

---

### 2.6 Avoid Inline Object Types in Props

```typescript
// ❌ Wrong
function Panel({ config }: { title: string; width: number }) { ... }

// ✅ Correct
interface PanelProps {
  title: string;
  width: number;
}
function Panel({ config }: PanelProps) { ... }
```

---

### 2.7 API Response Types

Define a type for every backend response the frontend consumes.
Keep them in `frontend/src/types/api.ts`:

```typescript
// frontend/src/types/api.ts

export interface SendMessageResponse {
  message: {
    id: string;
    role: 'assistant';
    content: string;
    images: string[];
    createdAt: string;
  };
}

export interface BatchUploadResponse {
  jobId: string;
}

export interface KBStatsResponse {
  documents: number;
  chunks: number;
  entities: number;
  images: number;
}
```

---

### 2.8 Hooks

Custom hooks must be prefixed `use` and have explicit return types:

```typescript
// ✅ Correct
export function useChatHistory(chatId: string): {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
} { ... }
```

---

### 2.9 Tailwind — No Inline Styles for Layout

```tsx
// ❌ Wrong
<div style={{ display: 'flex', gap: '16px' }}>

// ✅ Correct
<div className="flex gap-4">
```

Inline `style` is only acceptable for dynamic values that cannot be expressed
as Tailwind classes (e.g. a runtime-calculated pixel width for the resizable splitter).

---

### 2.10 Framer Motion — Wrap, Don't Replace

Apply animations via wrapper `motion.*` components. Never remove existing
Framer Motion animations when editing a component.

```tsx
// ✅ Correct
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
  <ChatBubble message={message} />
</motion.div>
```

---

## 3. Shared Rules (Both Backend and Frontend)

### 3.1 Naming Conventions

| Element              | Convention     | Example                         |
|----------------------|----------------|---------------------------------|
| Variables            | camelCase      | `userQuery`, `topKResults`      |
| Functions            | camelCase      | `generateEmbedding`             |
| Classes (BE)         | PascalCase     | `EmbeddingError`                |
| Components (FE)      | PascalCase     | `ChatBubble`, `KnowledgePanel`  |
| Interfaces/Types     | PascalCase     | `ScoredChunk`, `ChatMessage`    |
| Constants            | UPPER_SNAKE    | `MAX_TOKENS`, `CHUNK_SIZE`      |
| Files (BE)           | snake_case     | `query_pipeline.js`             |
| Files (FE)           | PascalCase     | `ChatBubble.tsx`, `useChat.ts`  |
| Folders              | snake_case     | `ingestion/`, `retrieval/`      |
| Neo4j labels         | PascalCase     | `KBDocument`, `KBChunk`         |
| Neo4j rel types      | UPPER_SNAKE    | `HAS_CHUNK`, `RELATED_TO`       |
| Env variables        | UPPER_SNAKE    | `NEO4J_URI`, `GEMINI_API_KEY`   |

---

### 3.2 Comments — Why, Not What

```js
// ❌ Wrong — describes what the code does (obvious)
// Loop through chunks
for (const chunk of chunks) { ... }

// ✅ Correct — explains why
// Sequential to stay under Gemini's 60 req/min rate limit
for (const chunk of chunks) { ... }
```

---

### 3.3 No Magic Numbers

```js
// ❌ Wrong
const chunks = chunkText(text, 500, 50);

// ✅ Correct
const CHUNK_SIZE_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 50;
const chunks = chunkText(text, CHUNK_SIZE_WORDS, CHUNK_OVERLAP_WORDS);
```

---

### 3.4 No Hardcoded Credentials or URLs

```js
// ❌ Wrong
const uri = 'bolt://localhost:7687';
const key = 'AIzaSy...';

// ✅ Correct
const { config } = require('../utils/config');   // BE
// or
const apiBase = import.meta.env.VITE_API_URL;    // FE
```

---

### 3.5 Testing

Backend tests live in `backend/tests/`. Use **Jest**.
Minimum coverage required:

| Module                        | What to test                                          |
|-------------------------------|-------------------------------------------------------|
| `ingestion/chunker.js`        | Overlap, IMAGE_REF preservation, short document edge  |
| `ingestion/enricher.js`       | JSON parse failure fallback (returns cleanText)       |
| `retrieval/merger.js`         | Deduplication, highest-score selection                |
| `ingestion/image_resolver.js` | Path resolution, missing image skipped silently       |

Mock all Gemini and Neo4j calls in tests. Never call external services in tests.

---

## 1. TypeScript Rules

### 1.1 Strict Mode

`tsconfig.json` must have:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### 1.2 No `any`

Never use `any`. Use `unknown` and narrow, or define an interface.

```typescript
// ❌ Wrong
function process(data: any) { ... }

// ✅ Correct
function process(data: unknown) {
  if (typeof data === 'string') { ... }
}
```

### 1.3 Interfaces for Data Shapes

Define an interface or type for every non-trivial object.

```typescript
// ❌ Wrong
const chunk = { id: '...', text: '...', score: 0.9 };

// ✅ Correct
interface ScoredChunk {
  id: string;
  text: string;
  score: number;
}
const chunk: ScoredChunk = { id: '...', text: '...', score: 0.9 };
```

### 1.4 Return Types

All exported functions must have explicit return types.

```typescript
// ❌ Wrong
export async function getChunks(docId: string) { ... }

// ✅ Correct
export async function getChunks(docId: string): Promise<KBChunk[]> { ... }
```

---

## 2. Naming Conventions

| Element        | Convention    | Example                       |
|----------------|---------------|-------------------------------|
| Variables      | camelCase     | `userQuery`, `topKResults`    |
| Functions      | camelCase     | `generateEmbedding`           |
| Classes        | PascalCase    | `DocumentProcessor`           |
| Interfaces     | PascalCase    | `ScoredChunk`, `BatchJob`     |
| Constants      | UPPER_SNAKE   | `MAX_TOKENS`, `CHUNK_SIZE`    |
| Files          | snake_case    | `query_pipeline.ts`           |
| Folders        | snake_case    | `ingestion/`, `retrieval/`    |
| Neo4j labels   | PascalCase    | `KBDocument`, `KBChunk`       |
| Neo4j rel types| UPPER_SNAKE   | `HAS_CHUNK`, `RELATED_TO`     |
| Env variables  | UPPER_SNAKE   | `NEO4J_URI`, `GEMINI_API_KEY` |

---

## 3. File Structure

Each module file must follow this order:
1. Imports (external packages first, then internal)
2. Constants
3. Interfaces / Types
4. Exported functions
5. Private helper functions

```typescript
// 1. External imports
import neo4j from 'neo4j-driver';

// 2. Internal imports
import { getDriver } from '../graph/driver';
import { config } from '../utils/config';

// 3. Constants
const MAX_RETRIES = 3;

// 4. Interfaces
interface QueryResult { ... }

// 5. Exports
export async function runQuery(...): Promise<QueryResult[]> { ... }

// 6. Private helpers
function buildCypher(...): string { ... }
```

---

## 4. Error Handling

### 4.1 Never Swallow Errors

```typescript
// ❌ Wrong
try {
  await enrichChunk(text);
} catch (_) {}

// ✅ Correct
try {
  await enrichChunk(text);
} catch (error) {
  logger.error('Enrichment failed', {
    chunkIndex,
    docId,
    error: error instanceof Error ? error.message : String(error),
  });
}
```

### 4.2 Custom Error Classes

Define typed errors for recoverable vs fatal failures:

```typescript
export class EmbeddingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export class ExtractionError extends Error {
  constructor(message: string, public readonly filename: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}
```

### 4.3 Retry Pattern

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}
```

---

## 5. Logging

Use a structured logger at `utils/logger.ts`. Never use `console.log` directly.

```typescript
import { logger } from '../utils/logger';

// Levels
logger.info('Ingestion started', { docId, filename });
logger.warn('Enrichment returned empty entities', { chunkId });
logger.error('Embedding failed after retries', { chunkId, error: err.message });
```

Logger must output structured JSON in production, human-readable in development.
Detect via `process.env.NODE_ENV`.

---

## 6. Configuration (`utils/config.ts`)

All environment variables are accessed through a single typed config object:

```typescript
import { z } from 'zod';

const configSchema = z.object({
  NEO4J_URI:          z.string().url(),
  NEO4J_USER:         z.string(),
  NEO4J_PASSWORD:     z.string(),
  GEMINI_API_KEY:     z.string(),
  SQLITE_PATH:        z.string(),
  SESSION_SECRET:     z.string().min(32),
  PORT:               z.coerce.number().default(3001),
  FRONTEND_URL:       z.string().url(),
  SMTP_HOST:          z.string(),
  SMTP_PORT:          z.coerce.number().default(587),
  SMTP_USER:          z.string(),
  SMTP_PASSWORD:      z.string(),
  GOOGLE_CLIENT_ID:   z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LDAP_URL:           z.string().optional(),
  LDAP_BASE_DN:       z.string().optional(),
});

export const config = configSchema.parse(process.env);
```

Fail fast on startup if required variables are missing.

---

## 7. Async Patterns

### 7.1 Sequential vs Parallel

Use sequential processing for Gemini calls (rate limit protection):

```typescript
// ❌ Wrong — hammers the API
await Promise.all(chunks.map(c => enrichChunk(c)));

// ✅ Correct — sequential
for (const chunk of chunks) {
  await enrichChunk(chunk);
}
```

Use parallel only for Neo4j reads or when the API supports batching:

```typescript
// ✅ Parallel read strategies are fine
const [chunkResults, entityResults] = await Promise.all([
  chunkVectorSearch(embedding, topK),
  entityVectorSearch(embedding, topK),
]);
```

### 7.2 Resource Cleanup

Always close Neo4j sessions in a `finally` block (already handled in driver helpers).

---

## 8. Neo4j Patterns

### 8.1 Always MERGE for KB nodes

```typescript
// ❌ Wrong
await writeQuery(`CREATE (d:KBDocument { id: $id })`, { id });

// ✅ Correct
await writeQuery(`MERGE (d:KBDocument { id: $id }) SET d += $props RETURN d`, { id, props });
```

### 8.2 Parameter Injection

Never interpolate variables into Cypher strings. Always use parameters:

```typescript
// ❌ Wrong — SQL injection equivalent
const cypher = `MATCH (d:KBDocument { id: '${docId}' })`;

// ✅ Correct
const cypher = `MATCH (d:KBDocument { id: $docId })`;
await readQuery(cypher, { docId });
```

### 8.3 Integer Types

Neo4j integers must be wrapped for large values:

```typescript
import neo4j from 'neo4j-driver';
// When writing integer properties that might exceed JS safe int:
{ count: neo4j.int(largeNumber) }
```

---

## 9. SSE Pattern (`routes/knowledge_base.ts`)

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();

function emit(event: string, data: object): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Use emit() throughout batch processing
emit('processing', { filename });
emit('file_done', { filename, chunks: result.chunksWritten });
emit('done', { total, success, failed });

res.end();
```

---

## 10. Testing

Each module in `ingestion/` and `retrieval/` must have a corresponding test file
in `backend/tests/`. Use **Jest** or **Vitest**.

Minimum test coverage required:
- `chunker.ts` — test overlap, IMAGE_REF preservation, short document edge case
- `enricher.ts` — test JSON parse failure fallback
- `merger.ts` — test deduplication, highest-score selection
- `image_resolver.ts` — test path resolution, missing image handling

Mock Gemini and Neo4j in all tests. Never call external services in tests.

---

## 11. Comments

Comment **why**, not what:

```typescript
// ❌ Wrong
// Loop through chunks
for (const chunk of chunks) { ... }

// ✅ Correct
// Sequential processing prevents Gemini 429 rate-limit errors at scale
for (const chunk of chunks) { ... }
```

All exported functions need a JSDoc block:

```typescript
/**
 * Resolves [IMAGE_REF:path] tokens in a chunk to public disk URLs.
 * Saves resolved images to uploads/kb-images/<docId>/<relative-path>.
 *
 * @param chunk - The raw chunk containing IMAGE_REF tokens
 * @param docId - Document ID used as the storage namespace
 * @param mdFilePath - Path of the .md file (used for relative resolution)
 * @param imageMap - In-memory map of zipPath → Buffer from ZIP extraction
 * @returns Clean text and resolved public image URLs
 */
export async function resolveChunkImages(...): Promise<ResolvedChunk> { ... }
```
