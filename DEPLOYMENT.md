# DEPLOYMENT.md — Astra Docs

Deployment guide for production using Docker Compose.  
All deployment artifacts live in the `docker/` folder.

---

## Architecture

```
Browser
  │
  ▼
[Nginx :80]  ──── serves ────▶  React SPA (static files)
  │
  │  reverse-proxy
  ├── /api/*      ──────────▶  [Backend Node.js :3001]
  ├── /auth/*     ──────────▶         │
  └── /uploads/*  ──────────▶         │
                                       ├── SQLite  (users.db)
                                       ├── uploads/ (KB images)
                                       └── Neo4j  (external)
```

- **Frontend** — React 19 / Vite, compiled at build time, served by Nginx.
- **Backend** — Node.js / Express; handles ingestion, retrieval, auth, file serving.
- **Neo4j** — external instance (not managed by this compose file).
- **SQLite** — single file `users.db`; lives on the host, mounted into the backend container.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Docker Engine | ≥ 24 |
| Docker Compose plugin | ≥ 2.20 |
| Neo4j | 5.x — running and reachable from the Docker host |
| Gemini API key | from [Google AI Studio](https://aistudio.google.com/) |

---

## Directory layout after setup

```
docker/
├── docker-compose.yml
├── .env                     ← compose variables (created from .env.example)
├── .env.example             ← template
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf
└── data/                    ← host-side persistent data (git-ignored)
    ├── backend.env          ← backend runtime config (created from backend.env.example)
    ├── backend.env.example  ← template
    ├── users.db             ← SQLite database (created empty on first deploy)
    └── uploads/             ← KB images written by the backend
```

---

## Step 1 — Clone the repository

```bash
git clone <repo-url> astra-docs
cd astra-docs/docker
```

---

## Step 2 — Create the compose environment file

```bash
cp .env.example .env
```

Edit `docker/.env`:

```env
# Port exposed on the host (80 for HTTP, or any free port)
HTTP_PORT=80

# Gemini API key — embedded in the frontend JS bundle at build time
VITE_GEMINI_API_KEY=AIzaSy...
```

> **Note:** `VITE_GEMINI_API_KEY` is baked into the React bundle during `docker compose build`.
> Changing it later requires a rebuild: `docker compose build frontend && docker compose up -d frontend`.

---

## Step 3 — Create the backend runtime config

```bash
cp data/backend.env.example data/backend.env
```

Edit `docker/data/backend.env` — mandatory fields:

```env
# Public URL where users reach the app (used for CORS and email links)
FRONTEND_ORIGIN=http://your-server-ip
APP_BASE_URL=http://your-server-ip

# Neo4j — use the host IP or DNS name, not "localhost"
NEO4J_URI=bolt://172.31.14.92:7683
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4jadmin

# Gemini (backend — ingestion & retrieval pipeline)
GEMINI_API_KEY=AIzaSy...

# Admin seed account — auto-approved as admin on first startup
ADMIN_SEED_EMAIL=admin@your-domain.com
```

Optional but recommended:

```env
# Email (leave SMTP_HOST empty to print links to logs instead)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="HORIBA Astra Knowledge System" <your@gmail.com>

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://your-server-ip/auth/google/callback
GOOGLE_OAUTH_ENABLED=true

# LDAP / Active Directory
LDAP_ENABLED=true
LDAP_URL=ldaps://HFRDC01.jy.fr
LDAP_DOMAIN=jy.fr
LDAP_BASE_DN=DC=jy,DC=fr
LDAP_SEARCH_ATTR=sAMAccountName
```

> **LDAP with self-signed certificate:** add `NODE_TLS_REJECT_UNAUTHORIZED: "0"` under
> the `backend → environment` section in `docker-compose.yml`.

---

## Step 4 — Initialise persistent data directories

```bash
# Create an empty SQLite database (schema is applied automatically on first start)
touch data/users.db

# Create the uploads directory
mkdir -p data/uploads
```

---

## Step 5 — Build and start

```bash
# From the docker/ directory
docker compose up -d --build
```

The first build takes several minutes (npm install + native addon compilation for `bcrypt` and
`better-sqlite3`). Subsequent builds reuse the layer cache.

---

## Step 6 — Verify

```bash
# Check both containers are healthy
docker compose ps

# Tail logs
docker compose logs -f

# Backend health endpoint
curl http://localhost/api/../health
# or directly: curl http://localhost:3001/health
```

Open `http://your-server-ip` in a browser.  
Log in with the `ADMIN_SEED_EMAIL` account (set password via the email registration flow, or use
LDAP/Google if configured).

---

## Day-2 operations

### Update the application (new code)

```bash
git pull
docker compose build
docker compose up -d
```

`data/` is never touched — users, chats, and KB images survive the update.

### Update credentials only

```bash
# Edit docker/data/backend.env, then:
docker compose restart backend
```

### Update `VITE_GEMINI_API_KEY`

The key is baked into the JS bundle at build time — a rebuild is required:

```bash
# Edit docker/.env, then:
docker compose build frontend
docker compose up -d frontend
```

### View backend logs

```bash
docker compose logs backend -f --tail=100
```

### Stop / start

```bash
docker compose down      # stops containers, preserves data volumes
docker compose up -d     # restarts without rebuilding
```

### Full reset (wipe Neo4j KB only)

Use the **Management → Reset KB** button in the admin UI.  
This deletes all `KBDocument`, `KBChunk`, `KBEntity` nodes in Neo4j and clears
`data/uploads/kb-images/`. SQLite (users, chats, messages) is not affected.

### Full reset (wipe everything including users)

```bash
docker compose down
rm data/users.db data/uploads -rf
touch data/users.db && mkdir -p data/uploads
docker compose up -d
```

---

## Neo4j setup

Astra Docs connects to an **existing** Neo4j 5.x instance. It does not manage Neo4j itself.

### Required Neo4j indexes

The indexes are created automatically when the backend starts (via `backend/graph/schema.js`).
If you are pointing at a fresh Neo4j instance, start the backend once — it will create:

```cypher
CREATE VECTOR INDEX kb_chunk_embedding  IF NOT EXISTS FOR (c:KBChunk)  ON (c.embedding)  OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } }
CREATE VECTOR INDEX kb_entity_embedding IF NOT EXISTS FOR (e:KBEntity) ON (e.embedding) OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } }
```

### Neo4j reachability

The backend container resolves `NEO4J_URI` from **inside Docker**. Use:
- The host machine's LAN IP (e.g. `bolt://172.31.14.92:7683`) ✓
- A DNS hostname visible on the Docker network ✓
- `localhost` or `127.0.0.1` ✗ — resolves to the container itself

---

## HTTPS (optional)

To serve over HTTPS, place a reverse proxy (Nginx, Traefik, Caddy) in front of the `frontend`
container, or replace `docker/nginx.conf` with an SSL-enabled configuration.

Key changes required when switching to HTTPS:
1. `FRONTEND_ORIGIN` and `APP_BASE_URL` → `https://your-domain.com`
2. `COOKIE_SECURE=true` in `backend.env`
3. `GOOGLE_REDIRECT_URI` → `https://your-domain.com/auth/google/callback`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Backend container exits immediately | Bad `backend.env` (syntax error or missing required var) | `docker compose logs backend` |
| Neo4j connection refused | `NEO4J_URI` uses `localhost` | Use host LAN IP instead |
| LDAP login fails with cert error | Self-signed LDAPS cert | Add `NODE_TLS_REJECT_UNAUTHORIZED: "0"` in compose |
| Images not loading after re-ingest | Old chunks in Neo4j (pre-fix) | Re-ingest — `purgeByFilepath` now cleans up before each file |
| `VITE_GEMINI_API_KEY` not working | Key not set at build time | Rebuild frontend: `docker compose build frontend` |
| Port 80 already in use | Another service on the host | Set `HTTP_PORT=8080` in `docker/.env` |
