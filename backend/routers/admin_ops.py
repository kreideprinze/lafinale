"""Admin ops — data wipe, demo seed, data summary. Admin-only endpoints."""
from fastapi import APIRouter, Depends
from db import get_db
from deps import require_admin, write_audit
from seed import seed_demo_data

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Collections we consider "transactional" — wiped by /wipe-transactional
TRANSACTIONAL_COLLECTIONS = [
    "breakdowns",
    "work_orders",
    "repair_events",
    "runtime_logs",
    "notifications",
    "timeline_events",
    "audit_logs",
    "machine_status",
    "counters",
]

# Collections considered "demo master data" — wiped by /wipe-demo
DEMO_MASTER_COLLECTIONS = [
    "machines",
    "machine_groups",
    "production_lines",
    "plants",
    "failure_modes",
    "spares",
]


@router.get("/data-summary")
async def data_summary(admin=Depends(require_admin)):
    """Return per-collection counts so the admin knows what's in the DB."""
    db = get_db()
    all_cols = TRANSACTIONAL_COLLECTIONS + DEMO_MASTER_COLLECTIONS + ["users"]
    out = {}
    for c in all_cols:
        try:
            out[c] = await db[c].count_documents({})
        except Exception:
            out[c] = 0
    return {"ok": True, "data": out}


@router.post("/wipe-transactional")
async def wipe_transactional(admin=Depends(require_admin)):
    """Delete all transactional records but keep master data + users."""
    db = get_db()
    result = {}
    for c in TRANSACTIONAL_COLLECTIONS:
        r = await db[c].delete_many({})
        result[c] = r.deleted_count
    await write_audit(admin["id"], "admin.wipe_transactional", "system", "all", after=result)
    return {"ok": True, "data": result}


@router.post("/wipe-demo")
async def wipe_demo(admin=Depends(require_admin)):
    """Full nuke of demo data: transactional + master (machines/lines/plant/failure modes).

    Keeps: users, settings.
    Use this to convert a demo install into an empty production install.
    """
    db = get_db()
    result = {}
    for c in TRANSACTIONAL_COLLECTIONS + DEMO_MASTER_COLLECTIONS:
        r = await db[c].delete_many({})
        result[c] = r.deleted_count
    await write_audit(admin["id"], "admin.wipe_demo", "system", "all", after=result)
    return {"ok": True, "data": result}


@router.post("/seed-demo")
async def seed_demo(admin=Depends(require_admin)):
    """Populate the demo dataset: 3 departments, 6+ lines, machines, failure modes."""
    await seed_demo_data()
    await write_audit(admin["id"], "admin.seed_demo", "system", "all")
    return {"ok": True}
