"""FastAPI dependency helpers: auth, role, current user, audit."""
from typing import Optional, List, Callable
from fastapi import Request, HTTPException, status, Depends
from datetime import datetime, timezone

from db import get_db
from security import decode_token_safe
from models import Role


async def _extract_token(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = await _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token_safe(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_role(*allowed: str) -> Callable:
    async def _guard(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403, detail={
                "code": "RBAC_FORBIDDEN",
                "message": f"Requires role in {list(allowed)}",
                "your_role": user.get("role"),
            })
        return user
    return _guard


require_admin = require_role("admin")
require_admin_or_tech = require_role("admin", "technician")
require_any = require_role("admin", "technician", "operator")


async def write_audit(actor_id: Optional[str], action: str, entity_type: str,
                       entity_id: str, before=None, after=None) -> None:
    db = get_db()
    await db.audit_logs.insert_one({
        "id": _uid(),
        "at": datetime.now(timezone.utc).isoformat(),
        "actor_id": actor_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before": before,
        "after": after,
    })


def _uid():
    import uuid
    return str(uuid.uuid4())
