#!/usr/bin/env bash
# docker/export.sh — build images and create a self-contained deployment package
#                    (for servers with no internet access — no Docker Hub needed).
#
# For servers that CAN reach Docker Hub, use push.sh instead.
#
# Usage (run from the docker/ directory):
#   bash export.sh
#
# Output:
#   astra-docs-deploy-<date>.tar.gz   ready to transfer to any Linux server

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATE=$(date +%Y%m%d)
PACKAGE="astra-docs-deploy-${DATE}"
DIST="${SCRIPT_DIR}/${PACKAGE}"

# ── 1. Load compose env (VITE_GEMINI_API_KEY) ──────────────────────────────────
if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
  echo "ERROR: docker/.env not found. Copy .env.example and fill it in first."
  exit 1
fi
set -a; source "${SCRIPT_DIR}/.env"; set +a

if [[ -z "${VITE_GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: VITE_GEMINI_API_KEY is not set in docker/.env"
  exit 1
fi

# ── 2. Build ───────────────────────────────────────────────────────────────────
echo "==> Building images (this may take several minutes on first run)..."
cd "${SCRIPT_DIR}"
docker compose build

# Tag with aipoclab/ prefix so release compose file matches
docker tag astra-docs-backend:latest  aipoclab/astra-docs-backend:latest
docker tag astra-docs-frontend:latest aipoclab/astra-docs-frontend:latest

# ── 3. Save images to tar files ────────────────────────────────────────────────
echo "==> Saving images (this may take a while)..."
mkdir -p "${DIST}/images"
docker save aipoclab/astra-docs-backend:latest  | gzip > "${DIST}/images/astra-docs-backend.tar.gz"
docker save aipoclab/astra-docs-frontend:latest | gzip > "${DIST}/images/astra-docs-frontend.tar.gz"

# ── 4. Copy deployment files ───────────────────────────────────────────────────
echo "==> Assembling deploy package..."
cp "${SCRIPT_DIR}/docker-compose.release.yml" "${DIST}/docker-compose.yml"
cp "${SCRIPT_DIR}/.env.example"               "${DIST}/.env.example"
mkdir -p "${DIST}/data"
cp "${SCRIPT_DIR}/data/backend.env.example"   "${DIST}/data/backend.env.example"

# install.sh variant that loads from tarballs instead of pulling from Hub
cat > "${DIST}/install.sh" << 'INSTALL'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"
green()  { echo -e "\033[0;32m$*\033[0m"; }
yellow() { echo -e "\033[1;33m$*\033[0m"; }
red()    { echo -e "\033[0;31m$*\033[0m"; }
ask()    { read -rp "$(yellow "$1")" "$2"; }

if ! command -v docker &>/dev/null; then
  green "==> Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  green "    Docker installed. Log out and back in, then re-run this script."
  exit 0
fi

green "==> Loading images from tarballs..."
for tar in images/*.tar images/*.tar.gz; do
  [[ -f "$tar" ]] || continue
  echo "    loading ${tar}..."
  docker load < "${tar}"
done

mkdir -p data/uploads
[[ ! -f data/users.db ]] && touch data/users.db

[[ ! -f .env ]] && { cp .env.example .env; yellow "==> Edit .env (HTTP_PORT)"; ask "Press Enter to open in nano..." _; nano .env; }
[[ ! -f data/backend.env ]] && { cp data/backend.env.example data/backend.env; yellow "==> Edit data/backend.env (NEO4J, GEMINI_API_KEY, FRONTEND_ORIGIN, ADMIN_SEED_EMAIL)"; ask "Press Enter to open in nano..." _; nano data/backend.env; }

green "==> Starting Astra Docs..."
docker compose up -d
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
HTTP_PORT=$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '"' || echo 80)
green "==> Done — open http://${HOST_IP}:${HTTP_PORT}"
INSTALL
chmod +x "${DIST}/install.sh"

# ── 5. Create the archive ──────────────────────────────────────────────────────
cd "${SCRIPT_DIR}"
tar -czf "${PACKAGE}.tar.gz" "${PACKAGE}"
rm -rf "${DIST}"

echo ""
echo "==> Done: docker/${PACKAGE}.tar.gz"
echo ""
echo "Transfer to the Linux server, then:"
echo "  scp docker/${PACKAGE}.tar.gz user@server:~/"
echo "  ssh user@server"
echo "  tar -xzf ${PACKAGE}.tar.gz && cd ${PACKAGE} && bash install.sh"
