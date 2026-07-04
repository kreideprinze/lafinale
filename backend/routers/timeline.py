"""Timeline events + replay endpoints."""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from db import get_db
from deps import get_current_user

router = APIRouter(prefix="/api/timeline", tags=["timeline"])


@router.get("")
async def list_events(
    line_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    kinds: Optional[str] = None,      # comma-separated
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = None,
    limit: int = Query(200, le=2000),
    user=Depends(get_current_user),
):
    db = get_db()
    q: dict = {}
    if line_id:
        q["line_id"] = line_id
    if machine_id:
        q["machine_id"] = machine_id
    if kinds:
        q["kind"] = {"$in": [k.strip() for k in kinds.split(",") if k.strip()]}
    if from_ or to_:
        rng: dict = {}
        if from_:
            rng["$gte"] = from_
        if to_:
            rng["$lte"] = to_
        q["at"] = rng
    events = await db.timeline_events.find(q, {"_id": 0}).sort("at", -1).to_list(limit)
    return {"ok": True, "data": events}


@router.get("/replay")
async def replay(
    line_id: str,
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Return compressed frames for a line — chronological status_changed + breakdown events."""
    db = get_db()
    dt_to = datetime.fromisoformat(to_.replace("Z", "+00:00")) if to_ else datetime.now(timezone.utc)
    dt_from = datetime.fromisoformat(from_.replace("Z", "+00:00")) if from_ else (dt_to - timedelta(days=7))
    q = {
        "line_id": line_id,
        "at": {"$gte": dt_from.isoformat(), "$lte": dt_to.isoformat()},
        "kind": {"$in": ["machine.status_changed", "breakdown.created", "breakdown.closed",
                          "wo.assigned", "wo.started", "wo.completed", "wo.closed"]},
    }
    frames = await db.timeline_events.find(q, {"_id": 0}).sort("at", 1).to_list(10000)
    return {"ok": True, "data": {"from": dt_from.isoformat(), "to": dt_to.isoformat(), "frames": frames}}
