# API_CONTRACTS.md — REST Endpoint Specifications

> The frontend is already built against these contracts.
> Do not change response shapes without updating the frontend.
> Adding new optional fields is safe. Removing or renaming fields is forbidden.
> All endpoints return `Content-Type: application/json` unless noted.

---

## Roles & Access Control

| Role          | Access                                                           |
|---------------|------------------------------------------------------------------|
| `user`        | Chat, read documents, read KB stats                              |
| `contributor` | All user rights + upload, delete, and update knowledge base docs |
| `admin`       | All contributor rights + user management, KB reset              |

All endpoints except `/api/auth/*` require a valid session cookie.
Unauthenticated requests return `401`.
Insufficient role returns `403`.

---

## Auth Routes (`/api/auth`)

### POST `/api/auth/register`

Register with email + password. Sends a verification email.

**Request body:**
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "mypassword" }
```

**Response `200`:** `{ "ok": true }`
**Response `409`:** `{ "error": "An account with this email already exists" }`

---

### GET `/api/auth/verify`

Email verification link (sent by email). Redirects to the frontend with `?pending=1`.

**Query params:** `?token=<token>`

---

### POST `/api/auth/login`

Email + password login.

**Request body:** `{ "email": "...", "password": "..." }`

**Response `200`:** `{ "ok": true }` + sets session cookie
**Response `401`:** `{ "error": "Invalid email or password" }`
**Response `403`:** `{ "error": "...", "code": "pending_approval" | "rejected" | "unverified" }`

---

### POST `/api/auth/ldap`

HORIBA Windows account (Active Directory) login.

**Request body:** `{ "username": "grigoriev", "password": "..." }`

| Scenario | Status | Response |
|----------|--------|----------|
| Credentials invalid | `401` | `{ "error": "Invalid Windows username or password" }` |
| First login — request created | `403` | `{ "ok": false, "code": "ldap_pending" }` — admin notified by email |
| Returning user, still pending | `403` | `{ "error": "...", "code": "pending_approval" }` |
| Returning user, rejected | `403` | `{ "error": "...", "code": "rejected" }` |
| Returning user, approved | `200` | `{ "ok": true }` + sets session cookie |
| LDAP disabled | `503` | `{ "error": "LDAP authentication is not enabled" }` |

On first login the backend:
1. Creates a `users` row with `status='pending'`
2. Emails every admin (`role='admin'`) with a notification
3. Returns `403 ldap_pending` so the frontend shows the "Request submitted" screen

---

### GET `/auth/google/login`

Initiates Google OAuth flow. Redirects to Google.

**Query params:** `?returnTo=<url>` (must start with `FRONTEND_ORIGIN`)

---

### GET `/auth/google/callback`

Google OAuth callback. Sets session cookie and redirects to `returnTo`.

---

### POST `/api/auth/logout`

Destroys the session.

**Response `204`**

---

### POST `/api/auth/resend-verification`

Resend email verification link.

**Request body:** `{ "email": "jane@example.com" }`

**Response `200`:** `{ "ok": true }` (always, to avoid user enumeration)

---

### GET `/api/auth/me`

Returns the currently authenticated user.

**Response `200`:**
```json
{
  "id": "ldap-grigoriev",
  "name": "Alexandre Grigoriev",
  "email": "alexandre.grigoriev@horiba.com",
  "picture": null,
  "role": "admin",
  "provider": "ldap"
}
```

**Response `401`** when not authenticated.

---

## User Management Routes (`/api/users`) — Admin only

### GET `/api/users`

All users with full metadata.

**Response `200`** — array:
```json
[
  {
    "id": "ldap-grigoriev",
    "email": "alexandre.grigoriev@horiba.com",
    "name": "Alexandre Grigoriev",
    "picture": null,
    "role": "admin",
    "provider": "ldap",
    "verified": 1,
    "status": "approved",
    "created_at": "2026-04-16T09:00:00.000Z",
    "last_login": "2026-04-16T10:30:00.000Z"
  }
]
```

---

### GET `/api/users/pending`

Users with `status='pending'` waiting for admin approval.

**Response `200`** — array:
```json
[
  { "id": "ldap-saad", "email": "yasmine.saad@horiba.com", "name": "Yasmine SAAD",
    "provider": "ldap", "created_at": "2026-04-16T09:29:56.000Z" }
]
```

---

### PUT `/api/users/:id/role`

Change a user's role.

**Request body:** `{ "role": "admin" | "contributor" | "user" }`

**Response `200`:** `{ "ok": true }`
**Response `400`:** `{ "error": "Invalid role. Must be admin | contributor | user" }`
**Response `404`:** `{ "error": "User not found" }`

Note: live sessions are updated in-memory immediately — no re-login required.

---

### POST `/api/users/:id/approve`

Approve a pending user. Sets `status='approved'` and sends an approval email.

**Response `200`:** `{ "ok": true }`

---

### POST `/api/users/:id/reject`

Reject and delete a pending user. Sends a rejection email.

**Response `200`:** `{ "ok": true }`

---

## Knowledge Base Routes (`/api/knowledge-base`)

### POST `/api/knowledge-base/upload`

Upload a single document. **Contributor or Admin.**

**Request:** `multipart/form-data`
| Field          | Type   | Required | Notes                        |
|----------------|--------|----------|------------------------------|
| `file`         | File   | Yes      | PDF, MD, or DOCX; max 50 MB |
| `documentDate` | String | No       | ISO 8601 date `YYYY-MM-DD`  |

**Response `200`:**
```json
{ "docId": "abc123", "filename": "guide.pdf", "chunkCount": 12 }
```

---

### POST `/api/knowledge-base/upload-batch`

Upload a ZIP archive for batch ingestion. **Contributor or Admin.**
Returns immediately with a `jobId`; processing continues asynchronously.

**Request:** `multipart/form-data`
| Field   | Type | Required | Notes           |
|---------|------|----------|-----------------|
| `files` | File | Yes      | ZIP; max 200 MB |

**Response `200`:** `{ "jobId": "uuid-..." }`

---

### GET `/api/knowledge-base/batch-progress/:jobId`

SSE stream for batch job progress. **Contributor or Admin.**

**Response:** `Content-Type: text/event-stream`

A `: ping` comment is sent every 15 s to keep the connection alive through proxies.
The backend queues events while no client is connected; reconnecting replays all
missed events (supporting transparent auto-reconnect).

Event formats:
```
event: processing
data: {"filename":"guide.pdf"}

event: file_done
data: {"filename":"guide.pdf","chunkCount":12}

event: file_error
data: {"filename":"broken.pdf","error":"Failed to parse PDF"}

event: done
data: {}
```

Job record is kept for 10 min after completion to allow late reconnects.

---

### GET `/api/knowledge-base/documents`

List all ingested documents. **Any authenticated user.**

**Response `200`** — array:
```json
[
  {
    "id": "abc123",
    "filename": "installation-guide.pdf",
    "filepath": "manuals/installation-guide.pdf",
    "lang": "en",
    "summary": "This guide covers ...",
    "uploadedAt": "2026-04-15T10:30:00Z",
    "documentDate": "2023-06-01",
    "wordCount": 4500,
    "chunkCount": 12
  }
]
```

---

### DELETE `/api/knowledge-base/documents/:id`

Delete a document and all its chunks + images. **Contributor or Admin.**

**Response `200`:** `{ "ok": true }`

---

### POST `/api/knowledge-base/documents/:id/update`

Replace a document with a new version (re-ingests). **Contributor or Admin.**

**Request:** `multipart/form-data` — same fields as single upload.

**Response `200`:** `{ "docId": "...", "filename": "...", "chunkCount": 8 }`

---

### DELETE `/api/knowledge-base/reset`

Delete **all** knowledge base data (documents, chunks, entities, images). **Admin only.**

**Response `200`:** `{ "ok": true }`

---

### POST `/api/knowledge-base/search`

Semantic RAG search. **Any authenticated user.**

**Request body:**
```json
{ "query": "Raman calibration procedure", "lang": "fr", "topK": 8 }
```

**Response `200`:**
```json
{
  "chunks":      ["text of chunk 1", "text of chunk 2"],
  "sources":     [{ "filename": "guide.pdf", "documentDate": "2023-06-01" }],
  "chunkFiles":  ["guide.pdf", "guide.pdf"],
  "chunkImages": [["/uploads/kb-images/abc/fig1.png"], []]
}
```

---

## Project Routes (`/api/projects`)

### GET `/api/projects`

List all projects for the authenticated user, each with its chats.

**Response `200`:**
```json
[
  {
    "id": "proj_001",
    "name": "Raman Spectrometer",
    "created_at": "2026-01-10T08:00:00Z",
    "chats": [
      { "id": "chat_001", "title": "Calibration questions", "lang": "fr", "created_at": "..." }
    ]
  }
]
```

---

### POST `/api/projects`

Create a new project.

**Request body:** `{ "name": "My Project" }`

**Response `200`:** `{ "id": "proj_002", "name": "My Project", "created_at": "..." }`

---

### PATCH `/api/projects/:id`

Rename a project.

**Request body:** `{ "name": "New Name" }`

**Response `200`:** `{ "ok": true }`

---

### DELETE `/api/projects/:id`

Delete project and all its chats (cascade).

**Response `200`:** `{ "ok": true }`

---

### POST `/api/projects/:id/chats`

Create a new chat inside a project.

**Request body:** `{ "title": "Calibration questions" }`

**Response `200`:** `{ "id": "chat_001", "title": "...", "lang": "fr", "created_at": "..." }`

---

### PATCH `/api/chats/:id`

Update a chat's title and/or language.

**Request body:** `{ "title": "New Title", "lang": "en" }`

**Response `200`:** `{ "ok": true }`

---

### DELETE `/api/chats/:id`

Delete a chat and all its messages.

**Response `200`:** `{ "ok": true }`

---

### GET `/api/chats/:chatId/messages`

All messages for a chat, ordered by creation time.

**Response `200`:**
```json
[
  { "id": "msg_001", "role": "user",      "text": "What is ...", "timestamp": "...", "images": [] },
  { "id": "msg_002", "role": "assistant", "text": "The answer...", "timestamp": "...", "images": ["/uploads/..."] }
]
```

---

### POST `/api/chats/:chatId/messages`

Persist a message (user or assistant).

**Request body:** `{ "id": "...", "role": "user"|"assistant", "text": "...", "timestamp": "...", "images": [] }`

**Response `200`:** `{ "ok": true }`

---

## MCP Routes (`/api/mcp`) — Token-authenticated

These endpoints are used by the MCP stdio server (`backend/mcp-server.js`).
Authentication uses the `X-MCP-Token` header instead of session cookies.

### POST `/api/mcp/search`

**Request body:** `{ "query": "...", "topK": 8 }`

**Response `200`:** `{ "chunks": [ { "text": "...", "filename": "...", "documentDate": "..." } ] }`

---

### GET `/api/mcp/documents`

**Response `200`:** `{ "documents": [ { "filename": "...", "lang": "...", "summary": "...", "chunkCount": 4, ... } ] }`

---

### GET `/api/mcp/stats`

**Response `200`:** `{ "documents": 23, "chunks": 412, "entities": 891 }`

---

## Error Response Shape

All error responses follow this shape:

```json
{ "error": "Human-readable error message" }
```

Auth-specific errors also include a `code` field:
```json
{ "error": "Your account is awaiting admin approval.", "code": "pending_approval" }
```

HTTP status codes:
| Code | Meaning                        |
|------|--------------------------------|
| 400  | Bad request / validation error |
| 401  | Not authenticated              |
| 403  | Authenticated but not allowed  |
| 404  | Resource not found             |
| 409  | Conflict (duplicate)           |
| 413  | Payload too large              |
| 503  | Feature disabled (e.g. LDAP)  |
| 500  | Internal server error          |
