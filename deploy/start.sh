#!/usr/bin/env bash
# Start Factory CMMS Enterprise (MongoDB + Backend + Nginx).
# Idempotent — safe to run multiple times.
set -euo pipefail

APP_NAME="factory-cmms"

need_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Please run as root: sudo ./start.sh"; exit 1
  fi
}
need_root

detect_ip() {
  hostname -I 2>/dev/null | awk '{ for (i=1;i<=NF;i++) if ($i !~ /^127\./) { print $i; exit } }'
}
HOST_IP="$(detect_ip || true)"
[[ -z "${HOST_IP}" ]] && HOST_IP="127.0.0.1"

printf "\033[1;36mStarting Factory CMMS Enterprise...\033[0m\n"

systemctl start mongod
systemctl start ${APP_NAME}-backend.service
systemctl reload-or-restart nginx

sleep 2

# Wait for backend health
tries=0
until curl -fsS http://127.0.0.1:8001/api/health >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [[ $tries -gt 30 ]]; then
    echo "Backend did not become healthy in 30s. Recent logs:"
    journalctl -u ${APP_NAME}-backend.service -n 40 --no-pager
    exit 1
  fi
  sleep 1
done

echo
printf "\033[1;32m✓ All services running.\033[0m\n"
echo
printf "   MongoDB          \033[1;32mup\033[0m\n"
printf "   Backend (:8001)  \033[1;32mup\033[0m  (internal only)\n"
printf "   Nginx  (:80)     \033[1;32mup\033[0m\n"
echo
printf "   \033[1;36m➜  Open in any browser on this LAN:\033[0m\n"
printf "      \033[1;37mhttp://%s\033[0m\n" "${HOST_IP}"
echo
printf "   Demo accounts:\n"
printf "     admin@factory.local / Admin@123\n"
printf "     tech@factory.local  / Tech@123\n"
printf "     op@factory.local    / Op@123\n"
echo
