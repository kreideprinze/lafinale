#!/usr/bin/env bash
# Stop Factory CMMS Enterprise services.
set -euo pipefail

APP_NAME="factory-cmms"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root: sudo ./stop.sh"; exit 1
fi

printf "\033[1;36mStopping Factory CMMS Enterprise...\033[0m\n"

systemctl stop ${APP_NAME}-backend.service || true
# We leave nginx running (default OS service) and only disable the CMMS site
# by convention we don't stop it either — no other CMMS app on port 80.
# If desired, uncomment: systemctl stop nginx
# systemctl stop mongod          # Uncomment to also stop the database

printf "\033[1;32m✓ Backend stopped.\033[0m\n"
printf "   (Nginx and MongoDB left running — comment lines in stop.sh to also stop them.)\n"
