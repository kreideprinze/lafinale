#!/usr/bin/env bash
# ============================================================================
# Factory CMMS Enterprise — Ubuntu 22.04 LAN Installer
# ----------------------------------------------------------------------------
# Installs everything needed to run on a single Ubuntu machine so any device
# on the same LAN can reach the app at:  http://<HOST_IP>
#
# Prerequisites: fresh Ubuntu 22.04 (root or sudo).
# Usage:          chmod +x setup.sh && ./setup.sh
# ============================================================================
set -euo pipefail

# ---------- Config ----------
APP_NAME="factory-cmms"
INSTALL_DIR="/opt/${APP_NAME}"
WEB_ROOT="/var/www/${APP_NAME}"
BACKEND_SVC="/etc/systemd/system/${APP_NAME}-backend.service"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root

info()  { printf "\033[1;36m[INFO]\033[0m  %s\n" "$*"; }
ok()    { printf "\033[1;32m[ OK ]\033[0m  %s\n" "$*"; }
warn()  { printf "\033[1;33m[WARN]\033[0m  %s\n" "$*"; }
error() { printf "\033[1;31m[ERR ]\033[0m  %s\n" "$*"; exit 1; }

# ---------- Root check ----------
if [[ $EUID -ne 0 ]]; then
  error "Please run as root: sudo ./setup.sh"
fi

# ---------- Detect LAN IP ----------
detect_ip() {
  hostname -I 2>/dev/null | awk '{ for (i=1;i<=NF;i++) if ($i !~ /^127\./) { print $i; exit } }'
}
HOST_IP="$(detect_ip || true)"
[[ -z "${HOST_IP}" ]] && HOST_IP="127.0.0.1"
info "Detected LAN IP: ${HOST_IP}"

# ---------- System packages ----------
info "Updating apt cache..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

info "Installing base packages (curl, gnupg, ca-certificates, python3, nginx)..."
apt-get install -y \
  curl gnupg ca-certificates lsb-release \
  python3 python3-venv python3-pip \
  nginx build-essential

# ---------- MongoDB (official repo) ----------
if ! command -v mongod >/dev/null 2>&1; then
  info "Installing MongoDB Community 7.0..."
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -y
  apt-get install -y mongodb-org
  ok "MongoDB installed."
else
  ok "MongoDB already present."
fi
systemctl enable mongod
systemctl start mongod

# ---------- Node.js LTS + Yarn ----------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -c2- | cut -d. -f1)" -lt 18 ]]; then
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v yarn >/dev/null 2>&1; then
  info "Installing Yarn..."
  npm install -g yarn
fi
ok "Node $(node -v) · Yarn $(yarn -v)"

# ---------- Copy source ----------
info "Copying source to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
# rsync preserves permissions and is much faster than cp -r
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='frontend/build' \
    "${SRC_DIR}/" "${INSTALL_DIR}/"
else
  cp -r "${SRC_DIR}/." "${INSTALL_DIR}/"
fi

# ---------- Python virtualenv + backend deps ----------
info "Creating Python virtualenv..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip wheel setuptools >/dev/null
info "Installing backend requirements..."
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/backend/requirements.txt"

# ---------- Backend .env ----------
if [[ ! -f "${INSTALL_DIR}/backend/.env" ]]; then
  info "Creating backend .env from template..."
  JWT_SEC="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  cat > "${INSTALL_DIR}/backend/.env" <<EOF
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="factory_cmms"
CORS_ORIGINS="*"
JWT_SECRET="${JWT_SEC}"
ADMIN_EMAIL="admin@factory.local"
ADMIN_PASSWORD="Admin@123"
TECH_EMAIL="tech@factory.local"
TECH_PASSWORD="Tech@123"
OPERATOR_EMAIL="op@factory.local"
OPERATOR_PASSWORD="Op@123"
EOF
  chmod 640 "${INSTALL_DIR}/backend/.env"
  ok "Backend .env created with fresh JWT secret."
else
  ok "Backend .env already exists — leaving untouched."
fi

# ---------- Frontend build (same-origin) ----------
info "Building React frontend for production..."
cat > "${INSTALL_DIR}/frontend/.env.production" <<EOF
# Same-origin — served through nginx on port 80 alongside /api
REACT_APP_BACKEND_URL=
WDS_SOCKET_PORT=0
EOF

pushd "${INSTALL_DIR}/frontend" >/dev/null
yarn install --frozen-lockfile 2>/dev/null || yarn install
DISABLE_ESLINT_PLUGIN=true CI=false yarn build
popd >/dev/null

info "Publishing build to ${WEB_ROOT}..."
mkdir -p "${WEB_ROOT}"
rm -rf "${WEB_ROOT}"/*
cp -r "${INSTALL_DIR}/frontend/build/." "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"

# ---------- Nginx site ----------
info "Configuring Nginx..."
cat > "${NGINX_SITE}" <<'NGINX_EOF'
# ==== Factory CMMS Enterprise ==========================================
# Single-URL LAN deployment. Users open http://<HOST_IP>
# ======================================================================
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/factory-cmms;
    index index.html;

    # Increase for photo uploads / Excel imports
    client_max_body_size 32M;

    # Serve React SPA — history-mode fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-lived static assets
    location /static/ {
        access_log off;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # WebSocket for live SCADA twin updates
    location /api/ws {
        proxy_pass http://127.0.0.1:8001/api/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # REST API — hidden behind /api prefix, backend port never exposed
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX_EOF

ln -sf "${NGINX_SITE}" "${NGINX_ENABLED}"
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null
systemctl enable nginx
systemctl restart nginx
ok "Nginx configured on port 80."

# ---------- Backend systemd unit ----------
info "Creating systemd unit for backend..."
cat > "${BACKEND_SVC}" <<EOF
[Unit]
Description=Factory CMMS Enterprise Backend (FastAPI)
Documentation=https://${HOST_IP}/
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=${INSTALL_DIR}/backend/.env
ExecStart=${INSTALL_DIR}/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 1 --loop uvloop
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
KillSignal=SIGINT
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${APP_NAME}-backend.service
ok "Backend service registered."

# ---------- Firewall (allow port 80) ----------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null || true
  ok "Opened port 80 in ufw."
fi

# ---------- Done ----------
echo
ok "Installation complete."
echo
printf "\033[1;36mNext step:\033[0m  ./start.sh\n"
printf "\033[1;36mThen open:\033[0m  http://%s\n\n" "${HOST_IP}"
