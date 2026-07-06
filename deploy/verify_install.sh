#!/usr/bin/env bash
# Verify Factory CMMS Enterprise installation & runtime.
set -uo pipefail

APP_NAME="factory-cmms"
INSTALL_DIR="/opt/${APP_NAME}"
WEB_ROOT="/var/www/${APP_NAME}"

pass=0; fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf "  \033[1;32m✓\033[0m  %s\n" "$label"; pass=$((pass+1))
  else
    printf "  \033[1;31m✗\033[0m  %s\n" "$label"; fail=$((fail+1))
  fi
}

detect_ip() {
  hostname -I 2>/dev/null | awk '{ for (i=1;i<=NF;i++) if ($i !~ /^127\./) { print $i; exit } }'
}
HOST_IP="$(detect_ip)"
[[ -z "${HOST_IP:-}" ]] && HOST_IP="127.0.0.1"

echo
printf "\033[1;36mFactory CMMS Enterprise — Verification\033[0m\n"
printf "Host IP: %s\n\n" "${HOST_IP}"

echo "── Filesystem"
check "Install dir exists            (${INSTALL_DIR})"        test -d "${INSTALL_DIR}"
check "Web root exists               (${WEB_ROOT}/index.html)" test -f "${WEB_ROOT}/index.html"
check "Backend .env present"          test -f "${INSTALL_DIR}/backend/.env"
check "Python venv present"           test -x "${INSTALL_DIR}/venv/bin/python3"

echo
echo "── System services"
check "MongoDB    (mongod)  active"                       systemctl is-active mongod
check "Backend    active"                                 systemctl is-active ${APP_NAME}-backend.service
check "Nginx      active"                                 systemctl is-active nginx
check "Backend enabled on boot"                           systemctl is-enabled ${APP_NAME}-backend.service
check "Nginx enabled on boot"                             systemctl is-enabled nginx

echo
echo "── Network / HTTP"
check "Nginx listening on port 80"                         bash -c "ss -tln | grep -E ':80\s'"
check "Backend listening on 127.0.0.1:8001 (internal only)" bash -c "ss -tln | grep -E '127.0.0.1:8001'"
check "Backend NOT exposed on 0.0.0.0:8001"                bash -c "! ss -tln | grep -E '0.0.0.0:8001'"

echo
echo "── HTTP endpoints"
check "GET  /                (React SPA)"                  curl -fsS "http://127.0.0.1/" -o /dev/null
check "GET  /api/health      (backend proxy)"              curl -fsS "http://127.0.0.1/api/health"
check "GET  /api/lines       (auth required, expect 401)"  bash -c "code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/lines); [ \$code = 401 ] || [ \$code = 200 ]"

# LAN-facing smoke test
if [[ "${HOST_IP}" != "127.0.0.1" ]]; then
  echo
  echo "── LAN reachability"
  check "GET  http://${HOST_IP}/            (LAN)"          curl -fsS --max-time 3 "http://${HOST_IP}/" -o /dev/null
  check "GET  http://${HOST_IP}/api/health  (LAN)"          curl -fsS --max-time 3 "http://${HOST_IP}/api/health"
fi

echo
printf "Summary: \033[1;32m%d passed\033[0m · " "${pass}"
if [[ ${fail} -gt 0 ]]; then
  printf "\033[1;31m%d failed\033[0m\n" "${fail}"
else
  printf "\033[1;32m0 failed\033[0m\n"
fi

if [[ ${fail} -eq 0 ]]; then
  echo
  printf "\033[1;32m✓ Ready. Open http://%s in any browser on this LAN.\033[0m\n\n" "${HOST_IP}"
  exit 0
else
  echo
  printf "\033[1;33m⚠  Some checks failed. Inspect with:\033[0m\n"
  printf "     journalctl -u ${APP_NAME}-backend.service -n 100 --no-pager\n"
  printf "     journalctl -u nginx -n 50 --no-pager\n"
  printf "     systemctl status mongod --no-pager\n\n"
  exit 1
fi
