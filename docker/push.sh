#!/usr/bin/env bash
# docker/push.sh — build images and push to Docker Hub (aipoclab).
#
# Usage (run from the docker/ directory):
#   bash push.sh [tag]          # tag defaults to "latest"
#   bash push.sh 1.2.0          # also tags as 1.2.0 in addition to latest
#
# Prerequisites:
#   docker login -u aipoclab    # once — stores credentials in keychain

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HUB_ORG="aipoclab"
TAG="${1:-latest}"

BACKEND_IMAGE="${HUB_ORG}/astra-docs-backend"
FRONTEND_IMAGE="${HUB_ORG}/astra-docs-frontend"

# ── 1. Load compose env (VITE_GEMINI_API_KEY must be set for the frontend build) ─
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
echo "==> Building images (tag: ${TAG})..."
cd "${SCRIPT_DIR}"
docker compose build

# ── 3. Tag for Docker Hub ──────────────────────────────────────────────────────
echo "==> Tagging..."
docker tag astra-docs-backend:latest  "${BACKEND_IMAGE}:${TAG}"
docker tag astra-docs-frontend:latest "${FRONTEND_IMAGE}:${TAG}"

if [[ "${TAG}" != "latest" ]]; then
  docker tag astra-docs-backend:latest  "${BACKEND_IMAGE}:latest"
  docker tag astra-docs-frontend:latest "${FRONTEND_IMAGE}:latest"
fi

# ── 4. Push ────────────────────────────────────────────────────────────────────
echo "==> Pushing to Docker Hub..."
docker push "${BACKEND_IMAGE}:${TAG}"
docker push "${FRONTEND_IMAGE}:${TAG}"

if [[ "${TAG}" != "latest" ]]; then
  docker push "${BACKEND_IMAGE}:latest"
  docker push "${FRONTEND_IMAGE}:latest"
fi

echo ""
echo "==> Done. Images available at:"
echo "    https://hub.docker.com/r/${BACKEND_IMAGE}"
echo "    https://hub.docker.com/r/${FRONTEND_IMAGE}"
echo ""
echo "To deploy on any Linux server:"
echo "  1. Copy docker/docker-compose.release.yml, docker/.env.example,"
echo "     and docker/data/backend.env.example to the server."
echo "  2. Configure the env files."
echo "  3. Run: docker compose pull && docker compose up -d"
