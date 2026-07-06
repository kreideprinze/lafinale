# FACTORY CMMS ENTERPRISE — Product Requirements Document (PRD)

## Original Problem Statement
Build a production-grade, SCADA-styled, centralized live CMMS + Reliability Engineering + Digital Twin platform for a food manufacturing factory with 6 production lines (PC21, PC32, PC36, KKR, TWZ, BCP). Comparable in ambition to IBM Maximo / SAP PM / Fiix / MaintainX / Limble. Real-time updates, MTTR/MTBF/Availability/Pareto/Criticality analytics, work-order workflow, digital twin, timeline replay, audit trail, reporting, role-based access (Operator / Technician / Admin), and remote multi-user deployment. Data source of truth = database (Mongo per platform), not Excel.

## Confirmed User Choices (from first `ask_human`)
- DB engine: **MongoDB** with strict relational-style modelling.
- First deliverable: **Architecture document first — no code until user approves.**
- Auth: **JWT with Operator / Technician / Admin roles.**
- Realtime: **WebSockets.**
- Seed: **Yes** — seed 6 lines with full hierarchy + import uploaded Excel workbook.

## User Personas
- **Operator** — creates breakdowns, cannot delete/edit history.
- **Technician** — receives WOs, executes repairs, records action/spares.
- **Admin (Maintenance / Plant Manager)** — full CRUD, analytics, reports, master data.

## Core Requirements (static)
1. Live digital twin (SCADA aesthetic), one line at a time, 70% viewport.
2. Real-time WS updates for machine states, breakdowns, WO transitions, alerts.
3. Reliability engine: MTTR, MTBF, Availability, Pareto, repeat-failure, infant-mortality, criticality.
4. Work-order state machine with audit trail.
5. Timeline replay from SQL/Mongo (never fabricated).
6. Excel import (dry-run + commit) for legacy workbook.
7. PDF + XLSX report exports.
8. Multi-user remote deployment, all data via backend API.
9. Packing / Finished Product Dispatch never receive MTTR/MTBF/Availability scores.
10. If planned runtime absent → display literal "Availability Not Configured".

## Approved Modifications (2026-02-11)
1. **LAN-only deployment** — closed factory network, no cloud dependencies, no CDN fonts, docker-compose shipped for on-prem server.
2. **Remove all shift management** (no A/B/C shifts, no shift-based KPIs, no shift analytics).
3. **Lightweight asset register** — only Machine Name, Line, SAP Code, Machine Type, Status, Criticality. Drop manufacturer/serial/install date/warranty.
4. **Plant Runtime module retained** with fields: Date, Production Line, Calendar Hours, Dark Hours, Run Time. Availability driven from this; missing → "Availability Not Configured".
5. **Operator flow ≤ 15 sec**: Select Line → Select Machine → Select Breakdown Type → Description → Submit.
6. Architecture approved; implementation may begin.

## Implementation Status

### 2026-02-11 — Phase A MVP COMPLETE ✅
**Backend (FastAPI + MongoDB, all `/api/*`):**
- JWT auth (login/refresh/logout/me/register) with email-based brute-force lockout, bcrypt hashing.
- 3-role RBAC guard (admin / technician / operator).
- Plant → Line → Machine hierarchy seeded for 6 lines (PC21/PC32/PC36/KKR/TWZ/BCP) with parallel peelers/slicers/extruders and Fryer/OPTYX subsystems. Rules enforced (OPTYX after Fryer, Rospen before Seasoning, Auto Halver after Peeling).
- Machine asset register endpoints (lightweight: name/line/SAP/type/status/criticality).
- Breakdown creation → auto WO generation → live status → WebSocket broadcast.
- Full WO state machine: assign → accept → start → complete → close (with `repair_events` clock, spare consumption).
- Reliability engine: MTTR, MTBF, Availability, Pareto, downtime trend, rankings — packing terminators excluded. Returns literal "Availability Not Configured" when no runtime data.
- Plant Runtime module (date/line/calendar/dark/run_time hrs) with validation.
- Failure modes + spares CRUD, notifications (repeat-failure + infant-mortality detectors), audit logs.
- Timeline events + replay endpoint.
- Excel import: dry-run + commit with fuzzy machine matching and idempotency (SHA256 dedup).
- WebSocket `/api/ws?token=…` with subscribe/unsubscribe/ping ops, JWT handshake, auto-reconnect.

**Frontend (React + Tailwind + Recharts, SCADA aesthetic):**
- Pure-black SCADA theme with cyan/green/red/yellow accents, no gradients, no CDN fonts (LAN-safe).
- Login page with quick-fill demo accounts.
- Digital Twin Control Room (default landing) — 6 line tabs, live process flow, parallel-machine stages, subsystem chips under Fryer/OPTYX, terminator marking for dispatch. Right-click any machine to report breakdown.
- KPI strip (Availability / MTTR / MTBF / Open WOs / Downtime) with live WS refresh.
- Alert feed panel.
- Quick Breakdown dialog (< 15 s: line → machine → type → description → submit).
- Breakdowns listing with filters, Work Order queue + detail with full lifecycle actions.
- Machine detail page (KPIs, pareto chart, breakdown/WO history).
- Analytics page (downtime trend chart, machine pareto, rankings).
- Timeline Replay with play/pause/scrub, 6 speeds, machine grid replay.
- Runtime entry page (admin) with upsert.
- Notifications page.
- Admin section: Users CRUD, Machines register (editable SAP/type/criticality), Excel Import wizard.

**Testing:** All 33 backend pytest cases pass. All frontend flows verified by the testing agent. Two minor issues fixed post-test: `_id` stripped before WS broadcast; brute-force lockout keyed on email (ingress-safe).

### 2026-02-11 — Architecture drafted (no code yet)
- Produced `/app/docs/01_SYSTEM_ARCHITECTURE.md` — system topology, DB schema (relational-style Mongo), ER diagram, workflows, auth architecture.
- Produced `/app/docs/02_API_WS_ENGINES.md` — REST surface, WebSocket protocol, reliability engine formulas & detectors.
- Produced `/app/docs/03_DIGITAL_TWIN_DEPLOYMENT.md` — twin rendering, line hierarchies (with parallel machines & subsystems), timeline replay, reports, Excel import pipeline, deployment on Emergent, phased delivery plan.
- Awaiting user approval to enter code phase.

## Prioritized Backlog

### P0 (Phase A — MVP, on approval)
- JWT auth + 3 seeded roles (invoke `integration_playbook_expert_v2` first)
- Plant hierarchy + seed for 6 lines with correct parallel machines & subsystems
- Breakdown → auto WO → live status → WS broadcast
- Digital Twin canvas (React-Flow) with line tabs
- Technician WO queue + full state machine + repair_events
- Machine detail page with MTTR/MTBF/Availability + Pareto + history
- Timeline events + basic replay
- Excel import (dry-run + commit) of uploaded workbook
- Notifications & alert feed
- Admin CRUD for users/lines/machines/failure modes/spares/settings

### P1 (Phase B)
- PDF + XLSX reporting engine
- Scheduled recompute job + KPI cache
- Criticality history charts + composite score UI
- Ineffective-repair detector + downtime-threshold alerts
- Virtualised tables for 100k+ rows

### P2 (Phase C)
- OPC-UA / SCADA ingestion service
- Redis pub/sub for horizontal scale
- Object storage adapter for photos/reports
- Mobile technician view
- Multi-plant SSO

## Next Tasks
1. Wait for user approval on the three architecture documents.
2. On approval → call `integration_playbook_expert_v2` for JWT auth playbook.
3. Build Phase A with parallel file creation.
4. Seed data + Excel import.
5. `testing_agent_v3` end-to-end before `finish`.

### 2026-02-11 — Global Filter Bar + LAN Deployment Kit
**Global Analytics Context Bar** (sticky under top nav, visible on every page):
- Date range preset dropdown (Today / Yesterday / Last 7 / Last 30 / This Month / Previous Month / This Quarter / This Year / All Time / Custom)
- Custom from/to date picker
- Line, Machine (scoped to selected line), Failure Mode, Technician selectors
- Live "ACTIVE" count badge (cyan-pulsing when > 0), Clear button
- Persisted to `localStorage` so it survives navigation & reloads
- All modules consume: Digital Twin, KPI strip, MTTR/MTBF/Availability, Reliability Analytics, Pareto, Machine Detail, Timeline Replay, Work Orders, Breakdowns
- Backend endpoints (`/api/breakdowns`, `/api/work-orders`, `/api/analytics/rankings`) accept `from`, `to`, `line_id`, `machine_id`, `failure_mode_id`, `technician_id`
- Fonts: **IBM Plex Sans / Mono** self-hosted via `@fontsource` (no CDN — LAN-safe)

**LAN Deployment Kit** at `/app/deploy/`:
- `setup.sh` — installs MongoDB 7 + Node 20 + Yarn + Nginx + Python venv, copies source to `/opt/factory-cmms`, builds React prod build to `/var/www/factory-cmms`, generates JWT secret, registers `factory-cmms-backend.service` systemd unit, configures Nginx as reverse proxy on port 80 (SPA + `/api/*` + WebSocket `/api/ws`).
- `start.sh` / `stop.sh` — start/stop services, print auto-detected LAN IP.
- `verify_install.sh` — 15-point health check (services, ports, HTTP endpoints, LAN reachability).
- `.env.example` + `README.md` — full install/upgrade/backup guide.
- Frontend uses same-origin URLs when `REACT_APP_BACKEND_URL` is empty — one URL `http://<HOST_IP>` for all users on the LAN, backend port `8001` bound to `127.0.0.1` only (hidden).


### 2026-02-11 — Multi-Department + Bulk Runtime Import + Final Shift Purge
**Multi-department architecture (Process / Packaging / Utilities)**
- `production_lines`, `machines`, `breakdowns`, `work_orders` all carry `department`.
- Seed script `/app/backend/seed_departments.py` + data at `factory_data_extra.py` populate Packaging (PC21..BCP dupes, palletizers PALLET-A..G) and Utilities lines.
- Endpoints: `GET /api/departments`, `GET /api/lines?department=`, `GET /api/machines?department=`, `GET /api/analytics/department/{dept}/kpi`.
- `GlobalFilterBar` now cascades Department → Area → Machine using native `<select>` (data-testids `flt-dept-select`, `flt-line-select`, `flt-machine-select`).
- `AnalyticsPage` renders DEPARTMENT KPI panel (failures / downtime / MTTR / top causes / top equipment / monthly trend) when a department is chosen in the filter bar.

**Shift tracking — FULLY REMOVED (per user request 2026-02-11)**
- Frontend: removed SHIFT `<FilterCell>` from `GlobalFilterBar.jsx`, removed `shift` / `setShift` from `FilterContext.jsx`, deleted `_shiftFilter` from `BreakdownsPage.jsx`.
- Backend: no shift field on any model or endpoint. Unknown `?shift=` query params are silently ignored (harmless).
- System now supports only Department, Area, Equipment, and Date filters.

**Bulk Runtime CSV Import** (`/admin/runtime-import` — admin only)
- Backend endpoints:
  - `GET  /api/runtime/bulk-import/template` — downloads header + example row
  - `POST /api/runtime/bulk-import/dry-run` — multipart CSV upload, returns per-row validation summary (valid/errors/duplicates/would_insert/would_update/sample)
  - `POST /api/runtime/bulk-import/commit` — actually inserts or upserts by `(line_id, date)`
- CSV columns: `line_code` (req), `department` (optional — required only when a line code is duplicated across departments, e.g. PC21), `date` (YYYY-MM-DD | DD-MM-YYYY | DD/MM/YYYY), `calendar_hours`, `dark_hours`, `run_time_hours`, `notes`.
- Validation: unknown line, invalid date, negative hours, run > calendar, ambiguous line without dept.
- Frontend UI: DRY RUN preview → COMMIT enabled only when errors=0. Shows insert/update/error counts and first-N error list.

**Regression tests**: `/app/backend/tests/backend_test.py` — 21 pytest cases (auth, cascading filters, dept KPI, bulk-import dry-run/commit/template) — 21/21 pass.

## Backlog (P1 / P2)
- P1: PDF export of Department KPI panel
- P1: Availability report combining runtime_logs + breakdowns per department per month
- P2: Bulk CSV import for machines and failure-modes (same UX as runtime import)
- P2: Refactor N+1 Mongo lookups in `bulk_runtime_dry_run`/`commit` (do one bulk `$or` find instead of per-row `find_one`) — flagged by testing agent, acceptable for now at ≤1000-row CSVs.
- P2: Cleanup React hydration warning `<span> cannot be a child of <option>` (editor instrumentation, non-blocking).
