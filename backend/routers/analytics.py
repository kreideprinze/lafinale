"""Analytics — reliability engine surface (per-machine, per-line, plant)."""
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db
from deps import get_current_user
from services import compute_kpis, failure_pareto

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _parse_window(from_: Optional[str], to_: Optional[str], default_days: int = 30):
    now = datetime.now(timezone.utc)
    dt_to = datetime.fromisoformat(to_.replace("Z", "+00:00")) if to_ else now
    dt_from = datetime.fromisoformat(from_.replace("Z", "+00:00")) if from_ \
        else dt_to - timedelta(days=default_days)
    return dt_from, dt_to


@router.get("/machine/{machine_id}/kpi")
async def machine_kpi(machine_id: str, from_: Optional[str] = Query(None, alias="from"),
                      to_: Optional[str] = None, user=Depends(get_current_user)):
    dt_from, dt_to = _parse_window(from_, to_)
    kpi = await compute_kpis(machine_id=machine_id, dt_from=dt_from, dt_to=dt_to)
    return {"ok": True, "data": kpi}


@router.get("/machine/{machine_id}/pareto")
async def machine_pareto(machine_id: str, dim: str = "failure_mode",
                          from_: Optional[str] = Query(None, alias="from"),
                          to_: Optional[str] = None, user=Depends(get_current_user)):
    dt_from, dt_to = _parse_window(from_, to_, default_days=90)
    rows = await failure_pareto(machine_id, None, dt_from, dt_to, dim=dim)
    return {"ok": True, "data": rows}


@router.get("/line/{line_id}/kpi")
async def line_kpi(line_id: str, from_: Optional[str] = Query(None, alias="from"),
                    to_: Optional[str] = None, user=Depends(get_current_user)):
    dt_from, dt_to = _parse_window(from_, to_)
    kpi = await compute_kpis(line_id=line_id, dt_from=dt_from, dt_to=dt_to)
    return {"ok": True, "data": kpi}


@router.get("/line/{line_id}/pareto")
async def line_pareto(line_id: str, dim: str = "machine",
                       from_: Optional[str] = Query(None, alias="from"),
                       to_: Optional[str] = None, user=Depends(get_current_user)):
    dt_from, dt_to = _parse_window(from_, to_, default_days=90)
    rows = await failure_pareto(None, line_id, dt_from, dt_to, dim=dim)
    return {"ok": True, "data": rows}


@router.get("/line/{line_id}/downtime-trend")
async def line_downtime_trend(line_id: str, days: int = 30, user=Depends(get_current_user)):
    """Daily downtime for a line."""
    db = get_db()
    dt_to = datetime.now(timezone.utc)
    dt_from = dt_to - timedelta(days=days)
    cursor = db.breakdowns.find({
        "line_id": line_id,
        "breakdown_start_ts": {"$gte": dt_from.isoformat()},
        "duration_seconds": {"$ne": None},
    }, {"_id": 0, "date_of_breakdown": 1, "duration_seconds": 1})
    buckets: dict[str, int] = {}
    async for b in cursor:
        d = b.get("date_of_breakdown") or ""
        buckets[d] = buckets.get(d, 0) + int(b.get("duration_seconds") or 0)
    # Fill missing days
    result = []
    for i in range(days + 1):
        d = (dt_from + timedelta(days=i)).date().isoformat()
        result.append({"date": d, "downtime_seconds": buckets.get(d, 0),
                        "downtime_minutes": round(buckets.get(d, 0) / 60.0, 1)})
    return {"ok": True, "data": result}


@router.get("/rankings")
async def rankings(dim: str = "machine", metric: str = "downtime", limit: int = 20,
                    line_id: Optional[str] = None, days: int = 30,
                    user=Depends(get_current_user)):
    """Rank machines by downtime, count, or MTTR."""
    db = get_db()
    dt_from = datetime.now(timezone.utc) - timedelta(days=days)
    q = {"breakdown_start_ts": {"$gte": dt_from.isoformat()}}
    if line_id:
        q["line_id"] = line_id
    bds = await db.breakdowns.find(q, {"_id": 0}).to_list(100000)
    machines = {m["id"]: m for m in await db.machines.find({"is_packing": {"$ne": True}}, {"_id": 0}).to_list(2000)}
    agg = {}
    for b in bds:
        mid = b["machine_id"]
        if mid not in machines:
            continue
        e = agg.setdefault(mid, {"machine_id": mid, "name": machines[mid]["name"],
                                    "line_id": machines[mid]["line_id"],
                                    "code": machines[mid].get("code"),
                                    "count": 0, "downtime_seconds": 0})
        e["count"] += 1
        e["downtime_seconds"] += int(b.get("duration_seconds") or 0)
    rows = list(agg.values())
    key = {"count": "count", "downtime": "downtime_seconds"}.get(metric, "downtime_seconds")
    rows.sort(key=lambda x: -x[key])
    return {"ok": True, "data": rows[:limit]}


@router.get("/machine/{machine_id}/history")
async def machine_history(machine_id: str, limit: int = 50, user=Depends(get_current_user)):
    db = get_db()
    bds = await db.breakdowns.find({"machine_id": machine_id}, {"_id": 0}).sort("breakdown_start_ts", -1).to_list(limit)
    wos = await db.work_orders.find({"machine_id": machine_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"ok": True, "data": {"breakdowns": bds, "work_orders": wos}}
