"""Verify installation — env vars present, Mongo reachable, admin user seeded.

Run: python /app/backend/verify_install.py
Exits non-zero on failure so it can be used in CI / setup scripts.
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

REQUIRED_ENV = [
    "MONGO_URL",
    "DB_NAME",
    "JWT_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
]

OPTIONAL_ENV = [
    "CORS_ORIGINS",
    "TECH_EMAIL", "TECH_PASSWORD",
    "OPERATOR_EMAIL", "OPERATOR_PASSWORD",
    "BACKEND_UPLOADS_DIR",
]


def _ok(msg): print(f"  \033[32mOK\033[0m  {msg}")
def _warn(msg): print(f"  \033[33mWARN\033[0m {msg}")
def _err(msg): print(f"  \033[31mFAIL\033[0m {msg}")


async def main():
    print("Factory CMMS — Install Verification")
    print("=" * 40)

    # 1. Env vars
    print("\n[1/4] Environment variables")
    failures = 0
    for k in REQUIRED_ENV:
        v = os.environ.get(k)
        if v is None or v == "":
            _err(f"{k} missing")
            failures += 1
        else:
            _ok(f"{k} set")
    for k in OPTIONAL_ENV:
        if os.environ.get(k):
            _ok(f"{k} set (optional)")

    if failures:
        print(f"\n{failures} required env var(s) missing. Aborting.")
        sys.exit(2)

    # 2. Mongo reachable
    print("\n[2/4] MongoDB connectivity")
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=3000)
        await client.admin.command("ping")
        _ok(f"Connected to {os.environ['MONGO_URL']}")
    except Exception as e:
        _err(f"Cannot reach MongoDB: {e}")
        sys.exit(3)

    db = client[os.environ["DB_NAME"]]
    _ok(f"Using database `{os.environ['DB_NAME']}`")

    # 3. Admin user
    print("\n[3/4] Admin user")
    admin_email = os.environ["ADMIN_EMAIL"].lower().strip()
    u = await db.users.find_one({"email": admin_email, "role": "admin"}, {"_id": 0})
    if u:
        _ok(f"Admin `{admin_email}` present (id={u['id'][:8]})")
    else:
        _warn(f"Admin `{admin_email}` not yet seeded (starts on first API boot)")

    # 4. Uploads dir writable
    print("\n[4/4] Uploads directory")
    up = Path(os.environ.get("BACKEND_UPLOADS_DIR", ROOT / "uploads"))
    try:
        up.mkdir(parents=True, exist_ok=True)
        probe = up / ".probe"
        probe.write_text("ok")
        probe.unlink()
        _ok(f"{up} writable")
    except Exception as e:
        _err(f"{up} not writable: {e}")
        sys.exit(4)

    # 5. Data summary (nice-to-know)
    print("\n[5/5] Data summary")
    for c in ("users", "plants", "production_lines", "machines", "breakdowns", "work_orders"):
        try:
            n = await db[c].count_documents({})
            print(f"  {c:22s} {n:>8d}")
        except Exception:
            print(f"  {c:22s} —")

    print("\nAll checks passed.")


if __name__ == "__main__":
    asyncio.run(main())
