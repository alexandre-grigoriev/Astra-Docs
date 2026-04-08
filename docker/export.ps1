# docker/export.ps1 — build images and create a self-contained deployment package.
#                     For servers with no internet access (no Docker Hub needed).
#
# Usage (from ANY directory):
#   .\docker\export.ps1
#
# Requirements: Docker Desktop, tar.exe (built into Windows 10+)

$ErrorActionPreference = "Stop"
$Date    = Get-Date -Format "yyyyMMdd"
$Package = "astra-docs-deploy-$Date"
$Dist    = Join-Path $PSScriptRoot $Package

# ── 1. Load docker/.env ───────────────────────────────────────────────────────
$EnvFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Error "docker\.env not found.`nCopy docker\.env.example to docker\.env and fill in VITE_GEMINI_API_KEY."
    exit 1
}

Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#=\s].*=' } | ForEach-Object {
    $parts = $_ -split '=', 2
    $key   = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
}

if (-not $env:VITE_GEMINI_API_KEY) {
    Write-Error "VITE_GEMINI_API_KEY is not set in docker\.env"
    exit 1
}

Push-Location $PSScriptRoot
try {
    # ── 2. Build ──────────────────────────────────────────────────────────────
    Write-Host "==> Building images..." -ForegroundColor Cyan
    docker compose build
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }

    docker tag astra-docs-backend:latest  aipoclab/astra-docs-backend:latest
    docker tag astra-docs-frontend:latest aipoclab/astra-docs-frontend:latest

    # ── 3. Save images (.tar — docker save does not support gzip directly) ───
    Write-Host "==> Saving images (this may take a while)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path "$Dist\images" | Out-Null

    docker save aipoclab/astra-docs-backend:latest  -o "$Dist\images\astra-docs-backend.tar"
    docker save aipoclab/astra-docs-frontend:latest -o "$Dist\images\astra-docs-frontend.tar"

    # ── 4. Copy deployment files ──────────────────────────────────────────────
    Write-Host "==> Assembling deploy package..." -ForegroundColor Cyan
    Copy-Item "$PSScriptRoot\docker-compose.release.yml" "$Dist\docker-compose.yml"
    Copy-Item "$PSScriptRoot\.env.example"               "$Dist\.env.example"
    New-Item -ItemType Directory -Force -Path "$Dist\data" | Out-Null
    Copy-Item "$PSScriptRoot\data\backend.env.example"   "$Dist\data\backend.env.example"
    Copy-Item "$PSScriptRoot\install.sh"                 "$Dist\install.sh"

    # ── 5. Create archive (tar.exe is built into Windows 10+) ─────────────────
    Write-Host "==> Creating archive..." -ForegroundColor Cyan
    $Archive = "$Package.tar.gz"
    # tar.exe is at C:\Windows\System32\tar.exe on Windows 10+
    & tar -czf $Archive $Package
    if ($LASTEXITCODE -ne 0) { throw "tar failed — requires Windows 10 build 17063 or later" }

    Remove-Item -Recurse -Force $Dist

} finally {
    Pop-Location
}

Write-Host ""
Write-Host "==> Done: docker\$Package.tar.gz" -ForegroundColor Green
Write-Host ""
Write-Host "Transfer to the Linux server:"
Write-Host "  scp docker\$Package.tar.gz user@server:~/"
Write-Host "  ssh user@server"
Write-Host "  tar -xzf $Package.tar.gz && cd $Package && bash install.sh"
