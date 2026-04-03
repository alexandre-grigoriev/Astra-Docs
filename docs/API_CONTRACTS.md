# API_CONTRACTS.md — REST Endpoint Specifications

> The frontend is already built against these contracts.
> Do not change response shapes. Adding new optional fields is allowed.
> All endpoints return `Content-Type: application/json` unless noted.

---

## Authentication

All endpoints except `/api/auth/*` require a valid session cookie.
Unauthenticated requests return `401 { error: 'Unauthorized' }`.
Admin-only endpoints return `403 { error: 'Forbidden' }` for non-admin users.

---

## Knowledge Base Routes (`/api/knowledge-base`)

### POST `/api/knowledge-base/upload`

Upload a single document. Admin only.

**Request:** `multipart/form-data`
| Field          | Type   | Required | Notes                          |
|----------------|--------|----------|--------------------------------|
| `file`         | File   | Yes      | PDF, MD, or DOCX; max 50 MB   |
| `documentDate` | String | No       | ISO 8601 date string           |

**Response `200`:**
```json
{
  "docId": "abc123",
  "filename": "installation-guide.pdf",
  "chunksWritten": 12,
  "entitiesWritten": 34
}
```

**Response `400`:** `{ "error": "Unsupported file type" }`
**Response `413`:** `{ "error": "File too large" }`

---

### POST `/api/knowledge-base/upload-batch`

Upload a ZIP archive for batch processing. Admin only.
Returns immediately; processing continues asynchronously.

**Request:** `multipart/form-data`
| Field  | Type | Required | Notes              |
|--------|------|----------|--------------------|
| `file` | File | Yes      | ZIP; max 200 MB    |

**Response `200`:**
```json
{ "jobId": "job_xyz789" }
```

---

### GET `/api/knowledge-base/batch-progress/:jobId`

SSE stream for batch job progress. Admin only.

**Response:** `Content-Type: text/event-stream`

Event formats:
```
event: processing
data: {"filename":"guide.pdf"}

event: file_done
data: {"filename":"guide.pdf","chunks":12}

event: file_error
data: {"filename":"broken.pdf","error":"Failed to parse PDF"}

event: done
data: {"total":5,"success":4,"failed":1}
```

---

### GET `/api/knowledge-base/documents`

List all ingested documents. Authenticated users only.

**Response `200`** — flat array:
```json
[
  {
    "id": "abc123",
    "filename": "guide.pdf",
    "mimeType": "pdf",
    "lang": "en",
    "summary": "This guide covers ...",
    "uploadedAt": "2024-01-15T10:30:00Z",
    "documentDate": "2023-06-01",
    "wordCount": 4500,
    "chunkCount": 12
  }
]
```

---

### DELETE `/api/knowledge-base/documents/:docId`

Delete a document and its chunks. Admin only.

**Response `200`:** `{ "deleted": true }`
**Response `404`:** `{ "error": "Document not found" }`

---

### POST `/api/knowledge-base/reset`

Delete all knowledge base data. Admin only.

**Response `200`:** `{ "reset": true }`

---

### GET `/api/knowledge-base/stats`

Knowledge base statistics. Admin only.

**Response `200`:**
```json
{
  "documents": 23,
  "chunks": 412,
  "entities": 891,
  "images": 67
}
```

---

## Chat Routes (`/api/chats`)

### GET `/api/chats/:chatId/messages`

Retrieve all messages in a chat (ordered by creation time).

**Response `200`:**
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "What is the Raman spectrometer calibration procedure?",
      "createdAt": "2024-01-15T10:31:00Z",
      "images": []
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "The calibration procedure involves...",
      "createdAt": "2024-01-15T10:31:05Z",
      "images": ["/uploads/kb-images/abc123/diagrams/calibration.png"]
    }
  ]
}
```

---

### POST `/api/chats/:chatId/messages`

Send a user message and receive an assistant response.

**Request body:**
```json
{
  "content": "What is the Raman spectrometer calibration procedure?",
  "language": "en"
}
```

| Field      | Type   | Required | Notes                                            |
|------------|--------|----------|--------------------------------------------------|
| `content`  | String | Yes      | User's question                                  |
| `language` | String | Yes      | `en` \| `fr` \| `ar` \| `ja` \| `zh` \| `ru`  |

**Response `200`:**
```json
{
  "message": {
    "id": "msg_003",
    "role": "assistant",
    "content": "The calibration procedure involves...",
    "createdAt": "2024-01-15T10:31:05Z",
    "images": ["/uploads/kb-images/abc123/diagrams/calibration.png"]
  }
}
```

**Backend logic:**
1. Load full message history for this chat from SQLite
2. Run `runQueryPipeline(content, language, history)`
3. Persist user message to SQLite
4. Persist assistant message (with images array) to SQLite
5. Return assistant message

---

## Project Routes (`/api/projects`)

### GET `/api/projects`

List all projects for the authenticated user, each with its chats.

**Response `200`** — flat array:
```json
[
  {
    "id": "proj_001",
    "name": "Raman Spectrometer",
    "created_at": "2024-01-10T08:00:00Z",
    "chats": [
      {
        "id": "chat_001",
        "title": "Calibration questions",
        "lang": "en",
        "created_at": "2024-01-11T09:00:00Z"
      }
    ]
  }
]
```

---

### POST `/api/projects`

Create a new project.

**Request body:** `{ "name": "My Project" }`

**Response `201`:**
```json
{ "id": "proj_002", "name": "My Project", "createdAt": "2024-01-15T10:00:00Z" }
```

---

### PATCH `/api/projects/:id`

Rename a project.

**Request body:** `{ "name": "New Name" }`

**Response `200`:** `{ "updated": true }`

---

### DELETE `/api/projects/:id`

Delete project and all its chats (cascade).

**Response `200`:** `{ "deleted": true }`

---

### POST `/api/projects/:id/chats`

Create a new chat inside a project.

**Request body:** `{ "title": "Calibration questions" }`

**Response `200`:**
```json
{ "id": "chat_001", "title": "Calibration questions", "lang": "fr", "created_at": "..." }
```

---

### PATCH `/api/chats/:id`

Update a chat's title and/or language. Both fields are optional; send only what changed.

**Request body:** `{ "title": "New Title", "lang": "en" }`

| Field   | Type   | Notes                                          |
|---------|--------|------------------------------------------------|
| `title` | String | Optional. Renames the chat.                    |
| `lang`  | String | Optional. Persists the selected language (`en` \| `fr` \| `ar` \| …). Restored when the user reopens this chat. |

**Response `200`:** `{ "ok": true }`

---

### DELETE `/api/chats/:id`

Delete a chat and all its messages.

**Response `200`:** `{ "deleted": true }`

---

## Auth Routes (`/api/auth`)

### POST `/api/auth/register`

**Request body:**
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "..." }
```

**Response `201`:** `{ "message": "Verification email sent" }`
**Response `409`:** `{ "error": "Email already registered" }`

---

### GET `/api/auth/verify-email`

**Query params:** `?token=<token>`

**Response `200`:** `{ "message": "Email verified. Awaiting admin approval." }`
**Response `400`:** `{ "error": "Invalid or expired token" }`

---

### POST `/api/auth/login`

**Request body:** `{ "email": "...", "password": "..." }`

**Response `200`:** `{ "user": { "id": "...", "name": "...", "role": "USER" } }`
**Response `401`:** `{ "error": "Invalid credentials" }`
**Response `403`:** `{ "error": "Account pending approval" }` or `{ "error": "Account not verified" }`

---

### POST `/api/auth/logout`

**Response `200`:** `{ "message": "Logged out" }`

---

### GET `/api/auth/me`

Returns the authenticated user.

**Response `200`:**
```json
{ "id": "...", "name": "Jane Doe", "email": "...", "role": "USER", "provider": "email" }
```

---

## User Management Routes (`/api/users`) — Admin only

### GET `/api/users/pending`

**Response `200`:**
```json
{
  "users": [
    { "id": "...", "name": "...", "email": "...", "provider": "email", "createdAt": "..." }
  ]
}
```

---

### POST `/api/users/:id/approve`

**Response `200`:** `{ "approved": true }`

---

### DELETE `/api/users/:id`

Deny and delete a user.

**Response `200`:** `{ "deleted": true }`

---

## Error Response Shape

All error responses follow this shape:

```json
{ "error": "Human-readable error message" }
```

HTTP status codes used:
| Code | Meaning                        |
|------|--------------------------------|
| 400  | Bad request / validation error |
| 401  | Not authenticated              |
| 403  | Authenticated but not allowed  |
| 404  | Resource not found             |
| 409  | Conflict (duplicate)           |
| 413  | Payload too large              |
| 429  | Rate limited                   |
| 500  | Internal server error          |
