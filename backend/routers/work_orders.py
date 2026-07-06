"""Work Order router — technician lifecycle."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db
from models import (WOAssignReq, WOCompleteReq, WOStatus, BreakdownStatus,
                       MachineStatus, uid, now_utc)
from deps import get_current_user, get_current_user_optional, require_admin_or_tech, require_admin, write_audit
from services import emit_timeline, set_machine_status

router = APIRouter(prefix="/api/work-orders", tags=["work_orders"])


@router.get("")
async def list_wo(
    department: Optional[str] = None,
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    line_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    active_only: bool = False,
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = None,
    limit: int = Query(500, le=5000),
    user=Depends(get_current_user_optional),
):
    db = get_db()
    q = {}
    if department:
        q["department"] = department
    if assigned_to == "me":
        if not user:
            return {"ok": True, "data": []}
        q["assigned_to"] = user["id"]
    elif assigned_to:
        q["assigned_to"] = assigned_to
    if status:
        q["status"] = status
    if active_only:
        q["status"] = {"$nin": [WOStatus.closed.value, WOStatus.cancelled.value]}
    if line_id:
        q["line_id"] = line_id
    if machine_id:
        q["machine_id"] = machine_id
    if from_ or to_:
        rng: dict = {}
        if from_:
            rng["$gte"] = from_
        if to_:
            rng["$lte"] = to_
        q["created_at"] = rng
    items = await db.work_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"ok": True, "data": items}


@router.get("/{wo_id}")
async def get_wo(wo_id: str, user=Depends(get_current_user_optional)):
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")
    events = await db.repair_events.find({"work_order_id": wo_id}, {"_id": 0}).sort("at", 1).to_list(500)
    bd = None
    if wo.get("breakdown_id"):
        bd = await db.breakdowns.find_one({"id": wo["breakdown_id"]}, {"_id": 0})
    return {"ok": True, "data": {"work_order": wo, "repair_events": events, "breakdown": bd}}


async def _emit_wo_event(wo: dict, event: str, actor_id: Optional[str], extra: dict | None = None):
    await emit_timeline(
        event, plant_id=wo.get("plant_id"), line_id=wo.get("line_id"),
        machine_id=wo.get("machine_id"), actor_id=actor_id,
        payload={"wo_no": wo.get("wo_no"), **(extra or {})},
        source="wo", ref_id=wo["id"],
    )


@router.post("/{wo_id}/assign")
async def assign_wo(wo_id: str, req: WOAssignReq, user=Depends(require_admin_or_tech)):
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")
    tech = await db.users.find_one({"id": req.assigned_to, "role": "technician"}, {"_id": 0, "password_hash": 0})
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")
    now = now_utc().isoformat()
    hist_entry = {"at": now, "by": user["id"], "to": req.assigned_to, "reason": req.reason}
    await db.work_orders.update_one({"id": wo_id}, {"$set": {
        "assigned_to": req.assigned_to, "assigned_at": now,
        "status": WOStatus.assigned.value, "updated_at": now, "updated_by": user["id"],
    }, "$push": {"assignment_history": hist_entry}})
    await db.breakdowns.update_one({"id": wo.get("breakdown_id")}, {"$set": {"status": BreakdownStatus.assigned.value}})
    wo2 = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    await _emit_wo_event(wo2, "wo.assigned", user["id"], {"technician_name": tech.get("full_name")})
    await write_audit(user["id"], "wo.assign", "work_order", wo_id, after={"assigned_to": req.assigned_to})
    return {"ok": True, "data": wo2}


@router.post("/{wo_id}/accept")
async def accept_wo(wo_id: str, user=Depends(require_admin_or_tech)):
    return await _transition(wo_id, user, expected_from=[WOStatus.assigned.value],
                              to=WOStatus.in_progress.value, field="accepted_at",
                              event="wo.accepted")


@router.post("/{wo_id}/start")
async def start_wo(wo_id: str, user=Depends(require_admin_or_tech)):
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")
    if wo["status"] not in (WOStatus.assigned.value, WOStatus.in_progress.value):
        raise HTTPException(status_code=400, detail={"code": "WO_INVALID_TRANSITION",
                                                       "current": wo["status"]})
    now = now_utc().isoformat()
    upd = {"status": WOStatus.in_progress.value, "updated_at": now, "updated_by": user["id"]}
    if not wo.get("repair_started_at"):
        upd["repair_started_at"] = now
        if wo.get("accepted_at"):
            upd["response_time_seconds"] = _delta(wo["assigned_at"], now)
    await db.work_orders.update_one({"id": wo_id}, {"$set": upd})
    await db.repair_events.insert_one({"id": uid(), "work_order_id": wo_id,
                                          "event_type": "start", "at": now, "by": user["id"],
                                          "created_at": now, "updated_at": now})
    await db.breakdowns.update_one({"id": wo.get("breakdown_id")},
                                       {"$set": {"status": BreakdownStatus.in_progress.value}})
    if wo.get("machine_id"):
        await set_machine_status(wo["machine_id"], MachineStatus.repair,
                                    breakdown_id=wo.get("breakdown_id"), actor_id=user["id"])
    wo2 = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    await _emit_wo_event(wo2, "wo.started", user["id"])
    return {"ok": True, "data": wo2}


@router.post("/{wo_id}/complete")
async def complete_wo(wo_id: str, req: WOCompleteReq, user=Depends(require_admin_or_tech)):
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")
    if wo["status"] not in (WOStatus.in_progress.value, WOStatus.assigned.value):
        raise HTTPException(status_code=400, detail={"code": "WO_INVALID_TRANSITION",
                                                       "current": wo["status"]})
    now = now_utc().isoformat()
    started = wo.get("repair_started_at") or wo.get("accepted_at") or wo.get("assigned_at") or wo.get("created_at")
    repair_secs = _delta(started, now) if started else None
    spares = [s.model_dump() if hasattr(s, "model_dump") else s for s in req.spares_used]

    await db.work_orders.update_one({"id": wo_id}, {"$set": {
        "status": WOStatus.completed.value,
        "repair_completed_at": now,
        "repair_time_seconds": repair_secs,
        "action_taken": req.action_taken,
        "root_cause": req.root_cause,
        "spares_used": spares,
        "updated_at": now, "updated_by": user["id"],
    }})
    await db.repair_events.insert_one({"id": uid(), "work_order_id": wo_id,
                                          "event_type": "complete", "at": now, "by": user["id"],
                                          "created_at": now, "updated_at": now})
    wo2 = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    await _emit_wo_event(wo2, "wo.completed", user["id"], {"action_taken": req.action_taken})
    # decrement spares
    for s in spares:
        if s.get("sap_code"):
            await db.spares.update_one({"sap_code": s["sap_code"]},
                                            {"$inc": {"on_hand": -float(s.get("qty") or 0)}})
    return {"ok": True, "data": wo2}


@router.post("/{wo_id}/close")
async def close_wo(wo_id: str, user=Depends(require_admin_or_tech)):
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")
    if wo["status"] != WOStatus.completed.value:
        raise HTTPException(status_code=400, detail={"code": "WO_INVALID_TRANSITION",
                                                       "current": wo["status"]})
    now = now_utc().isoformat()
    close_secs = _delta(wo.get("repair_completed_at"), now)
    await db.work_orders.update_one({"id": wo_id}, {"$set": {
        "status": WOStatus.closed.value, "closed_at": now,
        "close_time_seconds": close_secs,
        "updated_at": now, "updated_by": user["id"],
    }})
    # close breakdown, compute duration, set machine running
    if wo.get("breakdown_id"):
        bd = await db.breakdowns.find_one({"id": wo["breakdown_id"]}, {"_id": 0})
        if bd:
            duration = _delta(bd["breakdown_start_ts"], now) if bd.get("breakdown_start_ts") else None
            await db.breakdowns.update_one({"id": bd["id"]}, {"$set": {
                "status": BreakdownStatus.closed.value,
                "breakdown_end_ts": now, "duration_seconds": duration,
                "updated_at": now, "updated_by": user["id"],
            }})
    if wo.get("machine_id"):
        await set_machine_status(wo["machine_id"], MachineStatus.running,
                                    breakdown_id=None, actor_id=user["id"])
    await db.repair_events.insert_one({"id": uid(), "work_order_id": wo_id,
                                          "event_type": "close", "at": now, "by": user["id"],
                                          "created_at": now, "updated_at": now})
    wo2 = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    await _emit_wo_event(wo2, "wo.closed", user["id"])
    await write_audit(user["id"], "wo.close", "work_order", wo_id)
    return {"ok": True, "data": wo2}


async def _transition(wo_id, user, expected_from, to, field, event):
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")
    if wo["status"] not in expected_from:
        raise HTTPException(status_code=400, detail={"code": "WO_INVALID_TRANSITION",
                                                       "current": wo["status"],
                                                       "required": expected_from})
    now = now_utc().isoformat()
    upd = {"status": to, "updated_at": now, "updated_by": user["id"]}
    if field:
        upd[field] = now
    await db.work_orders.update_one({"id": wo_id}, {"$set": upd})
    wo2 = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    await _emit_wo_event(wo2, event, user["id"])
    return {"ok": True, "data": wo2}


def _delta(a, b) -> int:
    from datetime import datetime as _dt
    if not a or not b:
        return 0
    ta = _dt.fromisoformat(str(a).replace("Z", "+00:00"))
    tb = _dt.fromisoformat(str(b).replace("Z", "+00:00"))
    return max(0, int((tb - ta).total_seconds()))



# --------------- Edit WO (admin + technician) ---------------

# Fields the editor is allowed to modify (created_at is NOT here — audit-preserved)
_EDITABLE_TS_FIELDS = {
    "assigned_at",
    "accepted_at",
    "repair_started_at",
    "repair_completed_at",
    "closed_at",
}
_VALID_PRIORITIES = {"p1", "p2", "p3", "p4"}


def _parse_iso(s):
    from datetime import datetime as _dt
    if s is None or s == "":
        return None
    try:
        _dt.fromisoformat(str(s).replace("Z", "+00:00"))
        return s
    except ValueError:
        return "INVALID"


@router.patch("/{wo_id}")
async def edit_wo(wo_id: str, req: dict, user=Depends(require_admin_or_tech)):
    """Edit priority and timestamps on a work order.

    Body: any subset of { priority, assigned_at, accepted_at,
      repair_started_at, repair_completed_at, closed_at }.
    Timestamps must be ISO-8601 strings (or null to clear).
    Recomputes response_time_seconds / repair_time_seconds / close_time_seconds
    from the resulting values.
    """
    db = get_db()
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Not found")

    updates: dict = {}

    if "priority" in req:
        p = req["priority"]
        if p not in _VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail={
                "code": "WO_INVALID_PRIORITY",
                "message": f"priority must be one of {sorted(_VALID_PRIORITIES)}",
            })
        updates["priority"] = p

    for field in _EDITABLE_TS_FIELDS:
        if field in req:
            parsed = _parse_iso(req[field])
            if parsed == "INVALID":
                raise HTTPException(status_code=400, detail={
                    "code": "WO_INVALID_TIMESTAMP",
                    "field": field, "value": req[field],
                })
            updates[field] = parsed  # may be None (clear the field)

    if not updates:
        raise HTTPException(status_code=400, detail="No editable fields provided")

    # Apply
    now = now_utc().isoformat()
    updates["updated_at"] = now
    updates["updated_by"] = user["id"]
    await db.work_orders.update_one({"id": wo_id}, {"$set": updates})

    # Recompute derived durations
    wo2 = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    derived: dict = {}
    if wo2.get("assigned_at") and wo2.get("repair_started_at"):
        derived["response_time_seconds"] = _delta(wo2["assigned_at"], wo2["repair_started_at"])
    if wo2.get("repair_started_at") and wo2.get("repair_completed_at"):
        derived["repair_time_seconds"] = _delta(wo2["repair_started_at"], wo2["repair_completed_at"])
    if wo2.get("assigned_at") and wo2.get("closed_at"):
        derived["close_time_seconds"] = _delta(wo2["assigned_at"], wo2["closed_at"])
    if derived:
        await db.work_orders.update_one({"id": wo_id}, {"$set": derived})
        wo2.update(derived)

    await _emit_wo_event(wo2, "wo.edited", user["id"], {"fields": list(updates.keys())})
    await write_audit(user["id"], "wo.edit", "work_order", wo_id,
                        before={k: wo.get(k) for k in updates.keys()}, after=updates)
    return {"ok": True, "data": wo2}
