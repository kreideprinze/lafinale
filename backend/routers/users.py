"""Users router — admin management of operators/technicians/admins."""
from fastapi import APIRouter, Depends, HTTPException
from db import get_db
from models import UserUpdateReq, Role, uid, now_utc
from security import hash_password
from deps import require_admin, get_current_user, write_audit

router = APIRouter(prefix="/api/users", tags=["users"])


def _pub(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "full_name": u["full_name"],
            "role": u["role"], "active": u.get("active", True), "phone": u.get("phone")}


@router.get("")
async def list_users(admin=Depends(require_admin)):
    db = get_db()
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(1000)
    return {"ok": True, "data": users}


@router.get("/technicians")
async def technicians(user=Depends(get_current_user)):
    db = get_db()
    users = await db.users.find({"role": "technician", "active": True},
                                  {"_id": 0, "password_hash": 0}).to_list(500)
    return {"ok": True, "data": users}


@router.patch("/{user_id}")
async def update_user(user_id: str, req: UserUpdateReq, admin=Depends(require_admin)):
    db = get_db()
    upd = {"updated_at": now_utc().isoformat(), "updated_by": admin["id"]}
    if req.full_name is not None:
        upd["full_name"] = req.full_name.strip()
    if req.role is not None:
        upd["role"] = req.role.value if hasattr(req.role, "value") else req.role
    if req.active is not None:
        upd["active"] = req.active
    if req.phone is not None:
        upd["phone"] = req.phone
    if req.password:
        upd["password_hash"] = hash_password(req.password)
    r = await db.users.update_one({"id": user_id}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="User not found")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    await write_audit(admin["id"], "user.update", "user", user_id, after=_pub(user))
    return {"ok": True, "data": _pub(user)}


@router.delete("/{user_id}")
async def deactivate_user(user_id: str, admin=Depends(require_admin)):
    db = get_db()
    r = await db.users.update_one({"id": user_id},
                                     {"$set": {"active": False, "updated_at": now_utc().isoformat()}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="User not found")
    await write_audit(admin["id"], "user.deactivate", "user", user_id)
    return {"ok": True}
