"""Branding/settings — logo upload, company name, primary color.

Logo is stored on disk at BACKEND_UPLOADS_DIR/logo.<ext>. Metadata (path,
company_name, primary_color) is stored in the `settings` collection under
document id 'branding'.
"""
import os
import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse
from db import get_db
from deps import require_admin, get_current_user_optional, write_audit
from models import now_utc


router = APIRouter(prefix="/api/settings", tags=["settings"])

UPLOADS_DIR = Path(os.environ.get("BACKEND_UPLOADS_DIR", "/app/backend/uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MAX_LOGO_BYTES = 512 * 1024  # 512 KB
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


async def _get_branding_doc():
    db = get_db()
    doc = await db.settings.find_one({"id": "branding"}, {"_id": 0})
    if not doc:
        doc = {
            "id": "branding",
            "company_name": "Factory CMMS",
            "primary_color": "#22d3ee",
            "logo_ext": None,  # e.g. ".png"
            "logo_updated_at": None,
        }
    return doc


@router.get("/branding")
async def get_branding(user=Depends(get_current_user_optional)):
    """Public read — everyone (including operator kiosk) needs the branding."""
    doc = await _get_branding_doc()
    doc["has_logo"] = bool(doc.get("logo_ext"))
    return {"ok": True, "data": doc}


@router.put("/branding")
async def update_branding(
    company_name: Optional[str] = Form(None),
    primary_color: Optional[str] = Form(None),
    admin=Depends(require_admin),
):
    """Update non-logo branding fields (company_name, primary_color)."""
    db = get_db()
    updates: dict = {"updated_at": now_utc().isoformat()}
    if company_name is not None:
        cn = company_name.strip()
        if not (1 <= len(cn) <= 80):
            raise HTTPException(status_code=400, detail="company_name length 1..80")
        updates["company_name"] = cn
    if primary_color is not None:
        pc = primary_color.strip()
        if not re.match(r"^#[0-9a-fA-F]{3,8}$", pc):
            raise HTTPException(status_code=400, detail="primary_color must be a hex value")
        updates["primary_color"] = pc
    if len(updates) == 1:
        raise HTTPException(status_code=400, detail="no fields provided")

    await db.settings.update_one(
        {"id": "branding"},
        {"$set": updates, "$setOnInsert": {"id": "branding"}},
        upsert=True,
    )
    await write_audit(admin["id"], "settings.branding.update", "settings", "branding", after=updates)
    doc = await _get_branding_doc()
    doc["has_logo"] = bool(doc.get("logo_ext"))
    return {"ok": True, "data": doc}


@router.post("/branding/logo")
async def upload_logo(file: UploadFile = File(...), admin=Depends(require_admin)):
    """Upload a company logo. Overwrites any previous logo."""
    orig = (file.filename or "logo").lower()
    ext = ""
    for e in ALLOWED_EXT:
        if orig.endswith(e):
            ext = e
            break
    if not ext:
        raise HTTPException(status_code=400, detail=f"Unsupported logo type; allowed: {sorted(ALLOWED_EXT)}")

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail=f"Logo too large (>{MAX_LOGO_BYTES} bytes)")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Clean any prior logo files
    for prior in UPLOADS_DIR.glob("logo.*"):
        try:
            prior.unlink()
        except OSError:
            pass

    out = UPLOADS_DIR / f"logo{ext}"
    out.write_bytes(contents)

    db = get_db()
    now = now_utc().isoformat()
    await db.settings.update_one(
        {"id": "branding"},
        {"$set": {"logo_ext": ext, "logo_updated_at": now, "updated_at": now},
         "$setOnInsert": {"id": "branding", "company_name": "Factory CMMS", "primary_color": "#22d3ee"}},
        upsert=True,
    )
    await write_audit(admin["id"], "settings.branding.upload_logo", "settings", "branding",
                      after={"ext": ext, "bytes": len(contents)})
    return {"ok": True, "data": {"logo_ext": ext, "bytes": len(contents)}}


@router.delete("/branding/logo")
async def delete_logo(admin=Depends(require_admin)):
    for prior in UPLOADS_DIR.glob("logo.*"):
        try:
            prior.unlink()
        except OSError:
            pass
    db = get_db()
    await db.settings.update_one(
        {"id": "branding"},
        {"$set": {"logo_ext": None, "logo_updated_at": None, "updated_at": now_utc().isoformat()}},
        upsert=True,
    )
    await write_audit(admin["id"], "settings.branding.delete_logo", "settings", "branding")
    return {"ok": True}


@router.get("/branding/logo")
async def get_logo():
    """Public — returns the current logo file (or 404)."""
    files = list(UPLOADS_DIR.glob("logo.*"))
    if not files:
        raise HTTPException(status_code=404, detail="No logo uploaded")
    f = files[0]
    ext = f.suffix.lower()
    mime = MIME_BY_EXT.get(ext, "application/octet-stream")
    return FileResponse(f, media_type=mime, filename=f.name)
