"""Core services: timeline emitter, machine status transitions, reliability engine, notifications."""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import uuid

from db import get_db
from ws_hub import hub
from models import MachineStatus, BreakdownStatus, WOStatus, NotificationKind, Severity


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- TIMELINE ----------------
async def emit_timeline(kind: str, *, plant_id=None, line_id=None, machine_id=None,
                        actor_id=None, payload=None, source="system", ref_id=None) -> None:
    db = get_db()
    doc = {
        "id": _uid(),
        "at": _now(),
        "plant_id": plant_id,
        "line_id": line_id,
        "machine_id": machine_id,
        "actor_id": actor_id,
        "kind": kind,
        "payload": payload or {},
        "source": source,
        "ref_id": ref_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.timeline_events.insert_one(doc)
    if line_id:
        await hub.broadcast(f"line:{line_id}", kind, {
            "machine_id": machine_id, "ref_id": ref_id, **(payload or {})
        })
    if plant_id:
        await hub.broadcast(f"plant:{plant_id}", kind, {
            "line_id": line_id, "machine_id": machine_id, "ref_id": ref_id, **(payload or {})
        })


# ---------------- MACHINE STATUS ----------------
async def set_machine_status(machine_id: str, status: MachineStatus,
                              breakdown_id: Optional[str] = None,
                              actor_id: Optional[str] = None) -> None:
    db = get_db()
    machine = await db.machines.find_one({"id": machine_id}, {"_id": 0})
    if not machine:
        return
    prev = machine.get("status")
    await db.machines.update_one(
        {"id": machine_id},
        {"$set": {"status": status.value, "current_breakdown_id": breakdown_id,
                  "updated_at": _now(), "updated_by": actor_id}},
    )
    await db.machine_status.update_one(
        {"machine_id": machine_id},
        {"$set": {
            "machine_id": machine_id,
            "status": status.value,
            "since": _now(),
            "current_breakdown_id": breakdown_id,
            "updated_at": _now(),
        }},
        upsert=True,
    )
    if prev != status.value:
        await emit_timeline(
            "machine.status_changed",
            plant_id=machine.get("plant_id"),
            line_id=machine.get("line_id"),
            machine_id=machine_id,
            actor_id=actor_id,
            payload={"from": prev, "to": status.value, "code": machine.get("code"),
                     "name": machine.get("name")},
            source="system",
            ref_id=breakdown_id,
        )


# ---------------- NOTIFICATIONS ----------------
async def notify(kind: NotificationKind, title: str, body: str, *,
                 severity: Severity = Severity.medium, user_id: Optional[str] = None,
                 role_scope: Optional[str] = None, line_id: Optional[str] = None,
                 machine_id: Optional[str] = None, ref_type: Optional[str] = None,
                 ref_id: Optional[str] = None) -> None:
    db = get_db()
    doc = {
        "id": _uid(),
        "user_id": user_id,
        "role_scope": role_scope,
        "line_id": line_id,
        "machine_id": machine_id,
        "kind": kind.value if hasattr(kind, "value") else str(kind),
        "severity": severity.value if hasattr(severity, "value") else str(severity),
        "title": title,
        "body": body,
        "read_at": None,
        "ref_type": ref_type,
        "ref_id": ref_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    if user_id:
        await hub.broadcast(f"user:{user_id}", "notification.new", doc)
    if role_scope:
        await hub.broadcast(f"role:{role_scope}", "notification.new", doc)
    if line_id:
        await hub.broadcast(f"line:{line_id}", "alert.raised", doc)


# ---------------- RELIABILITY ENGINE ----------------
def _parse_dt(v) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


async def _runtime_hours_for_line(line_id: str, dt_from: datetime, dt_to: datetime) -> Optional[float]:
    """Sum run_time_hours from runtime_logs for line within window. None if no logs."""
    db = get_db()
    d_from = dt_from.date().isoformat()
    d_to = dt_to.date().isoformat()
    cursor = db.runtime_logs.find(
        {"line_id": line_id, "date": {"$gte": d_from, "$lte": d_to}},
        {"_id": 0, "run_time_hours": 1, "calendar_hours": 1, "dark_hours": 1},
    )
    total_run = 0.0
    found = False
    async for r in cursor:
        found = True
        total_run += float(r.get("run_time_hours", 0) or 0)
    return total_run if found else None


async def _breakdowns_in_window(machine_id: Optional[str], line_id: Optional[str],
                                 dt_from: datetime, dt_to: datetime) -> List[dict]:
    db = get_db()
    q: Dict[str, Any] = {"breakdown_start_ts": {"$gte": dt_from.isoformat(),
                                                  "$lte": dt_to.isoformat()}}
    if machine_id:
        q["machine_id"] = machine_id
    elif line_id:
        q["line_id"] = line_id
    return await db.breakdowns.find(q, {"_id": 0}).to_list(100000)


async def _closed_wos_in_window(machine_id: Optional[str], line_id: Optional[str],
                                 dt_from: datetime, dt_to: datetime) -> List[dict]:
    db = get_db()
    q: Dict[str, Any] = {
        "status": {"$in": ["completed", "closed"]},
        "closed_at": {"$ne": None, "$gte": dt_from.isoformat(), "$lte": dt_to.isoformat()},
    }
    if machine_id:
        q["machine_id"] = machine_id
    elif line_id:
        q["line_id"] = line_id
    return await db.work_orders.find(q, {"_id": 0}).to_list(100000)


async def compute_kpis(*, machine_id: Optional[str] = None, line_id: Optional[str] = None,
                        dt_from: datetime, dt_to: datetime) -> Dict[str, Any]:
    """Returns MTTR, MTBF, Availability, sample sizes. Never fabricates."""
    db = get_db()

    # Skip packing terminators for machine-scope
    if machine_id:
        m = await db.machines.find_one({"id": machine_id}, {"_id": 0})
        if m and m.get("is_packing"):
            return {
                "mttr_seconds": None, "mtbf_seconds": None, "availability": None,
                "availability_display": "N/A (Packing)", "failures": 0, "downtime_seconds": 0,
                "n_closed_wo": 0, "note": "Packing/terminator excluded from analytics",
            }

    bds = await _breakdowns_in_window(machine_id, line_id, dt_from, dt_to)
    wos = await _closed_wos_in_window(machine_id, line_id, dt_from, dt_to)

    downtime_s = sum([int(b.get("duration_seconds") or 0) for b in bds])
    failures = len(bds)

    # MTTR from closed WO repair time
    repair_times = [int(w.get("repair_time_seconds") or 0) for w in wos
                    if (w.get("repair_time_seconds") or 0) > 0]
    mttr = (sum(repair_times) / len(repair_times)) if repair_times else None

    # Availability
    if line_id and not machine_id:
        run_hours = await _runtime_hours_for_line(line_id, dt_from, dt_to)
    elif machine_id:
        m = await db.machines.find_one({"id": machine_id}, {"_id": 0})
        run_hours = await _runtime_hours_for_line(m["line_id"], dt_from, dt_to) if m else None
    else:
        run_hours = None

    if run_hours is None or run_hours <= 0:
        availability = None
        avail_display = "Availability Not Configured"
    else:
        planned_s = run_hours * 3600.0
        availability = max(0.0, (planned_s - downtime_s) / planned_s)
        avail_display = f"{availability * 100:.2f}%"

    # MTBF = operating_time / failures
    if failures > 0 and run_hours and run_hours > 0:
        operating_s = max(0.0, run_hours * 3600.0 - downtime_s)
        mtbf = operating_s / failures
    else:
        mtbf = None

    return {
        "mttr_seconds": mttr,
        "mtbf_seconds": mtbf,
        "availability": availability,
        "availability_display": avail_display,
        "failures": failures,
        "downtime_seconds": downtime_s,
        "n_closed_wo": len(repair_times),
        "window_from": dt_from.isoformat(),
        "window_to": dt_to.isoformat(),
    }


async def failure_pareto(machine_id: Optional[str], line_id: Optional[str],
                          dt_from: datetime, dt_to: datetime,
                          dim: str = "failure_mode") -> List[Dict[str, Any]]:
    bds = await _breakdowns_in_window(machine_id, line_id, dt_from, dt_to)
    db = get_db()
    if dim == "failure_mode":
        # need names
        modes = {m["id"]: m for m in await db.failure_modes.find({}, {"_id": 0}).to_list(1000)}
        agg: Dict[str, Dict[str, Any]] = {}
        for b in bds:
            key = b.get("failure_mode_id") or "unknown"
            e = agg.setdefault(key, {"key": key, "label": modes.get(key, {}).get("name") or "Unknown",
                                     "count": 0, "downtime_seconds": 0})
            e["count"] += 1
            e["downtime_seconds"] += int(b.get("duration_seconds") or 0)
        rows = sorted(agg.values(), key=lambda x: (-x["count"], -x["downtime_seconds"]))
    elif dim == "machine":
        machines = {m["id"]: m for m in await db.machines.find({}, {"_id": 0}).to_list(2000)}
        agg = {}
        for b in bds:
            k = b["machine_id"]
            e = agg.setdefault(k, {"key": k, "label": machines.get(k, {}).get("name") or k,
                                    "count": 0, "downtime_seconds": 0})
            e["count"] += 1
            e["downtime_seconds"] += int(b.get("duration_seconds") or 0)
        rows = sorted(agg.values(), key=lambda x: (-x["downtime_seconds"], -x["count"]))
    elif dim == "type":
        agg = {}
        for b in bds:
            k = b.get("breakdown_type") or "other"
            e = agg.setdefault(k, {"key": k, "label": k, "count": 0, "downtime_seconds": 0})
            e["count"] += 1
            e["downtime_seconds"] += int(b.get("duration_seconds") or 0)
        rows = sorted(agg.values(), key=lambda x: (-x["count"], -x["downtime_seconds"]))
    else:
        rows = []

    total = sum(r["count"] for r in rows) or 1
    cum = 0
    for r in rows:
        cum += r["count"]
        r["cumulative_pct"] = round(cum * 100.0 / total, 2)
    return rows


# ---------------- DETECTORS ----------------
async def detect_repeat_failure(machine_id: str, failure_mode_id: Optional[str],
                                  window_days: int = 30) -> Optional[dict]:
    if not failure_mode_id:
        return None
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
    prior = await db.breakdowns.count_documents({
        "machine_id": machine_id,
        "failure_mode_id": failure_mode_id,
        "breakdown_start_ts": {"$gte": since},
    })
    return {"count": prior, "window_days": window_days} if prior >= 2 else None


async def detect_infant_mortality(machine_id: str, hours: int = 72) -> Optional[dict]:
    db = get_db()
    last_closed = await db.work_orders.find_one(
        {"machine_id": machine_id, "status": {"$in": ["completed", "closed"]}},
        sort=[("closed_at", -1)],
        projection={"_id": 0},
    )
    if not last_closed or not last_closed.get("closed_at"):
        return None
    closed_at = _parse_dt(last_closed["closed_at"])
    if not closed_at:
        return None
    delta = datetime.now(timezone.utc) - closed_at
    if delta <= timedelta(hours=hours):
        return {"hours_since_last_repair": round(delta.total_seconds() / 3600, 2),
                "last_wo_no": last_closed.get("wo_no")}
    return None
