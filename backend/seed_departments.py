"""Migration + seed for multi-department support.

Runs on startup after `seed_all()`:
1. Backfill `department='process'` on legacy lines / machines / breakdowns / WOs.
2. Seed Packaging areas + equipment (bag makers, weighers, conveyors, palletizers).
3. Seed Utilities areas + equipment.
4. Seed extra failure modes for Packaging and Utilities.
"""
from db import get_db
from models import uid, now_utc
from factory_data_extra import (
    PACKAGING_AREAS, UTILITIES_AREAS,
    UTILITIES_FAILURE_MODES, PACKAGING_FAILURE_MODES,
)


async def _now() -> str:
    return now_utc().isoformat()


async def migrate_departments() -> None:
    """Backfill department='process' on legacy records."""
    db = get_db()
    now = await _now()
    # production_lines
    await db.production_lines.update_many(
        {"department": {"$exists": False}},
        {"$set": {"department": "process", "updated_at": now}},
    )
    # machines — derive dept from line if present, else 'process'
    async for line in db.production_lines.find({}, {"_id": 0, "id": 1, "department": 1}):
        await db.machines.update_many(
            {"line_id": line["id"], "department": {"$exists": False}},
            {"$set": {"department": line.get("department", "process"), "updated_at": now}},
        )
    # any remaining orphans
    await db.machines.update_many(
        {"department": {"$exists": False}},
        {"$set": {"department": "process", "updated_at": now}},
    )
    # breakdowns
    await db.breakdowns.update_many(
        {"department": {"$exists": False}},
        {"$set": {"department": "process"}},
    )
    # work_orders — derive from breakdown or default
    await db.work_orders.update_many(
        {"department": {"$exists": False}},
        {"$set": {"department": "process"}},
    )
    # timeline_events
    await db.timeline_events.update_many(
        {"department": {"$exists": False}},
        {"$set": {"department": "process"}},
    )


async def _seed_area_group(department: str, areas: dict) -> int:
    """Generic seeder for packaging + utilities. Returns machines inserted."""
    db = get_db()
    now = await _now()
    inserted = 0
    plant = await db.plants.find_one({"code": "P1"}, {"_id": 0})
    if not plant:
        return 0
    plant_id = plant["id"]

    for code, meta in areas.items():
        area = await db.production_lines.find_one(
            {"plant_id": plant_id, "department": department, "code": code},
            {"_id": 0},
        )
        if not area:
            area = {
                "id": uid(), "plant_id": plant_id,
                "department": department,
                "code": code, "name": meta["name"],
                "sequence": meta["seq"], "active": True,
                "created_at": now, "updated_at": now,
            }
            await db.production_lines.insert_one(area)
        area_id = area["id"]

        seq = 0
        for m in meta.get("machines", []):
            seq += 1
            existing = await db.machines.find_one(
                {"line_id": area_id, "code": m["code"]}, {"_id": 0, "id": 1},
            )
            if existing:
                continue
            doc = {
                "id": uid(),
                "line_id": area_id,
                "plant_id": plant_id,
                "department": department,
                "group_id": None, "parent_machine_id": None,
                "code": m["code"], "name": m["name"],
                "sap_code": None, "sequence": seq,
                "kind": m.get("kind", "machine"),
                "machine_type": m.get("machine_type", "mechanical"),
                "is_packing": False,
                "criticality_manual": None, "criticality_computed": None,
                "status": "running", "current_breakdown_id": None,
                "created_at": now, "updated_at": now,
            }
            await db.machines.insert_one(doc)
            await db.machine_status.update_one(
                {"machine_id": doc["id"]},
                {"$setOnInsert": {
                    "machine_id": doc["id"], "status": "running",
                    "since": now, "current_breakdown_id": None, "updated_at": now,
                }},
                upsert=True,
            )
            inserted += 1
    return inserted


async def seed_extra_failure_modes() -> None:
    db = get_db()
    now = await _now()
    for code, name, category in [*UTILITIES_FAILURE_MODES, *PACKAGING_FAILURE_MODES]:
        if not await db.failure_modes.find_one({"code": code}, {"_id": 0, "id": 1}):
            await db.failure_modes.insert_one({
                "id": uid(), "code": code, "name": name, "category": category,
                "description": None, "created_at": now, "updated_at": now,
            })


async def seed_departments_all() -> None:
    """Idempotent: migrate + seed packaging + utilities."""
    await migrate_departments()
    pk = await _seed_area_group("packaging", PACKAGING_AREAS)
    ut = await _seed_area_group("utilities", UTILITIES_AREAS)
    await seed_extra_failure_modes()
    return {"packaging_equipment_added": pk, "utilities_equipment_added": ut}
