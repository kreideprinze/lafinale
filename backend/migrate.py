"""Simple forward-only schema migrations for MongoDB.

Migrations are async functions defined below and tracked in the
`schema_migrations` collection by version key. Idempotent: running twice
is safe.

Run:  python /app/backend/migrate.py
"""
import asyncio
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


# ---------------- migrations ----------------

async def m_2026_02_01_add_reporter_name(db):
    """Ensure every breakdown has a `reporter_name` (backfill from `reported_by` email)."""
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0}).to_list(500)}
    count = 0
    async for b in db.breakdowns.find({"reporter_name": {"$in": [None, ""]}}, {"_id": 0, "id": 1, "reported_by": 1}):
        name = None
        if b.get("reported_by") and b["reported_by"] in users:
            u = users[b["reported_by"]]
            name = u.get("full_name") or u.get("email") or "Unknown"
        else:
            name = "Imported"
        await db.breakdowns.update_one({"id": b["id"]}, {"$set": {"reporter_name": name}})
        count += 1
    return {"updated": count}


async def m_2026_02_11_default_priority(db):
    """Ensure work_orders without priority get 'p3'."""
    r = await db.work_orders.update_many({"priority": {"$in": [None, ""]}}, {"$set": {"priority": "p3"}})
    return {"updated": r.modified_count}


MIGRATIONS = [
    ("2026_02_01_add_reporter_name", m_2026_02_01_add_reporter_name),
    ("2026_02_11_default_priority", m_2026_02_11_default_priority),
]


async def main():
    url = os.environ.get("MONGO_URL")
    dbn = os.environ.get("DB_NAME")
    if not url or not dbn:
        print("MONGO_URL / DB_NAME missing")
        return
    client = AsyncIOMotorClient(url)
    db = client[dbn]

    applied = {m["version"] async for m in db.schema_migrations.find({}, {"_id": 0, "version": 1})}
    print(f"Applied so far: {len(applied)}")

    for version, fn in MIGRATIONS:
        if version in applied:
            print(f"  · skip {version}")
            continue
        print(f"  · running {version}…")
        result = await fn(db)
        await db.schema_migrations.insert_one({
            "version": version,
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "result": result,
        })
        print(f"    → {result}")

    print("Migrations complete.")


if __name__ == "__main__":
    asyncio.run(main())
