# FACTORY CMMS ENTERPRISE — Architecture Blueprint

> Document 1 of 3 — **System, Database, ER, Workflows, Auth**
> Companion docs: `02_API_WS_ENGINES.md`, `03_DIGITAL_TWIN_DEPLOYMENT.md`
> Status: **Awaiting user approval before any code is written**

---

## 0. Guiding Constraints

| Constraint | Decision |
|---|---|
| Environment | React (CRA) + FastAPI + MongoDB (Emergent platform standard) |
| DB engine | MongoDB, modelled with strict *relational-style* collections (foreign-key `ObjectId` references, no nested denormalisation of transactional data) |
| Auth | JWT (HS256), 3 primary roles — `operator`, `technician`, `admin`, plus permission flags for future granularity |
| Realtime | Native WebSocket via FastAPI `WebSocket` + Redis-less in-memory pub/sub (single-process); pluggable adapter for Redis when horizontally scaled |
| Single source of truth | MongoDB. Excel is *import-only*. UI never reads a spreadsheet. |
| Client → DB | Never direct. All access flows through `/api/*` REST or `/ws` WebSocket. |

---

## 1. Complete System Architecture

### 1.1 Logical topology

```
┌───────────────────────────────────────────────────────────────────────┐
│                        BROWSER (SCADA-style SPA)                      │
│  React 19 + Tailwind + shadcn/ui + Recharts + React-Flow (twin)       │
│  ─────────────────────────────────────────────────────────────────    │
│   • Digital Twin Canvas (70% viewport, per-line)                      │
│   • Sidebar: Line tabs, KPI strip, alert feed                         │
│   • Modules: Breakdown Entry, Work Orders, Machine Detail,            │
│     Timeline Replay, Analytics, Reports, Admin                        │
│   • WebSocket client (auto-reconnect, JWT handshake)                  │
└──────────────▲───────────────────────────────▲────────────────────────┘
           HTTPS │ JSON REST                WSS │ JSON events
                │                               │
┌───────────────┴───────────────────────────────┴───────────────────────┐
│                       FASTAPI BACKEND (uvicorn:8001)                  │
│  ─────────────────────────────────────────────────────────────────    │
│   Routers (/api/*)          WebSocket Hub (/api/ws)                   │
│    • auth                    • channel: plant:{plantId}               │
│    • plants/lines/machines   • channel: line:{lineId}                 │
│    • breakdowns              • channel: user:{userId}                 │
│    • work_orders             • events: machine.status_changed,        │
│    • technicians / users       breakdown.created, wo.assigned, …      │
│    • analytics (RCM)                                                  │
│    • timeline                Services layer                           │
│    • reports (PDF/XLSX)       • BreakdownService                      │
│    • notifications            • WorkOrderService                      │
│    • audit                    • ReliabilityEngine (MTTR/MTBF/Avail)   │
│    • imports (Excel)          • TimelineService                       │
│                               • NotificationService                   │
│   Middleware                  • AuditService                          │
│    • JWT auth                 • ExcelImportService                    │
│    • RBAC guard                                                       │
│    • Audit interceptor       Background jobs (APScheduler)            │
│    • Request ID / logging     • MTTR/MTBF recompute (5-min)           │
│                               • Overdue-WO watcher (1-min)            │
│                               • Repeat-failure detector (event-driven)│
└──────────────▲────────────────────────────────────▲───────────────────┘
               │ Motor async driver                 │
┌──────────────┴────────────────────────────────────┴───────────────────┐
│                              MONGODB                                  │
│   Collections (relational-style, see §2)                              │
│   Indexes for time-series queries on breakdowns & timeline_events     │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 Deployment shape

- **Single backend process** on Emergent (uvicorn, port 8001, `/api` prefix enforced by ingress).
- **Frontend** served on port 3000, uses `REACT_APP_BACKEND_URL` for both REST and WSS.
- **MongoDB** via `MONGO_URL` (Motor async).
- **Horizontal scale path**: when >1 backend replica is needed, the in-memory pub/sub is swapped for Redis pub/sub (single env var flip). No code change on the frontend.

### 1.3 Layered code layout (backend)

```
/app/backend/
├── server.py                     # FastAPI app factory, router registration
├── core/
│   ├── config.py                 # env loader
│   ├── security.py               # JWT, password hashing (bcrypt)
│   ├── deps.py                   # get_current_user, require_role
│   ├── db.py                     # Motor client, get_db()
│   ├── ws_hub.py                 # WebSocket connection manager & pub/sub
│   └── audit.py                  # AuditService
├── models/                       # Pydantic + BaseDocument
│   ├── base.py                   # PyObjectId, BaseDocument
│   ├── user.py, role.py
│   ├── plant.py, line.py, machine.py, subsystem.py
│   ├── breakdown.py, work_order.py, repair_event.py
│   ├── failure_mode.py, spare.py
│   ├── runtime_log.py, availability_config.py
│   ├── notification.py, audit_log.py, timeline_event.py
│   └── settings.py
├── routers/
│   ├── auth.py, users.py, plants.py, lines.py, machines.py
│   ├── breakdowns.py, work_orders.py, technicians.py
│   ├── analytics.py, timeline.py, reports.py
│   ├── notifications.py, audit.py, imports.py
│   └── ws.py                     # /api/ws endpoint
├── services/
│   ├── breakdown_service.py, work_order_service.py
│   ├── reliability_engine.py     # MTTR / MTBF / Availability / Pareto
│   ├── timeline_service.py, notification_service.py
│   ├── excel_import_service.py, report_service.py
│   └── criticality_service.py
├── jobs/
│   ├── scheduler.py              # APScheduler bootstrap
│   ├── recompute_kpis.py, overdue_watcher.py
│   └── repeat_failure_detector.py
└── seed/
    ├── seed_lines.py             # PC21/PC32/PC36/KKR/TWZ/BCP hierarchy
    ├── seed_users.py             # default admin + demo operator/technician
    └── seed_from_excel.py        # imports uploaded workbook
```

### 1.4 Layered code layout (frontend)

```
/app/frontend/src/
├── App.js                        # router + auth boot
├── lib/
│   ├── api.js                    # axios instance w/ JWT interceptor
│   ├── ws.js                     # WebSocket client (reconnect, subscribe)
│   ├── auth.js                   # token store, role helpers
│   └── format.js                 # duration, MTTR, date helpers
├── contexts/
│   ├── AuthContext.jsx
│   ├── LineContext.jsx           # active line tab
│   └── LiveContext.jsx           # live event stream → state
├── pages/
│   ├── LoginPage.jsx
│   ├── ControlRoomPage.jsx       # digital twin (default landing)
│   ├── BreakdownEntryPage.jsx    # operator flow
│   ├── WorkOrderQueuePage.jsx    # technician flow
│   ├── MachineDetailPage.jsx
│   ├── TimelineReplayPage.jsx
│   ├── AnalyticsPage.jsx
│   ├── ReportsPage.jsx
│   └── admin/
│       ├── UsersPage.jsx, PlantsPage.jsx, LinesPage.jsx,
│       ├── MachinesPage.jsx, RuntimePage.jsx, SettingsPage.jsx
├── components/
│   ├── twin/                     # ProcessMap, MachineNode, EdgePipe
│   ├── kpi/                      # KpiStrip, MttrCard, MtbfCard, AvailCard
│   ├── charts/                   # Pareto, Trend, DowntimeBar
│   ├── work_orders/, breakdowns/, timeline/, alerts/, tables/
│   └── ui/                       # shadcn (existing)
```

---

## 2. Database Schema Design (MongoDB, relational-style)

All collections extend `BaseDocument` (see rules): `_id` → `id: PyObjectId`, plus `created_at`, `updated_at`, `created_by`, `updated_by` (Object IDs). `datetime.now(timezone.utc)`.

### 2.1 Identity & Access

**`users`**
| Field | Type | Notes |
|---|---|---|
| id | ObjectId | PK |
| email | string (unique, indexed) | login handle |
| password_hash | string | bcrypt |
| full_name | string | |
| role | enum(`admin`,`technician`,`operator`) | primary role |
| permissions | string[] | fine-grained flags e.g. `wo.reassign` |
| phone | string? | for future SMS |
| active | bool | soft-disable |
| last_login_at | datetime? | |
| plant_scope | ObjectId[] | plants this user may see |
| created_at/updated_at/created_by/updated_by | | audit fields |

**`roles`** (seed-only, used for future dynamic RBAC)
- `id, code, name, description, default_permissions[]`

**`permissions`** (catalogue)
- `id, code, description, category`

### 2.2 Plant Hierarchy

**`plants`** — `id, code, name, timezone, address, active`
**`production_lines`** — `id, plant_id (→plants), code (PC21|PC32|PC36|KKR|TWZ|BCP), name, sequence, active`
**`machine_groups`** — logical stage groups: e.g. `Peeling Stage`, `Slicing Stage`, `Fryer`, `Extruder Stage`
  - `id, line_id, code, name, sequence, is_parallel_group (bool), is_stage (bool)`
**`machines`**
| Field | Type | Notes |
|---|---|---|
| id | ObjectId | |
| line_id | ObjectId → production_lines | |
| group_id | ObjectId? → machine_groups | |
| parent_machine_id | ObjectId? → machines | for subsystem parenting (Heat Exchanger → Fryer) |
| code | string | unique within line |
| name | string | |
| sequence | int | position in flow |
| kind | enum(`stage`,`machine`,`subsystem`,`conveyor`,`utility`) | |
| is_packing | bool | true → excluded from MTTR/MTBF/Avail |
| criticality_manual | int? 1–10 | admin override |
| criticality_computed | float? | reliability engine |
| status | enum(`running`,`failed`,`repair`,`starved`,`idle`,`unknown`) | live |
| current_breakdown_id | ObjectId? | active event |
| meta | object | free-form (SAP code, model, mfg, etc.) |

**`machine_subsystems`** — modelled as `machines` with `kind='subsystem'` + `parent_machine_id`. (Explicit collection avoided to keep queries simple; single table with parent link.)

### 2.3 Runtime & Availability

**`runtime_logs`** — per line, per shift/day: `id, line_id, start_ts, end_ts, planned_runtime_seconds, actual_runtime_seconds, notes`
**`availability_config`** — `id, scope_type (line|machine), scope_id, planned_hours_per_day, shift_pattern (json), effective_from, effective_to`
  - If none exists for a machine's line, analytics returns literal string **"Availability Not Configured"** (never fabricates).

### 2.4 Failures & Work

**`failure_modes`** — catalogue: `id, code, name, category (mechanical|electrical|process|instrumentation|utility|operator_error|planned), description`

**`spares`** — `id, sap_code (unique), name, uom, min_stock, on_hand, cost`

**`breakdowns`** — the operator-facing incident record (equivalent to a row in the Excel)
| Field | Type | Notes |
|---|---|---|
| id | ObjectId | |
| ticket_no | string (unique, indexed) | e.g. `BD-2026-000123` |
| plant_id, line_id, machine_id | ObjectId | |
| reported_by | ObjectId → users | operator |
| reporter_email | string | denorm for Excel parity |
| area_text | string | free-text "Area of Breakdown" |
| equipment_text | string | free-text as entered (kept for legacy Excel rows) |
| description | text | "Breakdown Description" |
| failure_mode_id | ObjectId? → failure_modes | |
| breakdown_type | enum(`mechanical`,`electrical`,`process`,`instrument`,`utility`,`operator`,`planned`,`other`) | |
| date_of_breakdown | date | |
| breakdown_start_ts | datetime | |
| breakdown_end_ts | datetime? | null while open |
| duration_seconds | int? | computed on close |
| status | enum(`open`,`assigned`,`in_progress`,`awaiting_parts`,`resolved`,`closed`,`cancelled`) | |
| severity | enum(`low`,`medium`,`high`,`critical`) | |
| photos | string[] | object-storage keys |
| work_order_id | ObjectId? → work_orders | back-ref |
| audit fields | | |
| indexes | `line_id+breakdown_start_ts`, `machine_id+breakdown_start_ts`, `status`, `ticket_no` |

**`work_orders`** — the technician-facing workflow wrapper
| Field | Type | Notes |
|---|---|---|
| id | ObjectId | |
| wo_no | string (unique) | `WO-2026-000123` |
| breakdown_id | ObjectId → breakdowns | 1:1 (nullable for planned WOs) |
| type | enum(`corrective`,`preventive`,`predictive`,`inspection`) | |
| priority | enum(`p1`,`p2`,`p3`,`p4`) | |
| assigned_to | ObjectId? → users (technician) | |
| assigned_at | datetime? | |
| accepted_at | datetime? | |
| repair_started_at | datetime? | |
| repair_completed_at | datetime? | |
| closed_at | datetime? | |
| response_time_seconds | int? | assigned→accepted |
| repair_time_seconds | int? | started→completed |
| close_time_seconds | int? | completed→closed |
| action_taken | text | |
| root_cause | text? | |
| spares_used | array of `{spare_id, sap_code, qty, cost}` | |
| status | enum(`draft`,`open`,`assigned`,`in_progress`,`awaiting_parts`,`completed`,`closed`,`cancelled`) | |
| assignment_history | array of `{by, to, at, reason}` | reassignments |
| audit fields | | |
| indexes | `assigned_to+status`, `status+created_at`, `wo_no` |

**`repair_events`** — granular clock events on a WO (start/stop/hold/resume) for accurate MTTR
- `id, work_order_id, event_type (start|stop|pause|resume|complete|close), at, by, note`
- Repair time = sum of intervals `start..stop` (excluding pauses).

### 2.5 Live State & Streams

**`machine_status`** — small, denormalised, one row per machine (fast reads for twin)
- `machine_id (unique), status, since, current_breakdown_id, updated_at`
- Written by BreakdownService/WorkOrderService transitions.

**`timeline_events`** — every state-changing event, source of truth for replay
- `id, at, plant_id, line_id, machine_id?, actor_id, kind, payload (json), source (breakdown|wo|manual|system), ref_id (breakdown/wo id)`
- `kind` ∈ `machine.status_changed`, `breakdown.created`, `breakdown.closed`, `wo.assigned`, `wo.started`, `wo.completed`, `notification.raised`, `criticality.recomputed`, `import.completed`, `user.login`, …
- Indexes: `line_id+at`, `machine_id+at`, `kind+at`.

**`notifications`**
- `id, user_id?, role_scope?, line_id?, machine_id?, kind (machine_down|critical|repeat_failure|infant_mortality|threshold_breach|unassigned_wo|overdue_repair), severity, title, body, read_at?, created_at, ref_type, ref_id`

**`audit_logs`**
- `id, at, actor_id, action, entity_type, entity_id, before (json?), after (json?), ip, ua, request_id`
- Written by AuditService for every mutating endpoint; retained indefinitely.

### 2.6 Analytics Support

**`criticality_scores`** — historical snapshots
- `id, machine_id, at, score, components {frequency, downtime, mttr, safety_weight, business_weight}`

**`settings`** — global tunables (single doc)
- `mttr_recompute_interval_min, overdue_wo_hours, repeat_failure_window_days, infant_mortality_hours, criticality_weights, features { … }`

### 2.7 Indexing summary

| Collection | Indexes |
|---|---|
| users | `email`(unique) |
| production_lines | `plant_id+code`(unique) |
| machines | `line_id+code`(unique), `parent_machine_id`, `status` |
| breakdowns | `ticket_no`(unique), `line_id+breakdown_start_ts`, `machine_id+breakdown_start_ts`, `status`, `date_of_breakdown` |
| work_orders | `wo_no`(unique), `assigned_to+status`, `breakdown_id`, `status+created_at` |
| repair_events | `work_order_id+at` |
| timeline_events | `line_id+at`, `machine_id+at`, `kind+at` |
| audit_logs | `entity_type+entity_id`, `actor_id+at` |
| notifications | `user_id+read_at`, `role_scope+created_at` |
| machine_status | `machine_id`(unique) |

---

## 3. ER Diagram (textual)

```
plants (1)───(N) production_lines (1)───(N) machine_groups (1)───(N) machines
                                          │                            │
                                          └────(N) machines────────────┘
                                                    │  (self-ref parent_machine_id for subsystems)
                                                    │
users (1)───(N) breakdowns (N)───(1) machines       │
   │             │                                  │
   │             └────(1)  work_orders  ────────────┘
   │                          │
   │                          ├─(N) repair_events
   │                          └─(N) spares_used (embedded array w/ spare_id → spares)
   │
   ├─(N) audit_logs
   ├─(N) notifications
   └─(N) timeline_events (actor)

machines (1)───(N) timeline_events
machines (1)───(1) machine_status          (denorm live cache)
machines (1)───(N) criticality_scores      (history)
production_lines (1)───(N) runtime_logs
(scope_type,scope_id) ──── availability_config
failure_modes (1)───(N) breakdowns
```

**Cardinality highlights**
- `breakdown ↔ work_order` : 1:1 (a corrective WO is auto-generated on breakdown creation; planned WOs may exist without breakdown).
- `machine ↔ machine` : self-referential parent link for subsystems (Heat Exchanger.parent = Fryer).
- `technician (user) ↔ work_orders` : 1:N via `assigned_to`.

---

## 4. User Workflow Design

### 4.1 Operator flow — "Report a breakdown"

```
[Login]
  └─▶ [Control Room / Twin]  (default landing, shows active line)
        └─▶ [+ New Breakdown]  ← FAB visible only to operators
              ├─ Step 1: Select line (default = current tab)
              ├─ Step 2: Pick machine on twin OR from list
              ├─ Step 3: Failure category + failure_mode (searchable)
              ├─ Step 4: Description + optional photos
              ├─ Step 5: Severity (auto-suggest from machine.criticality)
              └─ Submit
                  ├─ Backend: create breakdown → auto-generate WO → set machine_status=failed
                  │           → write timeline_event(s) → broadcast WS
                  └─ Confirmation screen with ticket_no
```

Operator cannot edit historical rows. Only their own **open** breakdown can be edited within a 10-min grace window (config).

### 4.2 Technician flow — "Take a work order to closure"

```
[Login]
  └─▶ [My Queue] (default landing for technicians)
        ├─ Assigned to me   |  Line queue   |  All open
        └─ Open a WO card
              ├─ Machine history side-panel (last 20 failures, MTTR trend)
              ├─ [Accept]        → status=in_progress? (or 'assigned→accepted')
              ├─ [Start Repair]  → repair_events += {start}; status=in_progress
              ├─ [Pause] / [Resume]   → repair_events
              ├─ Add spares (SAP-code autocomplete → decrement on_hand)
              ├─ Enter action_taken + root_cause
              ├─ [Complete]      → repair_events += {complete}; status=completed
              └─ [Close]         → status=closed; breakdown resolved;
                                    machine_status=running; timeline update; WS broadcast.
```

Technicians can view any machine's history but cannot modify master data.

### 4.3 Admin flow

```
[Login]
  └─▶ [Control Room] (all lines visible)
        ├─ Admin menu → Users / Plants / Lines / Machines / Runtime / Failure Modes / Spares / Settings
        ├─ Reassign WO, override criticality, edit master data
        ├─ Excel import wizard (map columns → dry-run diff → commit)
        └─ Full audit trail viewer with filters
```

### 4.4 State machines

**Breakdown**
`open → assigned → in_progress → (awaiting_parts) → resolved → closed`
(any → `cancelled` by admin, with reason logged)

**Work Order**
`draft → open → assigned → in_progress → (awaiting_parts) → completed → closed`
Transitions guarded by role + current status; every transition writes `audit_logs` + `timeline_events`.

**Machine status** (derived, not manually edited)
- `running` when no open breakdown.
- `failed` on breakdown.created.
- `repair` on WO first `repair_events.start`.
- `running` on WO close.
- `starved`/`idle` reserved for future SCADA feed; manually settable by admin.

---

## 5. Authentication Architecture

### 5.1 Choice
- **JWT (HS256)** with short-lived access token (60 min) + refresh token (7 days) stored `httpOnly` when possible; for SPA simplicity token stored in memory + refresh in `localStorage` (documented risk, acceptable for internal factory network).
- Password hashing: **bcrypt** (`passlib[bcrypt]`), never storing plaintext.
- **`integration_playbook_expert_v2` will be invoked** during code phase since any auth touch requires it per platform rules.

### 5.2 Endpoints
- `POST /api/auth/register` — admin only (creates operator/technician).
- `POST /api/auth/login` — email + password → `{access, refresh, user}`.
- `POST /api/auth/refresh` — refresh token → new access.
- `POST /api/auth/logout` — invalidate refresh (blacklist collection).
- `GET  /api/auth/me` — current user.

### 5.3 Middleware
- `get_current_user(token)` — decodes JWT, loads user (cached 30 s).
- `require_role("admin")` / `require_any_role(...)` dependency for routers.
- `require_permission("wo.reassign")` for fine-grained checks.

### 5.4 Seeded accounts (for first run)
| Role | Email | Purpose |
|---|---|---|
| admin | `admin@factory.local` | full access |
| technician | `tech@factory.local` | demo technician |
| operator | `op@factory.local` | demo operator |

Passwords stored in `/app/memory/test_credentials.md` after code phase.

### 5.5 Security controls
- Rate limit `/api/auth/login` (5/min/IP).
- Lockout after 10 consecutive failures for 15 min.
- Password policy: min 8, mixed case + digit.
- All auth events emit `audit_logs` and `timeline_events(kind=user.login)`.
- CORS restricted to `REACT_APP_BACKEND_URL` origin.

---

*(continued in `02_API_WS_ENGINES.md` — API surface, WebSocket protocol, reliability engine, and in `03_DIGITAL_TWIN_DEPLOYMENT.md` — twin rendering, timeline replay, reports, deployment.)*
