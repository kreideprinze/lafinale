#!/usr/bin/env bash
# Backup MongoDB database + uploaded assets into a timestamped tarball.
#
# Usage:  ./backup.sh [output-dir]
#
# Writes: <output-dir>/cmms-backup-YYYYMMDD-HHMMSS.tar.gz
#
# Restores are done via restore.sh <path-to-tarball>.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
mkdir -p "$OUT_DIR"

# Read env
if [[ -f "$ROOT/backend/.env" ]]; then
    set -a; source <(grep -v '^#' "$ROOT/backend/.env" | sed 's/^\([A-Z_]*\)="\?\([^"]*\)"\?$/\1=\2/'); set +a
fi
MONGO_URL="${MONGO_URL:?MONGO_URL not set}"
DB_NAME="${DB_NAME:?DB_NAME not set}"
UPLOADS="${BACKEND_UPLOADS_DIR:-$ROOT/backend/uploads}"

echo "[backup] Dumping MongoDB db=$DB_NAME"
mongodump --uri="$MONGO_URL" --db="$DB_NAME" --out="$WORK/mongo" --quiet

if [[ -d "$UPLOADS" ]]; then
    echo "[backup] Copying uploads from $UPLOADS"
    cp -r "$UPLOADS" "$WORK/uploads"
fi

ARCHIVE="$OUT_DIR/cmms-backup-$STAMP.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" .
echo "[backup] Wrote $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
rm -rf "$WORK"
