"""Plant Runtime module — Date / Line / Calendar hrs / Dark hrs / Run time."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db
from models import RuntimeUpsertReq, uid, now_utc
from deps import get_current_user, require_admin, write_audit

router = APIRouter(prefix="/api/runtime", tags=["runtime"])


@router.get("")
async def list_runtime(
    line_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(200, le=2000),
    user=Depends(get_current_user),
):
    db = get_db()
    q: dict = {}
    if line_id:
        q["line_id"] = line_id
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        q["date"] = rng
    items = await db.runtime_logs.find(q, {"_id": 0}).sort("date", -1).to_list(limit)
    return {"ok": True, "data": items}


@router.post("")
async def upsert_runtime(req: RuntimeUpsertReq, admin=Depends(require_admin)):
    db = get_db()
    line = await db.production_lines.find_one({"id": req.line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    if req.calendar_hours < 0 or req.dark_hours < 0 or req.run_time_hours < 0:
        raise HTTPException(status_code=400, detail="Hours must be non-negative")
    if req.run_time_hours > req.calendar_hours:
        raise HTTPException(status_code=400, detail={
            "code": "RUNTIME_INVALID",
            "message": "Run time cannot exceed calendar hours"
        })
    now = now_utc().isoformat()
    existing = await db.runtime_logs.find_one({"line_id": req.line_id, "date": req.date}, {"_id": 0})
    if existing:
        await db.runtime_logs.update_one(
            {"line_id": req.line_id, "date": req.date},
            {"$set": {
                "calendar_hours": req.calendar_hours,
                "dark_hours": req.dark_hours,
                "run_time_hours": req.run_time_hours,
                "notes": req.notes,
                "updated_at": now, "updated_by": admin["id"],
            }},
        )
        item = await db.runtime_logs.find_one({"line_id": req.line_id, "date": req.date}, {"_id": 0})
    else:
        item = {
            "id": uid(),
            "line_id": req.line_id, "date": req.date,
            "calendar_hours": req.calendar_hours,
            "dark_hours": req.dark_hours,
            "run_time_hours": req.run_time_hours,
            "notes": req.notes,
            "created_at": now, "updated_at": now,
            "created_by": admin["id"], "updated_by": admin["id"],
        }
        await db.runtime_logs.insert_one(item)
        item.pop("_id", None)
    await write_audit(admin["id"], "runtime.upsert", "runtime_log", item["id"], after=item)
    return {"ok": True, "data": item}


@router.delete("/{runtime_id}")
async def delete_runtime(runtime_id: str, admin=Depends(require_admin)):
    db = get_db()
    r = await db.runtime_logs.delete_one({"id": runtime_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    await write_audit(admin["id"], "runtime.delete", "runtime_log", runtime_id)
    return {"ok": True}
