"""Auth router — login/logout/refresh/register/me + brute-force protection."""
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from db import get_db
from security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token_safe,
)
from models import LoginReq, RegisterReq, Ok, uid, now_utc
from deps import get_current_user, require_admin, write_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


LOCKOUT_MAX = 5
LOCKOUT_MIN = 15


def _cookie_kwargs():
    return {
        "httponly": True,
        "secure": False,          # LAN deployment: HTTP is fine
        "samesite": "lax",
        "path": "/",
    }


def _serialize_user(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "full_name": u["full_name"],
        "role": u["role"], "active": u.get("active", True),
        "phone": u.get("phone"),
    }


@router.post("/login")
async def login(req: LoginReq, request: Request, response: Response):
    db = get_db()
    email = req.email.lower().strip()
    # Lock on email to be robust across multi-pod ingress (client IP is unreliable there)
    ident = f"email:{email}"

    # Check lockout
    attempt = await db.login_attempts.find_one({"identifier": ident})
    if attempt and attempt.get("locked_until"):
        lu = datetime.fromisoformat(attempt["locked_until"])
        if datetime.now(timezone.utc) < lu:
            raise HTTPException(status_code=429, detail={
                "code": "AUTH_LOCKED", "message": "Too many failed attempts. Try again later.",
                "retry_at": lu.isoformat(),
            })

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"failures": 1}, "$set": {"last_at": now_utc().isoformat()}},
            upsert=True,
        )
        attempt = await db.login_attempts.find_one({"identifier": ident})
        if attempt and attempt.get("failures", 0) >= LOCKOUT_MAX:
            lu = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MIN)).isoformat()
            await db.login_attempts.update_one(
                {"identifier": ident},
                {"$set": {"locked_until": lu, "failures": 0}},
            )
        raise HTTPException(status_code=401, detail={"code": "AUTH_BAD_CREDENTIALS",
                                                       "message": "Invalid email or password"})

    if not user.get("active", True):
        raise HTTPException(status_code=403, detail={"code": "AUTH_INACTIVE",
                                                       "message": "Account inactive"})

    await db.login_attempts.delete_one({"identifier": ident})

    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    response.set_cookie("access_token", access, max_age=60 * 60, **_cookie_kwargs())
    response.set_cookie("refresh_token", refresh, max_age=7 * 24 * 3600, **_cookie_kwargs())

    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_utc().isoformat()}})

    return {"ok": True, "data": {
        "user": _serialize_user(user),
        "access_token": access,
        "refresh_token": refresh,
    }}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"ok": True, "data": _serialize_user(user)}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token_safe(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", access, max_age=60 * 60, **_cookie_kwargs())
    return {"ok": True, "data": {"access_token": access}}


@router.post("/register")
async def register(req: RegisterReq, admin=Depends(require_admin)):
    db = get_db()
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail={"code": "AUTH_EMAIL_TAKEN",
                                                       "message": "Email already registered"})
    doc = {
        "id": uid(),
        "email": email,
        "full_name": req.full_name.strip(),
        "role": req.role.value if hasattr(req.role, "value") else req.role,
        "password_hash": hash_password(req.password),
        "active": True,
        "phone": req.phone,
        "permissions": [],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "created_by": admin["id"],
        "updated_by": admin["id"],
    }
    await db.users.insert_one(doc)
    await write_audit(admin["id"], "user.create", "user", doc["id"], after=_serialize_user(doc))
    return {"ok": True, "data": _serialize_user(doc)}
