# FACTORY CMMS ENTERPRISE — Architecture Blueprint

> Document 3 of 3 — **Digital Twin, Timeline Replay, Reports, Excel Import, Deployment**
> Preceded by `01_SYSTEM_ARCHITECTURE.md` and `02_API_WS_ENGINES.md`

---

## 9. Digital Twin Architecture

### 9.1 Visual language (SCADA control room)

- **Background**: pure `#000000`.
- **Foreground / typography**: `#FFFFFF` for primary text, `#B8B8B8` secondary.
- **Accent set (fixed, no gradients)**:
  - Green `#22C55E` — running
  - Red `#EF4444` — failed
  - Yellow `#F59E0B` — under repair
  - Gray `#6B7280` — starved / idle
  - Blue `#3B82F6` — informational
  - Cyan `#22D3EE` — data flow / conveyors
  - Magenta `#D946EF` — alerts / critical annotations
- **Type**: monospace-tinged sans (e.g. `IBM Plex Sans` for body, `IBM Plex Mono` for values). *Explicitly avoids* Inter/Roboto/Arial.
- No glassmorphism, no rounded consumer cards, no gradients. Sharp 1px borders (`#1F1F1F`), rectangular panels. Corners can be 2px, no more.
- Every reading is a **hard number** with unit and sample size next to it (`MTTR 42 min · n=17`).

### 9.2 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOP BAR : plant selector · line tabs · UTC clock · user · alerts    │
├──────────────────────┬───────────────────────────────────────────────┤
│  LEFT RAIL           │                                               │
│  · KPI strip         │           DIGITAL TWIN CANVAS                 │
│    Availability      │           (React-Flow, 70% width)             │
│    MTTR (24h/7d/30d) │                                               │
│    MTBF              │  ─── flow direction ▶                         │
│    Open WOs          │  [ Raw Infeed ] → [ Washer ] → [ Peeling ]…   │
│    Failures (24h)    │                                               │
│  · Alert feed        │  Nodes: MachineNode  Edges: cyan animated     │
│  · Legend            │                                               │
├──────────────────────┴───────────────────────────────────────────────┤
│  BOTTOM DRAWER (collapsible): active breakdowns · active WOs         │
└──────────────────────────────────────────────────────────────────────┘
```

Only one line at a time. Tabs: `PC21 · PC32 · PC36 · KKR · TWZ · BCP`.

### 9.3 Rendering approach

- **React-Flow** for the canvas (nodes, edges, panning, mini-map).
- **Custom `MachineNode`** — rectangular, thick coloured left bar showing status, machine code (mono), name, live KPI (last-failure age), small severity chip.
- **Edges** — cyan animated dashed line = product flow; a red glow overlay renders on any edge downstream of a `failed` node to visualise starvation propagation.
- **Groups (`Peeling Stage`, `Slicing Stage`, `Extruder Stage`, `Fryer`)** rendered as bordered container nodes with parallel child machines (peelers/slicers/extruders 1..N) laid out horizontally inside.
- **Subsystems** (`Heat Exchanger`, `Main Oil Pump`, `Oil Management System`) rendered as smaller child nodes attached to `Fryer` via short vertical hairlines.
- **`Finished Product Dispatch` and Packing** rendered as *terminator* shapes and marked non-metric — clicking them yields an info popover ("not tracked for MTTR/MTBF/Availability"), never a KPI page.

### 9.4 Line hierarchies (source of truth for seed)

The seed uses these exact sequences from the problem statement (order preserved). Parenthesised items are parallel siblings inside a stage.

- **PC21**: Raw Potato Infeed → Drum Washer → *Peeling Stage* → Auto Halver → *Slicing Stage* → Trim & Pare Conveyor → **Fryer** {Heat Exchanger, Main Oil Pump, Oil Management System} → OPTYX {Infeed Conveyor, Reject Conveyor, Outfeed Conveyor} → Rospen Hopper → Seasoning Tumbler → Finished Product Dispatch
- **PC32**: Crate Dumper → Barrel Washer → *Peeling Stage* (Peeler 1..4) → Auto Halver → *Slicing Stage* (Slicer 1..4) → Trim & Pare Conveyor → Fryer → OPTYX → Rospen Hopper → Seasoning Tumbler → Finished Product Dispatch
- **PC36**: Crate Dumper → Barrel Washer → *Peeling Stage* → Auto Halver → *Slicing Stage* → Trim & Pare Conveyor → Fryer → OPTYX → Rospen Hopper → Seasoning Tumbler → Finished Product Dispatch
- **KKR**: Raw Material Feeding → Blending System → *Extruder Stage* (Extruder 2..5) → Seasoning Kettle → Rospen Hopper → Seasoning Tumbler → Finished Product Dispatch
- **TWZ**: Raw Material Feeding → Dough Kneader → Extruder → Meal Transfer Blower → Retention Conveyor → Rospen Hopper → Seasoning Tumbler → Finished Product Dispatch
- **BCP**: Raw Material Feeding → Meal Transfer System → Extruder → Oven → Rospen Hopper → Seasoning Tumbler → Finished Product Dispatch

**Enforced rules encoded in seed validation:**
- OPTYX must follow Fryer.
- Rospen Hopper must precede Seasoning Tumbler.
- Auto Halver must follow Peeling.
- Heat Exchanger / Main Oil Pump / Oil Management System are subsystems of Fryer.
- OPTYX conveyors are subsystems of OPTYX.
- Peelers and Slicers are marked `parallel=true` inside their stage.
- Finished Product Dispatch and any Packing entity flagged `is_packing=true` → excluded from analytics.

### 9.5 Live updates

- On WS `machine.status_changed`, twin updates node colour + emits a 400ms pulse animation.
- On `breakdown.created`, a small severity chip appears on the node with a "Xm ago" timer and an "Assign" quick-action (admin/tech-lead).
- Alert feed shows the last 25 events (auto-scroll pinned to top). Clicking a card jumps the canvas to the affected node.

### 9.6 Non-goals (v1)

- No 3D. No physics simulation. No PLC/OPC-UA ingest yet (schema is ready via `runtime_logs` + future `sensor_readings`).
- No mobile-first layout; targets 1440×900 minimum, works down to 1024×768.

---

## 10. Timeline Replay

- URL: `/timeline/PC21?from=…&to=…`
- Fetches `GET /timeline/replay` — compact frames: `[ {t, machine_id, status, ref_type, ref_id}, … ]`.
- Client keeps a virtual clock; scrub / play / pause / speed (0.5×, 1×, 2×, 5×, 10×, 60×).
- On each frame the twin re-applies the status map. Clicking a frame opens the underlying breakdown / WO in a side sheet.
- Data source is strictly `timeline_events` — never fabricated.

---

## 11. Reporting

- **Async pipeline**: `POST /reports/generate` enqueues a job → status polled → downloadable file.
- **PDF**: WeasyPrint (Python), templated HTML, black-on-white for print, includes:
  - Executive KPIs (Availability, MTTR, MTBF, top 10 downtime contributors)
  - Pareto charts (rendered server-side via `matplotlib` → PNG embedded)
  - Machine detail sections
  - Signature block for maintenance manager
- **Excel**: `openpyxl` with multiple sheets (Summary, Breakdowns, WorkOrders, KPIs, Pareto). Freezing panes + autofilter enabled.
- Retention: files stored under `/app/reports_out/` (mounted or object storage in future) with a `reports` collection tracking metadata + expiry.

---

## 12. Excel Import (bootstrap the existing workbook)

Uploaded file: `process breakdown_cmms (2).xlsx` — one sheet "Breakdown Log", ~207 rows, columns matching the problem statement (ID, Start Time, Completion Time, Email, Area, Equipment, Description, Type, Date, Start, End, Duration, Action, Attended By, Status, Spares).

**Pipeline**
1. Upload → parse with `pandas` (fallback `openpyxl`).
2. **Normalisation**
   - Trim, dedupe, standardise date/time (Excel serial + string forms). Rows with unparseable start/end are still imported with `duration_seconds=null`.
   - Match `Equipment` text to `machines.name` per line (case-insensitive, fuzzy score ≥ 0.85). Unmatched rows land in `imports.review_queue` with suggestions.
   - Match `Attended By` free-text to `users.full_name`; unmatched become "unknown technician" placeholders and are surfaced to admin.
   - Split `Spares Used (SAP code only)` on separators → `spares_used[]`.
3. **Dry-run** returns counts: rows-ok, rows-need-review, rows-rejected, unknown-machines[], unknown-technicians[].
4. **Commit** writes `breakdowns` + auto-generates historical `work_orders` (already closed if row status=closed) + writes `repair_events` if start/end present + updates `machine_status` only for still-open rows.
5. **Timeline events** written for every imported breakdown (backdated to their real timestamps) so replay works over historical data.

**Idempotency**: import hash = `sha256(email + date + start + end + equipment + description)`. Re-uploads skip duplicates.

---

## 13. Deployment Architecture

### 13.1 On Emergent platform (production baseline)

- Backend: FastAPI/uvicorn on `0.0.0.0:8001`, `/api` prefix — supervised, hot-reload.
- Frontend: React (CRA) served on `:3000`, `REACT_APP_BACKEND_URL` from `.env`.
- MongoDB: `MONGO_URL` from `.env`, DB name from `DB_NAME`.
- Static file serving for photo uploads via backend `/api/files/{key}` (backed by local disk in v1, pluggable to object storage per Emergent Object Storage integration).
- WSS via ingress (`/api/ws`) → backend WebSocket on 8001.

### 13.2 Environment variables (backend, additive only — never remove protected keys)

```
MONGO_URL=…                  # existing
DB_NAME=…                    # existing
JWT_SECRET=…                 # NEW  (128-bit random)
JWT_ACCESS_TTL_MIN=60        # NEW
JWT_REFRESH_TTL_DAYS=7       # NEW
CORS_ORIGINS=…               # NEW  (matches REACT_APP_BACKEND_URL)
REDIS_URL=                   # NEW optional; blank = in-process pub/sub
UPLOAD_DIR=/app/backend/uploads   # NEW
REPORTS_DIR=/app/backend/reports_out  # NEW
LOG_LEVEL=INFO               # NEW
```

Frontend `.env` remains: `REACT_APP_BACKEND_URL` (unchanged).

### 13.3 Scale-out roadmap (not v1 code, only design)

- Stateless FastAPI + Redis pub/sub → N replicas behind LB.
- MongoDB replica set for transactions (breakdown+WO+timeline write in one txn).
- Object storage for photos & reports.
- ClickHouse or Timescale for very-large event history (>10M rows) with async CDC from Mongo.
- Optional PLC/OPC-UA ingest microservice writing to `runtime_logs`.

### 13.4 Observability

- Structured JSON logs (`request_id`, `user_id`, `route`, `latency_ms`, `status`).
- `/api/health` liveness + `/api/health/deep` (DB ping, WS hub count).
- Audit log doubles as security trail (login, role change, WO reassign, master-data edits, imports).

### 13.5 Migrations

- Mongo doesn't need schema migrations, but a lightweight **`schema_versions`** collection tracks structural changes; each release ships an idempotent `ensure_indexes()` + optional `data_migration_N()`.
- Seeders:
  - `seed_lines.py` — plants/lines/groups/machines/subsystems for the 6 lines above.
  - `seed_users.py` — admin/operator/technician demo accounts.
  - `seed_from_excel.py` — imports the uploaded workbook.

---

## 14. Delivery Plan (once approved — code phase)

**Phase A (MVP — first `finish`)**
1. Auth (JWT) + user/role seed
2. Plant hierarchy + seed for 6 lines
3. Breakdown creation → auto WO → machine_status
4. Twin canvas (React-Flow) with live WS updates
5. Technician queue + WO transitions + repair_events
6. Machine detail with MTTR/MTBF/Availability + Pareto + history
7. Timeline events + replay (basic)
8. Excel import (dry-run + commit)
9. Notifications & alert feed
10. Admin CRUD for master data

**Phase B (post-MVP)**
- Reports (PDF + Excel), scheduled recompute job, criticality history charts, ineffective-repair detector, threshold config UI, virtualised tables for 100k+ rows.

**Phase C (later)**
- OPC-UA / SCADA ingestion, mobile technician view, Redis pub/sub, object-storage adapter, multi-plant SSO.

---

## 15. Open Questions for User Approval

1. **Plant name & timezone** for the seeded plant (default: "Plant 1", `Asia/Kolkata`) — OK?
2. **Availability configuration** — do you have real planned-runtime data per line? If not, we ship *"Availability Not Configured"* for all lines until an admin sets it. OK?
3. **Photo/attachment storage** — start with local disk (v1) or wire Emergent Object Storage now?
4. **Ineffective-repair window** default 72 h — acceptable?
5. **Repeat-failure window** default 30 days — acceptable?
6. **Historical Excel** — should the ~207 rows in your workbook be seeded on first boot (recommended) or only via the Admin → Import wizard?
7. **Report engine** — PDF via WeasyPrint OK, or preference for another engine?
8. **Language / locale** — English only for v1?
9. Any known **critical machines** that must have `criticality_manual` pre-seeded?

---

## 16. What happens on your approval

- I'll invoke `integration_playbook_expert_v2` for the JWT auth playbook (mandatory per platform rules) before writing any auth code.
- I'll then build **Phase A** end-to-end in one pass using parallel file creation, seed the 6 lines + demo users + import the Excel, and run the testing agent before declaring the MVP done.
- Deployment on Emergent uses the standard React/FastAPI/MongoDB pipeline — no code changes needed to make it remotely accessible; every browser hitting `REACT_APP_BACKEND_URL` will see the same live twin.

> **Please review the three documents (`01_SYSTEM_ARCHITECTURE.md`, `02_API_WS_ENGINES.md`, `03_DIGITAL_TWIN_DEPLOYMENT.md`) and reply with either "approved" or the specific changes you want. No code will be written until you approve.**
