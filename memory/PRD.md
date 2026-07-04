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

## Implementation Status

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
