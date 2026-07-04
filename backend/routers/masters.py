"""Plant/line/machine master data + failure modes + spares + tree endpoint."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db
from models import MachineCreateReq, MachineUpdateReq, uid, now_utc
from deps import get_current_user, require_admin, write_audit

router = APIRouter(prefix="/api", tags=["masters"])


# -------- Plants --------
@router.get("/plants")
async def list_plants(user=Depends(get_current_user)):
    db = get_db()
    plants = await db.plants.find({}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return {"ok": True, "data": plants}


# -------- Lines --------
@router.get("/lines")
async def list_lines(plant_id: Optional[str] = None, user=Depends(get_current_user)):
    db = get_db()
    q = {"plant_id": plant_id} if plant_id else {}
    lines = await db.production_lines.find(q, {"_id": 0}).sort("sequence", 1).to_list(200)
    return {"ok": True, "data": lines}


@router.get("/lines/{line_id}/tree")
async def line_tree(line_id: str, user=Depends(get_current_user)):
    """Return line with groups + machines + subsystems + live status for the twin."""
    db = get_db()
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    groups = await db.machine_groups.find({"line_id": line_id}, {"_id": 0}).sort("sequence", 1).to_list(50)
    machines = await db.machines.find({"line_id": line_id}, {"_id": 0}).sort("sequence", 1).to_list(500)
    # attach live status
    status_map = {s["machine_id"]: s async for s in db.machine_status.find(
        {"machine_id": {"$in": [m["id"] for m in machines]}}, {"_id": 0})}
    for m in machines:
        st = status_map.get(m["id"])
        if st:
            m["status"] = st["status"]
            m["status_since"] = st.get("since")
    return {"ok": True, "data": {"line": line, "groups": groups, "machines": machines}}


# -------- Machines --------
@router.get("/machines")
async def list_machines(line_id: Optional[str] = None, user=Depends(get_current_user)):
    db = get_db()
    q = {"line_id": line_id} if line_id else {}
    machines = await db.machines.find(q, {"_id": 0}).sort("sequence", 1).to_list(2000)
    return {"ok": True, "data": machines}


@router.get("/machines/{machine_id}")
async def get_machine(machine_id: str, user=Depends(get_current_user)):
    db = get_db()
    m = await db.machines.find_one({"id": machine_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    return {"ok": True, "data": m}


@router.post("/machines")
async def create_machine(req: MachineCreateReq, admin=Depends(require_admin)):
    db = get_db()
    line = await db.production_lines.find_one({"id": req.line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    doc = {
        "id": uid(),
        "line_id": req.line_id,
        "group_id": req.group_id,
        "parent_machine_id": req.parent_machine_id,
        "code": req.code.strip(),
        "name": req.name.strip(),
        "sap_code": req.sap_code,
        "sequence": req.sequence,
        "kind": req.kind.value if hasattr(req.kind, "value") else req.kind,
        "machine_type": req.machine_type,
        "is_packing": req.is_packing,
        "criticality_manual": req.criticality_manual,
        "criticality_computed": None,
        "status": "running",
        "current_breakdown_id": None,
        "plant_id": line["plant_id"],
        "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
        "created_by": admin["id"], "updated_by": admin["id"],
    }
    await db.machines.insert_one(doc)
    doc.pop("_id", None)
    await write_audit(admin["id"], "machine.create", "machine", doc["id"], after=doc)
    return {"ok": True, "data": doc}


@router.patch("/machines/{machine_id}")
async def update_machine(machine_id: str, req: MachineUpdateReq, admin=Depends(require_admin)):
    db = get_db()
    upd = {"updated_at": now_utc().isoformat(), "updated_by": admin["id"]}
    for f in ("name", "sap_code", "machine_type", "criticality_manual", "is_packing"):
        v = getattr(req, f)
        if v is not None:
            upd[f] = v
    if req.status is not None:
        upd["status"] = req.status.value if hasattr(req.status, "value") else req.status
    r = await db.machines.update_one({"id": machine_id}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Machine not found")
    m = await db.machines.find_one({"id": machine_id}, {"_id": 0})
    await write_audit(admin["id"], "machine.update", "machine", machine_id, after=m)
    return {"ok": True, "data": m}


@router.delete("/machines/{machine_id}")
async def delete_machine(machine_id: str, admin=Depends(require_admin)):
    db = get_db()
    r = await db.machines.delete_one({"id": machine_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Machine not found")
    await write_audit(admin["id"], "machine.delete", "machine", machine_id)
    return {"ok": True}


# -------- Failure modes --------
@router.get("/failure-modes")
async def list_failure_modes(user=Depends(get_current_user)):
    db = get_db()
    modes = await db.failure_modes.find({}, {"_id": 0}).sort("category", 1).to_list(500)
    return {"ok": True, "data": modes}


@router.post("/failure-modes")
async def create_failure_mode(body: dict, admin=Depends(require_admin)):
    db = get_db()
    doc = {
        "id": uid(),
        "code": body["code"], "name": body["name"], "category": body.get("category", "other"),
        "description": body.get("description"),
        "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    await db.failure_modes.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "data": doc}


# -------- Spares --------
@router.get("/spares")
async def list_spares(user=Depends(get_current_user)):
    db = get_db()
    items = await db.spares.find({}, {"_id": 0}).sort("sap_code", 1).to_list(2000)
    return {"ok": True, "data": items}


@router.post("/spares")
async def upsert_spare(body: dict, admin=Depends(require_admin)):
    db = get_db()
    sap = body["sap_code"].strip()
    existing = await db.spares.find_one({"sap_code": sap}, {"_id": 0})
    if existing:
        upd = {k: body[k] for k in ("name", "uom", "on_hand", "min_stock", "cost") if k in body}
        upd["updated_at"] = now_utc().isoformat()
        await db.spares.update_one({"sap_code": sap}, {"$set": upd})
        item = await db.spares.find_one({"sap_code": sap}, {"_id": 0})
    else:
        item = {
            "id": uid(), "sap_code": sap,
            "name": body.get("name", sap),
            "uom": body.get("uom", "each"),
            "on_hand": float(body.get("on_hand", 0)),
            "min_stock": float(body.get("min_stock", 0)),
            "cost": float(body.get("cost", 0)),
            "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
        }
        await db.spares.insert_one(item)
        item.pop("_id", None)
    return {"ok": True, "data": item}
