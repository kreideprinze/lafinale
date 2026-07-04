"""Pydantic models for Factory CMMS Enterprise.

All IDs are UUID strings. `created_at` / `updated_at` are ISO strings when stored
in Mongo (via .dict()), and datetimes on the wire.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, date
from enum import Enum
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, ConfigDict


def uid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------- ENUMS ----------------
class Role(str, Enum):
    admin = "admin"
    technician = "technician"
    operator = "operator"


class MachineKind(str, Enum):
    stage = "stage"
    machine = "machine"
    subsystem = "subsystem"
    conveyor = "conveyor"
    utility = "utility"
    terminator = "terminator"  # non-metric endpoints (dispatch/packing)


class MachineStatus(str, Enum):
    running = "running"
    failed = "failed"
    repair = "repair"
    starved = "starved"
    idle = "idle"
    unknown = "unknown"


class BreakdownStatus(str, Enum):
    open = "open"
    assigned = "assigned"
    in_progress = "in_progress"
    awaiting_parts = "awaiting_parts"
    resolved = "resolved"
    closed = "closed"
    cancelled = "cancelled"


class WOStatus(str, Enum):
    draft = "draft"
    open = "open"
    assigned = "assigned"
    in_progress = "in_progress"
    awaiting_parts = "awaiting_parts"
    completed = "completed"
    closed = "closed"
    cancelled = "cancelled"


class WOType(str, Enum):
    corrective = "corrective"
    preventive = "preventive"
    predictive = "predictive"
    inspection = "inspection"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class BreakdownType(str, Enum):
    mechanical = "mechanical"
    electrical = "electrical"
    process = "process"
    instrumentation = "instrumentation"
    utility = "utility"
    operator_error = "operator_error"
    planned = "planned"
    other = "other"


class NotificationKind(str, Enum):
    machine_down = "machine_down"
    critical = "critical"
    repeat_failure = "repeat_failure"
    infant_mortality = "infant_mortality"
    threshold_breach = "threshold_breach"
    unassigned_wo = "unassigned_wo"
    overdue_repair = "overdue_repair"
    info = "info"


# ---------------- BASE ----------------
class BaseDoc(BaseModel):
    model_config = ConfigDict(extra="ignore", use_enum_values=True)
    id: str = Field(default_factory=uid)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


# ---------------- USER ----------------
class User(BaseDoc):
    email: str
    full_name: str
    role: Role
    password_hash: str
    active: bool = True
    phone: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)
    last_login_at: Optional[datetime] = None


class UserPublic(BaseModel):
    id: str
    email: str
    full_name: str
    role: Role
    active: bool
    phone: Optional[str] = None


class LoginReq(BaseModel):
    email: str
    password: str


class RegisterReq(BaseModel):
    email: str
    full_name: str
    role: Role
    password: str
    phone: Optional[str] = None


class UserUpdateReq(BaseModel):
    full_name: Optional[str] = None
    role: Optional[Role] = None
    active: Optional[bool] = None
    phone: Optional[str] = None
    password: Optional[str] = None


# ---------------- HIERARCHY ----------------
class Plant(BaseDoc):
    code: str
    name: str
    timezone: str = "Asia/Kolkata"
    active: bool = True


class ProductionLine(BaseDoc):
    plant_id: str
    code: str
    name: str
    sequence: int = 0
    active: bool = True


class MachineGroup(BaseDoc):
    line_id: str
    code: str
    name: str
    sequence: int = 0
    is_parallel: bool = False


class Machine(BaseDoc):
    line_id: str
    group_id: Optional[str] = None
    parent_machine_id: Optional[str] = None
    code: str
    name: str
    sap_code: Optional[str] = None
    sequence: int = 0
    kind: MachineKind = MachineKind.machine
    machine_type: str = "general"   # e.g. mechanical/electrical/process
    is_packing: bool = False        # excluded from MTTR/MTBF/availability
    criticality_manual: Optional[int] = None  # 1..10
    criticality_computed: Optional[float] = None
    status: MachineStatus = MachineStatus.running
    current_breakdown_id: Optional[str] = None


class MachineCreateReq(BaseModel):
    line_id: str
    group_id: Optional[str] = None
    parent_machine_id: Optional[str] = None
    code: str
    name: str
    sap_code: Optional[str] = None
    kind: MachineKind = MachineKind.machine
    machine_type: str = "general"
    is_packing: bool = False
    criticality_manual: Optional[int] = None
    sequence: int = 0


class MachineUpdateReq(BaseModel):
    name: Optional[str] = None
    sap_code: Optional[str] = None
    machine_type: Optional[str] = None
    criticality_manual: Optional[int] = None
    is_packing: Optional[bool] = None
    status: Optional[MachineStatus] = None


# ---------------- FAILURE MODES / SPARES ----------------
class FailureMode(BaseDoc):
    code: str
    name: str
    category: str
    description: Optional[str] = None


class Spare(BaseDoc):
    sap_code: str
    name: str
    uom: str = "each"
    on_hand: float = 0.0
    min_stock: float = 0.0
    cost: float = 0.0


# ---------------- BREAKDOWN ----------------
class SpareUsed(BaseModel):
    spare_id: Optional[str] = None
    sap_code: str
    qty: float = 1
    cost: float = 0.0


class Breakdown(BaseDoc):
    ticket_no: str
    plant_id: str
    line_id: str
    machine_id: str
    reported_by: str
    reporter_email: Optional[str] = None
    area_text: Optional[str] = None
    equipment_text: Optional[str] = None
    description: str
    failure_mode_id: Optional[str] = None
    breakdown_type: BreakdownType = BreakdownType.other
    date_of_breakdown: str  # YYYY-MM-DD (line's plant date)
    breakdown_start_ts: datetime
    breakdown_end_ts: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    status: BreakdownStatus = BreakdownStatus.open
    severity: Severity = Severity.medium
    photos: List[str] = Field(default_factory=list)
    work_order_id: Optional[str] = None


class BreakdownCreateReq(BaseModel):
    line_id: str
    machine_id: str
    breakdown_type: BreakdownType = BreakdownType.other
    description: str
    severity: Optional[Severity] = None
    failure_mode_id: Optional[str] = None
    breakdown_start_ts: Optional[datetime] = None


# ---------------- WORK ORDER ----------------
class RepairEvent(BaseDoc):
    work_order_id: str
    event_type: str  # start | stop | pause | resume | complete | close
    at: datetime = Field(default_factory=now_utc)
    by: Optional[str] = None
    note: Optional[str] = None


class AssignmentHistoryEntry(BaseModel):
    at: datetime
    by: str
    to: str
    reason: Optional[str] = None


class WorkOrder(BaseDoc):
    wo_no: str
    breakdown_id: Optional[str] = None
    plant_id: Optional[str] = None
    line_id: Optional[str] = None
    machine_id: Optional[str] = None
    type: WOType = WOType.corrective
    priority: str = "p3"
    status: WOStatus = WOStatus.open
    assigned_to: Optional[str] = None
    assigned_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    repair_started_at: Optional[datetime] = None
    repair_completed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    response_time_seconds: Optional[int] = None
    repair_time_seconds: Optional[int] = None
    close_time_seconds: Optional[int] = None
    action_taken: Optional[str] = None
    root_cause: Optional[str] = None
    spares_used: List[SpareUsed] = Field(default_factory=list)
    assignment_history: List[AssignmentHistoryEntry] = Field(default_factory=list)


class WOAssignReq(BaseModel):
    assigned_to: str
    reason: Optional[str] = None


class WOCompleteReq(BaseModel):
    action_taken: str
    root_cause: Optional[str] = None
    spares_used: List[SpareUsed] = Field(default_factory=list)


# ---------------- RUNTIME ----------------
class RuntimeLog(BaseDoc):
    line_id: str
    date: str  # YYYY-MM-DD
    calendar_hours: float = 24.0
    dark_hours: float = 0.0
    run_time_hours: float = 0.0
    notes: Optional[str] = None


class RuntimeUpsertReq(BaseModel):
    line_id: str
    date: str
    calendar_hours: float
    dark_hours: float
    run_time_hours: float
    notes: Optional[str] = None


# ---------------- TIMELINE / NOTIFICATIONS / AUDIT ----------------
class TimelineEvent(BaseDoc):
    at: datetime = Field(default_factory=now_utc)
    plant_id: Optional[str] = None
    line_id: Optional[str] = None
    machine_id: Optional[str] = None
    actor_id: Optional[str] = None
    kind: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    source: str = "system"
    ref_id: Optional[str] = None


class Notification(BaseDoc):
    user_id: Optional[str] = None
    role_scope: Optional[str] = None
    line_id: Optional[str] = None
    machine_id: Optional[str] = None
    kind: NotificationKind
    severity: Severity = Severity.medium
    title: str
    body: str
    read_at: Optional[datetime] = None
    ref_type: Optional[str] = None
    ref_id: Optional[str] = None


class AuditLog(BaseDoc):
    at: datetime = Field(default_factory=now_utc)
    actor_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: str
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None


class MachineStatusRecord(BaseModel):
    machine_id: str
    status: MachineStatus
    since: datetime
    current_breakdown_id: Optional[str] = None
    updated_at: datetime = Field(default_factory=now_utc)


# ---------------- RESPONSE ENVELOPE ----------------
class Ok(BaseModel):
    ok: bool = True
    data: Any = None


class Err(BaseModel):
    ok: bool = False
    error: Dict[str, Any]
