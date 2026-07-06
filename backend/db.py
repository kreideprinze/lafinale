"""MongoDB async client + collection accessors."""
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_client()[os.environ["DB_NAME"]]
    return _db


async def ensure_indexes() -> None:
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.plants.create_index("code", unique=True)
    # Old index (plant_id+code unique) is replaced by (plant_id+department+code)
    # so multiple departments can share codes like "PC21".
    try:
        await db.production_lines.drop_index("plant_id_1_code_1")
    except Exception:
        pass
    await db.production_lines.create_index(
        [("plant_id", 1), ("department", 1), ("code", 1)], unique=True,
    )
    await db.production_lines.create_index("department")
    await db.machines.create_index([("line_id", 1), ("code", 1)], unique=True)
    await db.machines.create_index("department")
    await db.machines.create_index("parent_machine_id")
    await db.machines.create_index("status")
    await db.breakdowns.create_index("department")
    await db.breakdowns.create_index("ticket_no", unique=True)
    await db.breakdowns.create_index([("line_id", 1), ("breakdown_start_ts", -1)])
    await db.breakdowns.create_index([("machine_id", 1), ("breakdown_start_ts", -1)])
    await db.breakdowns.create_index("status")
    await db.work_orders.create_index("wo_no", unique=True)
    await db.work_orders.create_index([("assigned_to", 1), ("status", 1)])
    await db.work_orders.create_index("breakdown_id")
    await db.repair_events.create_index([("work_order_id", 1), ("at", 1)])
    await db.timeline_events.create_index([("line_id", 1), ("at", -1)])
    await db.timeline_events.create_index([("machine_id", 1), ("at", -1)])
    await db.timeline_events.create_index([("kind", 1), ("at", -1)])
    await db.audit_logs.create_index([("entity_type", 1), ("entity_id", 1), ("at", -1)])
    await db.notifications.create_index([("user_id", 1), ("read_at", 1), ("created_at", -1)])
    await db.notifications.create_index([("role_scope", 1), ("read_at", 1), ("created_at", -1)])
    await db.machine_status.create_index("machine_id", unique=True)
    await db.runtime_logs.create_index([("line_id", 1), ("date", -1)], unique=True)
    await db.failure_modes.create_index("code", unique=True)
    await db.spares.create_index("sap_code", unique=True)
    await db.login_attempts.create_index("identifier")
