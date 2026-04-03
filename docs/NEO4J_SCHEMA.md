# NEO4J_SCHEMA.md — Graph Schema & Query Patterns

## 1. Node Labels

### KBDocument

Represents one ingested file.

| Property      | Type     | Notes                              |
|---------------|----------|------------------------------------|
| `id`          | String   | Unique. `nanoid()` at upload time  |
| `filename`    | String   | Original filename with extension   |
| `mimeType`    | String   | `'pdf'` \| `'md'` \| `'docx'`     |
| `language`    | String   | `'en'` \| `'fr'`                  |
| `summary`     | String   | Gemini-generated document summary  |
| `uploadedAt`  | DateTime | ISO 8601 string                    |
| `wordCount`   | Integer  | Total word count of extracted text |

---

### KBChunk

Represents one 500-word chunk of a document.

| Property       | Type       | Notes                                         |
|----------------|------------|-----------------------------------------------|
| `id`           | String     | Unique. `<docId>_chunk_<index>`               |
| `docId`        | String     | Foreign key to KBDocument.id                  |
| `index`        | Integer    | 0-based position in document                  |
| `text`         | String     | Clean text (no IMAGE_REF tokens)              |
| `enrichedText` | String     | Gemini-rewritten self-contained text          |
| `images`       | String[]   | Public URLs of images in this chunk           |
| `embedding`    | Float[]    | 3072-dim vector of enrichedText               |
| `wordCount`    | Integer    | Word count of clean text                      |

---

### KBEntity

Represents a named entity extracted from chunks.

| Property      | Type     | Notes                                          |
|---------------|----------|------------------------------------------------|
| `key`         | String   | Unique. Canonical snake_case. e.g. `raman_spectrometer` |
| `type`        | String   | `DEVICE` \| `CONCEPT` \| `PROCESS` \| `PERSON` \| `LOCATION` \| `ORGANIZATION` \| `OTHER` |
| `description` | String   | One-sentence definition                        |
| `embedding`   | Float[]  | 3072-dim vector of `"key: description"`        |

---

## 2. Relationship Types

| Relationship   | From        | To          | Properties          |
|----------------|-------------|-------------|---------------------|
| `HAS_CHUNK`    | KBDocument  | KBChunk     | none                |
| `NEXT`         | KBChunk     | KBChunk     | none                |
| `PREV`         | KBChunk     | KBChunk     | none                |
| `MENTIONS`     | KBChunk     | KBEntity    | none                |
| `RELATED_TO`   | KBEntity    | KBEntity    | `relation: String`  |

---

## 3. Graph Diagram

```
(KBDocument)
     │
     │ HAS_CHUNK
     ▼
(KBChunk) ──NEXT──▶ (KBChunk) ──NEXT──▶ (KBChunk)
     │         ◀─PREV─         ◀─PREV─
     │ MENTIONS
     ▼
(KBEntity) ──RELATED_TO { relation }──▶ (KBEntity)
```

---

## 4. Vector Indexes

```cypher
-- Created at startup via graph/schema.ts
CREATE VECTOR INDEX kb_chunk_embedding IF NOT EXISTS
FOR (c:KBChunk) ON c.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 3072,
    `vector.similarity_function`: 'cosine'
  }
}

CREATE VECTOR INDEX kb_entity_embedding IF NOT EXISTS
FOR (e:KBEntity) ON e.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 3072,
    `vector.similarity_function`: 'cosine'
  }
}
```

---

## 5. Unique Constraints

```cypher
CREATE CONSTRAINT kb_document_id IF NOT EXISTS
  FOR (d:KBDocument) REQUIRE d.id IS UNIQUE

CREATE CONSTRAINT kb_chunk_id IF NOT EXISTS
  FOR (c:KBChunk) REQUIRE c.id IS UNIQUE

CREATE CONSTRAINT kb_entity_key IF NOT EXISTS
  FOR (e:KBEntity) REQUIRE e.key IS UNIQUE
```

---

## 6. Query Patterns

### 6.1 Fetch all chunks of a document (ordered)

```cypher
MATCH (d:KBDocument { id: $docId })-[:HAS_CHUNK]->(c:KBChunk)
RETURN c ORDER BY c.index ASC
```

### 6.2 Fetch document by filename

```cypher
MATCH (d:KBDocument { filename: $filename })
RETURN d
```

### 6.3 Delete a document and all its chunks

```cypher
MATCH (d:KBDocument { id: $docId })
OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c:KBChunk)
OPTIONAL MATCH (c)-[:MENTIONS]->(e:KBEntity)
DETACH DELETE d, c
```

Note: do **not** delete KBEntity nodes — they may be referenced by other documents.
Only detach the MENTIONS relationships.

### 6.4 Reset entire knowledge base

```cypher
MATCH (n)
WHERE n:KBDocument OR n:KBChunk OR n:KBEntity
DETACH DELETE n
```

### 6.5 Count nodes by label

```cypher
MATCH (d:KBDocument) WITH count(d) AS docs
MATCH (c:KBChunk)    WITH docs, count(c) AS chunks
MATCH (e:KBEntity)   WITH docs, chunks, count(e) AS entities
RETURN docs, chunks, entities
```

---

## 7. Driver Configuration (`graph/driver.ts`)

```typescript
import neo4j from 'neo4j-driver';
import { config } from '../utils/config';

let _driver: neo4j.Driver | null = null;

export function getDriver(): neo4j.Driver {
  if (!_driver) {
    _driver = neo4j.driver(
      config.NEO4J_URI,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
        logging: neo4j.logging.console('warn'),
      }
    );
  }
  return _driver;
}

export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

// Helper: run a read query
export async function readQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => r.toObject() as T);
  } finally {
    await session.close();
  }
}

// Helper: run a write query
export async function writeQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => r.toObject() as T);
  } finally {
    await session.close();
  }
}
```

---

## 8. Data Integrity Rules

- **Never use `CREATE` alone** for Document, Chunk, or Entity — always `MERGE`
- **Do not delete KBEntity nodes** on document removal; they are shared across documents
- **NEXT/PREV links** must be created only after all chunks of a document are written
- **Chunk IDs** must follow the `<docId>_chunk_<index>` format — never use random IDs for chunks
- **Entity keys** must be snake_case and stable — the same concept must produce the same key
  across different documents (enforced by Gemini prompt; validate with `.toLowerCase().replace(/\s+/g, '_')`)
