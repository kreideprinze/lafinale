"""Personnel analytics — per-reporter, per-technician stats + top performers."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from db import get_db
from deps import get_current_user
from models import BreakdownStatus, WOStatus


router = APIRouter(prefix="/api/analytics", tags=["personnel_analytics"])


def _iso_range_filter(from_ts: Optional[str], to_ts: Optional[str], field: str) -> dict:
    if not from_ts and not to_ts:
        return {}
    rng: dict = {}
    if from_ts:
        rng["$gte"] = from_ts
    if to_ts:
        rng["$lte"] = to_ts
    return {field: rng}


@router.get("/personnel")
async def personnel_analytics(
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    department: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Return per-reporter and per-technician stats + top-N performers.

    Response shape:
      reporters: [{ name, breakdowns_reported }]
      technicians: [{ user_id, name, work_orders_completed, total_repair_seconds,
                        avg_repair_seconds, avg_response_seconds }]
      top: {
        fastest_technician, slowest_technician,
        most_active_reporter, most_active_technician
      }
    """
    db = get_db()

    # Common department + range filters
    bd_range = _iso_range_filter(from_ts, to_ts, "breakdown_start_ts")
    wo_range = _iso_range_filter(from_ts, to_ts, "created_at")
    dept_bd: dict = {"department": department} if department else {}
    dept_wo: dict = {"department": department} if department else {}

    # ---------- Reporters (breakdowns_reported per reporter_name) ----------
    reporter_pipeline = [
        {"$match": {**bd_range, **dept_bd}},
        {"$group": {
            "_id": {"$ifNull": ["$reporter_name", "Unknown"]},
            "breakdowns_reported": {"$sum": 1},
        }},
        {"$sort": {"breakdowns_reported": -1}},
        {"$limit": 200},
    ]
    reporters = []
    async for r in db.breakdowns.aggregate(reporter_pipeline):
        name = (r["_id"] or "Unknown").strip() or "Unknown"
        reporters.append({"name": name, "breakdowns_reported": r["breakdowns_reported"]})

    # ---------- Technicians (WO completion stats) ----------
    # We consider a WO "completed" if repair_completed_at OR closed_at is set
    tech_pipeline = [
        {"$match": {
            **wo_range,
            **dept_wo,
            "assigned_to": {"$ne": None},
        }},
        {"$group": {
            "_id": "$assigned_to",
            "assignments": {"$sum": 1},
            "completed_count": {"$sum": {"$cond": [
                {"$or": [
                    {"$eq": ["$status", WOStatus.completed.value]},
                    {"$eq": ["$status", WOStatus.closed.value]},
                    {"$ne": ["$repair_completed_at", None]},
                ]}, 1, 0,
            ]}},
            "sum_repair_seconds": {"$sum": {"$ifNull": ["$repair_time_seconds", 0]}},
            "n_with_repair": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$repair_time_seconds", 0]}, 0]}, 1, 0]}},
            "sum_response_seconds": {"$sum": {"$ifNull": ["$response_time_seconds", 0]}},
            "n_with_response": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$response_time_seconds", 0]}, 0]}, 1, 0]}},
        }},
    ]
    per_tech: dict = {}
    async for r in db.work_orders.aggregate(tech_pipeline):
        uid = r["_id"]
        per_tech[uid] = {
            "user_id": uid,
            "assignments": r["assignments"],
            "work_orders_completed": r["completed_count"],
            "total_repair_seconds": r["sum_repair_seconds"],
            "avg_repair_seconds": (r["sum_repair_seconds"] / r["n_with_repair"]) if r["n_with_repair"] else 0,
            "avg_response_seconds": (r["sum_response_seconds"] / r["n_with_response"]) if r["n_with_response"] else 0,
        }

    # Resolve names
    tech_ids = list(per_tech.keys())
    if tech_ids:
        users = await db.users.find({"id": {"$in": tech_ids}}, {"_id": 0}).to_list(500)
        name_map = {u["id"]: (u.get("full_name") or u.get("email") or "?") for u in users}
        for uid, doc in per_tech.items():
            doc["name"] = name_map.get(uid, "Unknown")

    technicians = sorted(per_tech.values(), key=lambda x: x["work_orders_completed"], reverse=True)

    # ---------- Top performers ----------
    top: dict = {"fastest_technician": None, "slowest_technician": None,
                 "most_active_reporter": None, "most_active_technician": None}

    # Filter to techs with at least 1 completed repair for fastest/slowest
    eligible_techs = [t for t in technicians if t["work_orders_completed"] > 0 and t["avg_repair_seconds"] > 0]
    if eligible_techs:
        fastest = min(eligible_techs, key=lambda x: x["avg_repair_seconds"])
        slowest = max(eligible_techs, key=lambda x: x["avg_repair_seconds"])
        top["fastest_technician"] = {"name": fastest["name"], "user_id": fastest["user_id"],
                                       "avg_repair_seconds": fastest["avg_repair_seconds"]}
        top["slowest_technician"] = {"name": slowest["name"], "user_id": slowest["user_id"],
                                       "avg_repair_seconds": slowest["avg_repair_seconds"]}
    if technicians:
        most_active = max(technicians, key=lambda x: x["work_orders_completed"])
        if most_active["work_orders_completed"] > 0:
            top["most_active_technician"] = {"name": most_active["name"], "user_id": most_active["user_id"],
                                               "count": most_active["work_orders_completed"]}
    if reporters:
        top["most_active_reporter"] = {"name": reporters[0]["name"], "count": reporters[0]["breakdowns_reported"]}

    return {"ok": True, "data": {
        "reporters": reporters,
        "technicians": technicians,
        "top": top,
        "range": {"from": from_ts, "to": to_ts},
        "department": department,
    }}
