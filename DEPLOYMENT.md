# DEPLOYMENT.md — Astra Docs

Deployment guide for production using Docker Compose.  
All deployment artifacts live in the `docker/` folder.

Two deployment modes are supported:

| Mode | When to use |
|------|-------------|
| **A — Package deploy** (recommended) | No git on the server. Build images on dev machine, ship a self-contained archive. |
| **B — Clone & build** | Git is available on the server. Clone the repo and build images there. |

---

## Mode A — Deploy without cloning the repository

Two sub-options depending on whether the target server can reach the internet.

---

### A1 — Via Docker Hub (recommended)

Images are pushed to `aipoclab` on Docker Hub.  
The server only needs Docker and a compose file — no source code, no tarballs.

#### On your dev machine (Windows) — push images

```powershell
# First time only — log in to Docker Hub
docker login -u aipoclab

# Build and push (run from the docker\ directory)
.\push.ps1              # pushes aipoclab/astra-docs-backend:latest
                        #        aipoclab/astra-docs-frontend:latest

# To push a versioned release as well:
.\push.ps1 1.2.0        # pushes :1.2.0 AND :latest
```

> **PowerShell execution policy:** if scripts are blocked, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

#### On the Linux server — first install

Copy the three files below to the server (no source code needed):

```
docker/docker-compose.release.yml  →  ~/astra-docs/docker-compose.yml
docker/.env.example                →  ~/astra-docs/.env.example
docker/data/backend.env.example    →  ~/astra-docs/data/backend.env.example
docker/install.sh                  →  ~/astra-docs/install.sh
```

Or copy them from your Windows machine with `scp` (available in PowerShell / CMD):

```powershell
# Run from the project root
ssh user@server "mkdir -p ~/astra-docs/data"
scp docker\docker-compose.release.yml user@server:~/astra-docs/docker-compose.yml
scp docker\.env.example               user@server:~/astra-docs/
scp docker\data\backend.env.example   user@server:~/astra-docs/data/
scp docker\install.sh                 user@server:~/astra-docs/
```

Then on the server:

```bash
cd ~/astra-docs
bash install.sh
```

`install.sh` will:
- Install Docker Engine if not present
- Create `data/` directories and an empty `users.db`
- Open `.env` and `data/backend.env` in `nano` for credentials
- Run `docker compose pull` (pulls images from Docker Hub)
- Start the stack

#### Updating the application

```powershell
# Windows dev machine — after code changes
cd docker
.\push.ps1
```

```bash
# Linux server — pull new images and restart
cd ~/astra-docs
docker compose pull && docker compose up -d
```

> `data/` is never touched — users, chats, KB images, and credentials survive every update.

---

### A2 — Via tarball (air-gapped servers, no internet)

Use this only if the target server cannot reach Docker Hub.

```powershell
# Windows dev machine — builds images and packages everything into one archive
cd docker
.\export.ps1
# produces docker\astra-docs-deploy-<date>.tar.gz
```

```powershell
# Transfer to the server
scp docker\astra-docs-deploy-*.tar.gz user@server:~/
```

```bash
# Linux server
tar -xzf astra-docs-deploy-*.tar.gz
cd astra-docs-deploy-*
bash install.sh    # loads images from tarballs, no internet needed
```

---

## Mode B — Clone & build on the server (Linux dev machine)

> Use this if your dev machine is Linux, git is available on the server,
> and you prefer to build images there. Use the bash scripts (`push.sh`, `export.sh`)
> instead of the PowerShell ones.

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
# Email — Resend (recommended) or SMTP fallback
# Priority: RESEND_API_KEY > SMTP_HOST > dev mode (links logged only)
RESEND_API_KEY=re_...
SMTP_FROM="HORIBA Astra Knowledge System" <noreply@your-domain.com>

# SMTP fallback (only used when RESEND_API_KEY is not set)
#SMTP_HOST=smtp.gmail.com
#SMTP_PORT=587
#SMTP_SECURE=false
#SMTP_USER=your@gmail.com
#SMTP_PASS=your-app-password
#SMTP_FROM="HORIBA Astra Knowledge System" <your@gmail.com>

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

## HTTPS

`nginx.conf` ships with HTTPS enabled (port 443) and HTTP→HTTPS redirect on port 80.
SSL certificates must be provided on the host and mounted into the frontend container.

### Option A — Self-signed certificate (IP address, no domain)

Use this when accessing the app by IP (e.g. `https://172.31.14.92:5234`).
Browsers will show a one-time security warning that you can bypass.

```bash
# On the Linux server — generate cert (valid 10 years)
sudo mkdir -p /etc/ssl/astra
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/astra/privkey.pem \
  -out /etc/ssl/astra/fullchain.pem \
  -subj "/CN=172.31.14.92" \
  -addext "subjectAltName=IP:172.31.14.92"
sudo chmod 644 /etc/ssl/astra/privkey.pem   # nginx must be able to read it
```

> **Important:** `privkey.pem` is created `600` (root only) by openssl.
> `chmod 644` is required — nginx inside the container cannot read it otherwise.

Set port mapping in `~/astra-docs/.env`:
```env
HTTPS_PORT=5234   # host port → container 443 (HTTPS)
HTTP_PORT=5235    # host port → container 80  (redirects to HTTPS)
```

Update `data/backend.env`:
```env
FRONTEND_ORIGIN=https://172.31.14.92:5234
APP_BASE_URL=https://172.31.14.92:5234
COOKIE_SECURE=true
```

### Option B — Let's Encrypt (requires a real domain)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
sudo mkdir -p /etc/ssl/astra
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /etc/ssl/astra/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem  /etc/ssl/astra/
sudo chmod 644 /etc/ssl/astra/privkey.pem
```

Auto-renew (add to cron):
```bash
sudo crontab -e
# Add:
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/*.pem /etc/ssl/astra/ && docker compose -f ~/astra-docs/docker-compose.yml restart frontend
```

### After any nginx.conf change — rebuild required

`nginx.conf` is baked into the Docker image at build time. After any change:
```powershell
# Windows dev machine
.\docker\push.ps1
```
```bash
# Linux server
docker compose pull && docker compose up -d
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Backend container exits immediately | Bad `backend.env` (syntax error or missing required var) | `docker compose logs backend` |
| Neo4j connection refused | `NEO4J_URI` uses `localhost` | Use host LAN IP instead |
| LDAP login fails with cert error | Self-signed LDAPS cert | Add `NODE_TLS_REJECT_UNAUTHORIZED: "0"` in compose |
| Images not loading after re-ingest | Old chunks in Neo4j (pre-fix) | Re-ingest — `purgeByFilepath` now cleans up before each file |
| KB images 404 — files missing from `data/uploads/` | `UPLOADS_DIR` env var not respected (RC-012) | Ensure `UPLOADS_DIR: /data/uploads` is set under backend `environment:` in compose; images were previously written inside the container layer |
| KB images 404 — files exist on disk but Nginx returns 404 | Nginx static-assets regex matched `.svg`/`.png` before the `/uploads/` proxy (RC-013) | Fixed in `docker/nginx.conf`: `location ^~ /uploads/` now appears before the static-assets regex block |
| `VITE_GEMINI_API_KEY` not working | Key not set at build time | Rebuild frontend: `docker compose build frontend` |
| Port 80 already in use | Another service on the host | Set `HTTP_PORT=8080` in `docker/.env` |
| HTTPS not working after nginx.conf edit | `nginx.conf` is baked into the image — server runs old image (RC-014) | Rebuild and push: `.\docker\push.ps1`, then `docker compose pull && docker compose up -d` on server |
| Frontend keeps restarting, cert file not found | Cert not generated on server before starting containers (RC-015) | Run `openssl` command to generate `/etc/ssl/astra/fullchain.pem` and `privkey.pem` first |
| Frontend keeps restarting, permission denied on privkey | `openssl` creates `privkey.pem` as `600` (root only) — nginx can't read it (RC-016) | `sudo chmod 644 /etc/ssl/astra/privkey.pem` |
| `https://<ip>:5234` refused after enabling HTTPS | `HTTP_PORT=5234` maps to container port 80, not 443 (RC-017) | Set `HTTPS_PORT=5234` and `HTTP_PORT=5235` in `~/astra-docs/.env` |
| Cert exists on host but nginx still can't find it | Server `docker-compose.yml` is an old copy without the ssl volume mount (RC-018) | Add `- /etc/ssl/astra:/etc/ssl/astra:ro` under `frontend: volumes:` in `~/astra-docs/docker-compose.yml` |
