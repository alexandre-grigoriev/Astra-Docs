#!/usr/bin/env bash
# install.sh — first-time setup on the Linux target server.
# Run from inside the deployment package directory (where docker-compose.yml lives).
#
# What it does:
#   1. Installs Docker Engine if not present
#   2. Creates data/ directories and stub files
#   3. Prompts to configure env files
#   4. Pulls images from Docker Hub and starts the stack

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ── helpers ────────────────────────────────────────────────────────────────────
green()  { echo -e "\033[0;32m$*\033[0m"; }
yellow() { echo -e "\033[1;33m$*\033[0m"; }
red()    { echo -e "\033[0;31m$*\033[0m"; }
ask()    { read -rp "$(yellow "$1")" "$2"; }

# ── 1. Docker ──────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  green "==> Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  green ""
  green "    Docker installed."
  green "    IMPORTANT: log out and back in so group membership takes effect,"
  green "    then re-run this script."
  exit 0
else
  green "==> Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null 2>&1; then
  green "==> Docker Compose plugin not found — installing..."
  # Try the official plugin package first (works on Debian/Ubuntu)
  if command -v apt-get &>/dev/null; then
    # docker-compose-plugin lives in Docker's official repo, not Ubuntu's default.
    # Add it if not already present.
    if ! apt-cache show docker-compose-plugin &>/dev/null 2>&1; then
      green "    Adding Docker's official apt repository..."
      sudo apt-get install -y ca-certificates curl gnupg
      sudo install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
      sudo apt-get update -qq
    fi
    # Remove Ubuntu's docker-buildx which conflicts with Docker's docker-buildx-plugin
    sudo apt-get remove -y docker-buildx 2>/dev/null || true
    sudo apt-get install -y docker-compose-plugin
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y docker-compose-plugin
  elif command -v yum &>/dev/null; then
    sudo yum install -y docker-compose-plugin
  else
    red "ERROR: Cannot install Docker Compose plugin automatically."
    red "       Please install it manually: https://docs.docker.com/compose/install/"
    exit 1
  fi
  if ! docker compose version &>/dev/null 2>&1; then
    red "ERROR: Docker Compose plugin install failed. Please install manually."
    exit 1
  fi
  green "    Docker Compose installed: $(docker compose version)"
fi

# ── 2. Prepare data directory ──────────────────────────────────────────────────
green "==> Creating data directories..."
mkdir -p data/uploads
if [[ ! -f data/users.db ]]; then
  touch data/users.db
  echo "    Created empty data/users.db"
fi

# ── 3. Configure .env (compose) ────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  yellow ""
  yellow "==> ACTION REQUIRED: edit .env"
  yellow "    Set HTTP_PORT if port 80 is already in use (default: 80)."
  yellow "    VITE_GEMINI_API_KEY is already baked into the Docker Hub image — leave it empty."
  yellow ""
  ask "    Press Enter to open .env in nano (Ctrl+C to edit manually later)..." _
  nano .env
fi

# ── 4. Configure backend.env ───────────────────────────────────────────────────
if [[ ! -f data/backend.env ]]; then
  cp data/backend.env.example data/backend.env
  yellow ""
  yellow "==> ACTION REQUIRED: edit data/backend.env"
  yellow "    Mandatory fields:"
  yellow "      FRONTEND_ORIGIN  — public URL of this server (e.g. http://192.168.1.10)"
  yellow "      APP_BASE_URL     — same as FRONTEND_ORIGIN"
  yellow "      NEO4J_URI        — bolt://your-neo4j-host:7687"
  yellow "      NEO4J_PASSWORD   — your Neo4j password"
  yellow "      GEMINI_API_KEY   — backend Gemini key (ingestion & retrieval)"
  yellow "      ADMIN_SEED_EMAIL — first admin account email"
  yellow ""
  ask "    Press Enter to open data/backend.env in nano..." _
  nano data/backend.env
fi

# ── 5. Pull images from Docker Hub and start ───────────────────────────────────
green "==> Pulling images from Docker Hub..."
docker compose pull

green "==> Starting Astra Docs..."
docker compose up -d

echo ""
green "==> Done."
echo ""
echo "  Stack status : docker compose ps"
echo "  Logs         : docker compose logs -f"
echo "  Stop         : docker compose down"
echo ""
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
HTTP_PORT=$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '"' || echo 80)
echo "  Open in browser: http://${HOST_IP}:${HTTP_PORT}"
echo ""
