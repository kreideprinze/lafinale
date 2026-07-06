#!/usr/bin/env bash
# Restore MongoDB + uploads from a backup tarball produced by backup.sh
#
# Usage:  ./restore.sh <tarball>
#
# WARNING — this DROPS the target database before restoring.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
    echo "Usage: $0 <path-to-backup.tar.gz>"; exit 1
fi

if [[ -f "$ROOT/backend/.env" ]]; then
    set -a; source <(grep -v '^#' "$ROOT/backend/.env" | sed 's/^\([A-Z_]*\)="\?\([^"]*\)"\?$/\1=\2/'); set +a
fi
MONGO_URL="${MONGO_URL:?MONGO_URL not set}"
DB_NAME="${DB_NAME:?DB_NAME not set}"
UPLOADS="${BACKEND_UPLOADS_DIR:-$ROOT/backend/uploads}"

read -p "This will DROP database '$DB_NAME' and replace it. Type YES to continue: " ans
if [[ "$ans" != "YES" ]]; then
    echo "Aborted."; exit 2
fi

WORK="$(mktemp -d)"
echo "[restore] Extracting to $WORK"
tar -C "$WORK" -xzf "$ARCHIVE"

if [[ -d "$WORK/mongo/$DB_NAME" ]]; then
    echo "[restore] Restoring MongoDB"
    mongorestore --uri="$MONGO_URL" --db="$DB_NAME" --drop "$WORK/mongo/$DB_NAME"
else
    echo "[restore] WARN: no mongo/$DB_NAME dir in archive — skipping DB restore"
fi

if [[ -d "$WORK/uploads" ]]; then
    echo "[restore] Restoring uploads to $UPLOADS"
    mkdir -p "$UPLOADS"
    cp -r "$WORK/uploads/." "$UPLOADS/"
fi

rm -rf "$WORK"
echo "[restore] Done."
