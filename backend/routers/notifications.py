"""Notifications API."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from db import get_db
from deps import get_current_user
from models import now_utc

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(unread_only: bool = False, limit: int = Query(50, le=500),
                              user=Depends(get_current_user)):
    db = get_db()
    q = {"$or": [{"user_id": user["id"]}, {"role_scope": user["role"]}, {"role_scope": "all"}]}
    if unread_only:
        q["read_at"] = None
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"ok": True, "data": items}


@router.post("/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_one({"id": nid}, {"$set": {"read_at": now_utc().isoformat()}})
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many(
        {"$or": [{"user_id": user["id"]}, {"role_scope": user["role"]}], "read_at": None},
        {"$set": {"read_at": now_utc().isoformat()}},
    )
    return {"ok": True}
