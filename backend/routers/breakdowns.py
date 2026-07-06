"""Breakdown router — operator flow (create + list + close).

The operator "report a breakdown" flow supports TWO callers:
  1. Authenticated (technician/admin) via POST /api/breakdowns
  2. Public / operator kiosk via POST /api/breakdowns/report — NO auth required.
     Reporter identity is captured as a free-text `reporter_name`.

The heavy-lift create logic is shared through `_create_breakdown_core()`.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db
from models import (
    BreakdownCreateReq, PublicBreakdownReportReq,
    BreakdownStatus, WOStatus, Severity, MachineStatus,
    uid, now_utc,
)
from deps import get_current_user, get_current_user_optional, write_audit
from services import (
    emit_timeline, set_machine_status, notify,
    detect_repeat_failure, detect_infant_mortality,
)
from models import NotificationKind

router = APIRouter(prefix="/api/breakdowns", tags=["breakdowns"])


async def _next_ticket_no(db, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    key = f"{prefix}_{year}"
    r = await db.counters.find_one_and_update(
        {"key": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
    )
    seq = r["seq"] if r else 1
    return f"{prefix}-{year}-{seq:06d}"


def _auto_severity(machine: dict) -> str:
    c = machine.get("criticality_manual") or 0
    if c >= 8:
        return "critical"
    if c >= 5:
        return "high"
    if machine.get("kind") == "subsystem":
        return "medium"
    return "medium"


def _prio_for_sev(sev: str) -> str:
    return {"critical": "p1", "high": "p2", "medium": "p3", "low": "p4"}.get(sev, "p3")


async def _create_breakdown_core(
    *,
    machine_id: str,
    line_id: Optional[str],
    description: str,
    breakdown_type: str,
    reporter_name: str,
    reported_by_id: Optional[str],
    reporter_email: Optional[str],
    severity_override: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    breakdown_start_ts: Optional[datetime] = None,
    auto_create_work_order: bool = True,
) -> dict:
    """Shared breakdown creation. Returns {breakdown, work_order|None}."""
    db = get_db()
    machine = await db.machines.find_one({"id": machine_id}, {"_id": 0})
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    resolved_line_id = line_id or machine.get("line_id")
    line = await db.production_lines.find_one({"id": resolved_line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    if machine.get("is_packing"):
        raise HTTPException(status_code=400, detail={
            "code": "BD_NON_METRIC",
            "message": "Cannot create breakdown for packing/dispatch terminator",
        })

    now = now_utc()
    start_ts = breakdown_start_ts or now
    severity = severity_override or _auto_severity(machine)
    ticket = await _next_ticket_no(db, "BD")

    actor_for_audit = reported_by_id or "public-operator"

    breakdown = {
        "id": uid(), "ticket_no": ticket,
        "plant_id": line["plant_id"], "line_id": resolved_line_id, "machine_id": machine_id,
        "department": machine.get("department", "process"),
        "reported_by": reported_by_id,
        "reporter_email": reporter_email,
        "reporter_name": reporter_name,
        "area_text": machine.get("name"),
        "equipment_text": machine.get("name"),
        "description": description.strip(),
        "failure_mode_id": failure_mode_id,
        "breakdown_type": breakdown_type,
        "date_of_breakdown": start_ts.date().isoformat(),
        "breakdown_start_ts": start_ts.isoformat(),
        "breakdown_end_ts": None, "duration_seconds": None,
        "status": BreakdownStatus.open.value, "severity": severity,
        "photos": [], "work_order_id": None,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
        "created_by": reported_by_id, "updated_by": reported_by_id,
    }
    await db.breakdowns.insert_one(breakdown)
    breakdown.pop("_id", None)

    wo = None
    if auto_create_work_order:
        wo_no = await _next_ticket_no(db, "WO")
        wo = {
            "id": uid(), "wo_no": wo_no, "breakdown_id": breakdown["id"],
            "plant_id": line["plant_id"], "line_id": resolved_line_id, "machine_id": machine_id,
            "department": machine.get("department", "process"),
            "type": "corrective", "priority": _prio_for_sev(severity),
            "status": WOStatus.open.value,
            "assigned_to": None, "assigned_at": None,
            "accepted_at": None, "repair_started_at": None,
            "repair_completed_at": None, "closed_at": None,
            "response_time_seconds": None, "repair_time_seconds": None, "close_time_seconds": None,
            "action_taken": None, "root_cause": None,
            "spares_used": [], "assignment_history": [],
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
            "created_by": reported_by_id, "updated_by": reported_by_id,
        }
        await db.work_orders.insert_one(wo)
        wo.pop("_id", None)
        await db.breakdowns.update_one({"id": breakdown["id"]}, {"$set": {"work_order_id": wo["id"]}})
        breakdown["work_order_id"] = wo["id"]

    await set_machine_status(
        machine_id, MachineStatus.failed,
        breakdown_id=breakdown["id"], actor_id=reported_by_id,
    )
    await emit_timeline(
        "breakdown.created",
        plant_id=line["plant_id"], line_id=resolved_line_id,
        machine_id=machine_id, actor_id=reported_by_id,
        payload={
            "ticket_no": ticket,
            "wo_no": wo["wo_no"] if wo else None,
            "severity": severity,
            "machine_name": machine.get("name"),
            "reporter_name": reporter_name,
        },
        source="breakdown", ref_id=breakdown["id"],
    )
    await write_audit(actor_for_audit, "breakdown.create", "breakdown", breakdown["id"], after=breakdown)

    # Alerts
    await notify(
        NotificationKind.machine_down, f"Machine down: {machine.get('name')}",
        f"{ticket} — {description[:120]} (reporter: {reporter_name})",
        severity=Severity(severity) if severity in ("low", "medium", "high", "critical") else Severity.medium,
        role_scope="technician", line_id=resolved_line_id, machine_id=machine_id,
        ref_type="breakdown", ref_id=breakdown["id"],
    )
    if severity == "critical":
        await notify(
            NotificationKind.critical, f"CRITICAL failure: {machine.get('name')}",
            f"Immediate attention required — {ticket}",
            severity=Severity.critical, role_scope="admin",
            line_id=resolved_line_id, machine_id=machine_id,
            ref_type="breakdown", ref_id=breakdown["id"],
        )

    rf = await detect_repeat_failure(machine_id, failure_mode_id)
    if rf:
        await notify(
            NotificationKind.repeat_failure, f"Repeat failure detected: {machine.get('name')}",
            f"{rf['count']} occurrences of same failure mode in {rf['window_days']} days",
            severity=Severity.high, role_scope="admin",
            line_id=resolved_line_id, machine_id=machine_id,
            ref_type="breakdown", ref_id=breakdown["id"],
        )
    im = await detect_infant_mortality(machine_id)
    if im:
        await notify(
            NotificationKind.infant_mortality, f"Infant mortality: {machine.get('name')}",
            f"Failure {im['hours_since_last_repair']}h after last repair ({im.get('last_wo_no')})",
            severity=Severity.high, role_scope="admin",
            line_id=resolved_line_id, machine_id=machine_id,
            ref_type="breakdown", ref_id=breakdown["id"],
        )

    return {"breakdown": breakdown, "work_order": wo}


# ---------------- AUTHENTICATED create (technician / admin creating on behalf) ----------------
@router.post("")
async def create_breakdown(req: BreakdownCreateReq, user=Depends(get_current_user)):
    reporter_name = (req.reporter_name or "").strip() or user.get("full_name") or user.get("email")
    result = await _create_breakdown_core(
        machine_id=req.machine_id,
        line_id=req.line_id,
        description=req.description,
        breakdown_type=req.breakdown_type.value if hasattr(req.breakdown_type, "value") else req.breakdown_type,
        reporter_name=reporter_name,
        reported_by_id=user["id"],
        reporter_email=user.get("email"),
        severity_override=(req.severity.value if req.severity else None),
        failure_mode_id=req.failure_mode_id,
        breakdown_start_ts=req.breakdown_start_ts,
        auto_create_work_order=req.auto_create_work_order,
    )
    return {"ok": True, "data": result}


# ---------------- PUBLIC / operator kiosk report — NO AUTH ----------------
@router.post("/report")
async def report_breakdown_public(req: PublicBreakdownReportReq):
    """Anonymous breakdown report for operators on the shop floor.

    No authentication required — designed for shared operator terminals
    where operators change every shift. Reporter identity captured as
    free-text `reporter_name`.
    """
    result = await _create_breakdown_core(
        machine_id=req.machine_id,
        line_id=None,  # resolved from machine
        description=req.description,
        breakdown_type=req.breakdown_type.value if hasattr(req.breakdown_type, "value") else req.breakdown_type,
        reporter_name=req.reporter_name.strip(),
        reported_by_id=None,
        reporter_email=None,
        auto_create_work_order=req.auto_create_work_order,
    )
    return {"ok": True, "data": result}


@router.get("")
async def list_breakdowns(
    department: Optional[str] = None,
    line_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    status: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    reported_by: Optional[str] = None,
    active_only: bool = False,
    from_: Optional[str] = Query(None, alias="from"),
    to_: Optional[str] = None,
    limit: int = Query(500, le=5000),
    user=Depends(get_current_user_optional),
):
    """List breakdowns. Public — used by Control Room active list.

    `active_only=true` returns only non-closed breakdowns.
    """
    db = get_db()
    q = {}
    if department:
        q["department"] = department
    if line_id:
        q["line_id"] = line_id
    if machine_id:
        q["machine_id"] = machine_id
    if status:
        q["status"] = status
    if active_only:
        q["status"] = {"$nin": [BreakdownStatus.closed.value, BreakdownStatus.cancelled.value]}
    if failure_mode_id:
        q["failure_mode_id"] = failure_mode_id
    if reported_by:
        q["reported_by"] = reported_by
    if from_ or to_:
        rng: dict = {}
        if from_:
            rng["$gte"] = from_
        if to_:
            rng["$lte"] = to_
        q["breakdown_start_ts"] = rng
    items = await db.breakdowns.find(q, {"_id": 0}).sort("breakdown_start_ts", -1).to_list(limit)
    return {"ok": True, "data": items}


@router.get("/{bd_id}")
async def get_breakdown(bd_id: str, user=Depends(get_current_user_optional)):
    db = get_db()
    b = await db.breakdowns.find_one({"id": bd_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True, "data": b}
