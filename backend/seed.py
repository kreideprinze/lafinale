"""Seed: default plant, 6 lines, machines, failure modes, users."""
import os
from datetime import datetime, timezone
from db import get_db
from security import hash_password, verify_password
from factory_data import LINES, DEFAULT_FAILURE_MODES
from models import uid, now_utc


async def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def seed_admin() -> None:
    """Always-on: create the admin user so a fresh installation can log in.

    Technician and Operator accounts are created only if the corresponding
    _EMAIL/_PASSWORD env vars are set (backwards-compat for demo installs).
    """
    db = get_db()
    accounts = [
        ("ADMIN_EMAIL",    "ADMIN_PASSWORD",    "admin",     "admin@factory.local",     "Factory Admin"),
        ("TECH_EMAIL",     "TECH_PASSWORD",     "technician","tech@factory.local",      "Demo Technician"),
        ("OPERATOR_EMAIL", "OPERATOR_PASSWORD", "operator",  "op@factory.local",        "Demo Operator"),
    ]
    now = await _now()
    for e_env, p_env, role, e_default, name in accounts:
        email = os.environ.get(e_env, e_default).lower().strip()
        password = os.environ.get(p_env)
        if not password:
            continue
        u = await db.users.find_one({"email": email}, {"_id": 0})
        if not u:
            await db.users.insert_one({
                "id": uid(), "email": email, "full_name": name, "role": role,
                "password_hash": hash_password(password), "active": True,
                "permissions": [], "phone": None,
                "created_at": now, "updated_at": now,
            })
        elif not verify_password(password, u.get("password_hash", "")):
            await db.users.update_one({"email": email},
                                        {"$set": {"password_hash": hash_password(password),
                                                  "updated_at": now}})


# Legacy alias for external callers
seed_users = seed_admin


async def seed_failure_modes() -> None:
    db = get_db()
    now = await _now()
    for code, name, category in DEFAULT_FAILURE_MODES:
        if not await db.failure_modes.find_one({"code": code}, {"_id": 0}):
            await db.failure_modes.insert_one({
                "id": uid(), "code": code, "name": name, "category": category,
                "description": None, "created_at": now, "updated_at": now,
            })


async def seed_plant_and_lines() -> None:
    db = get_db()
    now = await _now()

    # Plant
    plant = await db.plants.find_one({"code": "P1"}, {"_id": 0})
    if not plant:
        plant = {"id": uid(), "code": "P1", "name": "Factory Plant 1",
                 "timezone": "Asia/Kolkata", "active": True,
                 "created_at": now, "updated_at": now}
        await db.plants.insert_one(plant)
        plant.pop("_id", None)

    plant_id = plant["id"]

    for code, meta in LINES.items():
        line = await db.production_lines.find_one({"plant_id": plant_id, "code": code}, {"_id": 0})
        if not line:
            line = {"id": uid(), "plant_id": plant_id, "code": code,
                    "name": meta["name"], "sequence": meta["seq"], "active": True,
                    "created_at": now, "updated_at": now}
            await db.production_lines.insert_one(line)
            line.pop("_id", None)
        line_id = line["id"]

        # Groups first
        group_ids: dict[str, str] = {}
        seq = 0
        for m in meta["machines"]:
            if m["kind"] == "stage":
                seq += 1
                existing = await db.machine_groups.find_one(
                    {"line_id": line_id, "code": m["code"]}, {"_id": 0})
                if existing:
                    group_ids[m["code"]] = existing["id"]
                else:
                    g = {"id": uid(), "line_id": line_id, "code": m["code"],
                         "name": m["name"], "sequence": seq, "is_parallel": True,
                         "created_at": now, "updated_at": now}
                    await db.machine_groups.insert_one(g)
                    group_ids[m["code"]] = g["id"]

        # First pass: machines without parent (non-subsystems)
        # Second pass: subsystems (need parent id lookup)
        machine_ids_by_code: dict[str, str] = {}

        # pass 1
        seq = 0
        for m in meta["machines"]:
            if m["kind"] == "stage":
                continue
            if m["kind"] == "subsystem":
                continue
            seq += 1
            existing = await db.machines.find_one({"line_id": line_id, "code": m["code"]}, {"_id": 0})
            if existing:
                machine_ids_by_code[m["code"]] = existing["id"]
                continue
            doc = {
                "id": uid(), "line_id": line_id, "plant_id": plant_id,
                "group_id": group_ids.get(m.get("group")),
                "parent_machine_id": None,
                "code": m["code"], "name": m["name"],
                "sap_code": None, "sequence": seq,
                "kind": m["kind"], "machine_type": m["machine_type"],
                "is_packing": m["is_packing"],
                "criticality_manual": None, "criticality_computed": None,
                "status": "running", "current_breakdown_id": None,
                "created_at": now, "updated_at": now,
            }
            await db.machines.insert_one(doc)
            machine_ids_by_code[m["code"]] = doc["id"]

        # pass 2: subsystems
        for m in meta["machines"]:
            if m["kind"] != "subsystem":
                continue
            seq += 1
            existing = await db.machines.find_one({"line_id": line_id, "code": m["code"]}, {"_id": 0})
            if existing:
                machine_ids_by_code[m["code"]] = existing["id"]
                continue
            parent_id = machine_ids_by_code.get(m.get("parent"))
            doc = {
                "id": uid(), "line_id": line_id, "plant_id": plant_id,
                "group_id": None, "parent_machine_id": parent_id,
                "code": m["code"], "name": m["name"],
                "sap_code": None, "sequence": seq,
                "kind": "subsystem", "machine_type": m["machine_type"],
                "is_packing": False,
                "criticality_manual": None, "criticality_computed": None,
                "status": "running", "current_breakdown_id": None,
                "created_at": now, "updated_at": now,
            }
            await db.machines.insert_one(doc)
            machine_ids_by_code[m["code"]] = doc["id"]

        # Ensure machine_status snapshots
        for code, mid in machine_ids_by_code.items():
            await db.machine_status.update_one(
                {"machine_id": mid},
                {"$setOnInsert": {
                    "machine_id": mid, "status": "running",
                    "since": now, "current_breakdown_id": None,
                    "updated_at": now,
                }},
                upsert=True,
            )


async def seed_all() -> None:
    """Backwards-compat: full seed (admin + failure modes + plant + demo lines).

    New installations should ONLY call `seed_admin()` on startup. Demo data is
    seeded on demand via the Admin > System > Seed Demo Data button.
    """
    await seed_admin()
    await seed_failure_modes()
    await seed_plant_and_lines()


async def seed_demo_data() -> None:
    """Populate failure modes + demo plant/lines/machines. Called on demand."""
    await seed_failure_modes()
    await seed_plant_and_lines()
    # Also populate multi-department (packaging + utilities) demo data
    try:
        from seed_departments import seed_departments_all
        await seed_departments_all()
    except Exception:
        pass
