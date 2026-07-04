# FACTORY CMMS ENTERPRISE — Architecture Blueprint

> Document 2 of 3 — **REST API, WebSocket, Reliability Engine**
> Preceded by `01_SYSTEM_ARCHITECTURE.md`, followed by `03_DIGITAL_TWIN_DEPLOYMENT.md`

---

## 6. API Architecture

### 6.1 Conventions

- Base URL: `${REACT_APP_BACKEND_URL}/api`
- All responses: `{ "ok": bool, "data": ..., "error"?: {"code","message","details"} }`
- Pagination: `?page=1&size=50` → `{ items, total, page, size, has_next }`
- Sorting: `?sort=-breakdown_start_ts,machine_name`
- Filtering: RSQL-lite query string (`?line=PC21&status=open&from=…&to=…`)
- Time: ISO-8601 UTC in transit; UI localises to plant timezone.
- Idempotency: `Idempotency-Key` header supported on `POST /breakdowns`.

### 6.2 REST surface

**Auth**
`POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/register` (admin)

**Users & Roles**
`GET/POST /users` · `GET/PATCH/DELETE /users/{id}` · `POST /users/{id}/reset_password` · `GET /roles` · `GET /permissions`

**Plant hierarchy**
`GET/POST /plants` · `GET/PATCH/DELETE /plants/{id}`
`GET/POST /lines` · `GET/PATCH/DELETE /lines/{id}`
`GET/POST /machines` · `GET/PATCH/DELETE /machines/{id}`
`GET /lines/{id}/tree` — line → groups → machines → subsystems (twin payload)

**Master data**
`GET/POST /failure-modes` · `GET/POST /spares` · `GET/PATCH /settings`
`GET/POST /availability-config` · `GET/POST /runtime-logs`

**Breakdowns (Operator)**
`POST /breakdowns` — create (auto-generates WO)
`GET  /breakdowns` — list, filterable by line/machine/status/date
`GET  /breakdowns/{id}` · `PATCH /breakdowns/{id}` (grace window)
`POST /breakdowns/{id}/photos` — multipart
`POST /breakdowns/{id}/cancel` (admin)

**Work Orders (Technician / Admin)**
`GET  /work-orders?assigned_to=me&status=…`
`GET  /work-orders/{id}` · `PATCH /work-orders/{id}`
`POST /work-orders/{id}/assign` (admin/tech-lead)
`POST /work-orders/{id}/accept` (technician)
`POST /work-orders/{id}/start` · `/pause` · `/resume` · `/complete` · `/close`
`POST /work-orders/{id}/spares` — add spare usage
`GET  /work-orders/{id}/timeline` — repair_events chronology

**Machine detail (all roles, read)**
`GET /machines/{id}/overview` — status + KPIs + criticality
`GET /machines/{id}/breakdowns?limit=50`
`GET /machines/{id}/work-orders?limit=50`
`GET /machines/{id}/kpi?from=&to=&granularity=day|week|month`
`GET /machines/{id}/pareto?dim=failure_mode|technician|shift`
`GET /machines/{id}/repeat-failures?window_days=30`
`GET /machines/{id}/infant-mortality?hours=72`
`GET /machines/{id}/reliability`  — MTBF, MTTR, availability, score

**Line & plant analytics**
`GET /lines/{id}/kpi` · `GET /lines/{id}/downtime-trend` · `GET /lines/{id}/pareto`
`GET /plants/{id}/rankings?dim=machine|line|technician&metric=downtime|mttr|mtbf|criticality`

**Timeline & replay**
`GET /timeline?line=&from=&to=&kinds=` — paginated event stream
`GET /timeline/replay?line=&from=&to=` — compact frames for playback
`GET /timeline/snapshot?at=…` — machine states at instant

**Notifications**
`GET /notifications` · `POST /notifications/{id}/read` · `POST /notifications/read-all`

**Audit**
`GET /audit?entity_type=&entity_id=&actor=` (admin)

**Reports**
`POST /reports/generate` `{ type: daily|weekly|monthly|machine|line|technician|reliability|downtime, scope, from, to, format: pdf|xlsx }`
→ `{ report_id, status }` (async) · `GET /reports/{id}` · `GET /reports/{id}/download`

**Imports**
`POST /imports/breakdowns/dry-run` (multipart Excel) — returns diff & validation
`POST /imports/breakdowns/commit` — applies mapped rows
`GET  /imports/history`

### 6.3 Error model

```json
{ "ok": false, "error": {
    "code": "WO_INVALID_TRANSITION",
    "message": "Cannot start a work order that is not assigned.",
    "details": { "current_status": "open", "required": ["assigned"] } } }
```

Machine-readable codes let the UI show contextual guidance. Standard families:
`AUTH_*`, `RBAC_*`, `VALIDATION_*`, `WO_*`, `BD_*`, `IMPORT_*`, `RUNTIME_*`, `RATE_LIMIT`, `NOT_FOUND`, `CONFLICT`.

### 6.4 Cross-cutting

- **Audit interceptor** wraps every mutating route; writes before/after diff to `audit_logs`.
- **Timeline emitter** — services emit `timeline_events` + push to WS hub in one atomic step (Mongo transaction on replica-set; best-effort otherwise with an outbox pattern in v2).
- **Availability-not-configured guard** — analytics endpoints return the literal string `"Availability Not Configured"` in the affected field rather than a fabricated number.

---

## 7. WebSocket Architecture

### 7.1 Endpoint

`GET /api/ws?token=<jwt>` (upgrade). Token is validated on connect; connection is closed with code `4401` if invalid.

### 7.2 Client protocol

**Client → server**
```json
{ "op": "subscribe",   "channels": ["plant:<id>", "line:<id>", "user:<self>"] }
{ "op": "unsubscribe", "channels": [...] }
{ "op": "ping" }
```

**Server → client**
```json
{ "type": "event", "channel": "line:PC21",
  "event": "machine.status_changed",
  "at": "2026-02-11T09:12:34Z",
  "payload": { "machine_id": "...", "code": "FRY01", "status": "failed",
               "breakdown_id": "...", "severity": "high" } }

{ "type": "event", "channel": "user:<id>",
  "event": "wo.assigned",
  "payload": { "wo_id":"...", "wo_no":"WO-2026-00042", "machine":"FRY01" } }
```

**Event catalogue**
| Channel | Event | Trigger |
|---|---|---|
| `line:{id}` | `machine.status_changed` | any status transition |
| `line:{id}` | `breakdown.created` | new breakdown |
| `line:{id}` | `breakdown.closed` | resolution/close |
| `line:{id}` | `wo.assigned` / `wo.started` / `wo.completed` / `wo.closed` | WO transitions |
| `line:{id}` | `kpi.updated` | after batch recompute |
| `user:{id}` | `notification.new` | targeted |
| `plant:{id}` | `alert.raised` | repeat failure / infant mortality / threshold |
| `plant:{id}` | `import.completed` | Excel import finished |
| `system` | `heartbeat` | 20 s |

### 7.3 Server implementation

- `ws_hub.py` manages `dict[channel → set[WebSocket]]` + `dict[WebSocket → set[channel]]`.
- `broadcast(channel, event, payload)` is `await`-safe and drops dead sockets.
- Heartbeat every 20 s; idle timeout 60 s; auto-reconnect on client with exponential backoff (1s → max 30s).
- **Backpressure**: per-socket send queue with 100-message cap; overflow drops oldest and emits `stream.lag`.
- **Auth refresh**: on JWT near-expiry, server sends `auth.refresh_required`; client hits `/auth/refresh` and reconnects.
- **Scale-out**: hub is behind a `PubSub` interface. Default = in-process. Redis adapter (`REDIS_URL`) can be enabled without frontend change.

### 7.4 Live-data contract with UI

- Twin listens on `line:{activeLineId}` and mutates a local `machineStatusMap`.
- KPI strip listens on same channel for `kpi.updated` and refreshes cards.
- Alert feed listens on `plant:{id}` and `user:{id}`.
- Reconnect on tab focus if socket closed.

---

## 8. Reliability Engine Design

### 8.1 Inputs

- `breakdowns` (start/end, machine, line, type)
- `work_orders` + `repair_events` (accurate repair intervals)
- `runtime_logs` / `availability_config` (planned runtime)
- `settings` (thresholds, weights, windows)
- Exclusion: any machine with `is_packing=true` is skipped everywhere.

### 8.2 Core formulas (exact, never fabricated)

```
MTTR (machine, window)  = Σ repair_time_seconds(WO closed in window)
                        / count(WO closed in window)

MTBF (machine, window)  = operating_time_seconds(window)
                        / count(failures in window)
    where operating_time = planned_runtime − downtime
    (downtime = Σ breakdown.duration_seconds in window)

Availability (scope, window)
                        = (planned_runtime − downtime) / planned_runtime
    → returns literal "Availability Not Configured" if planned_runtime is unknown
```

All values reported with sample size `n` so the UI can show confidence.

### 8.3 Detectors

**Repeat failure**
- Same machine + same `failure_mode_id` (or fuzzy match on description via trigram) within `repeat_failure_window_days` (default 30).
- Trigger: on breakdown.created. Raises alert + timeline event.

**Infant mortality**
- Breakdown occurs within `infant_mortality_hours` (default 72) *after* a WO closed on the same machine (i.e., ineffective repair).
- Trigger: on breakdown.created; compare to last closed WO on machine.

**Downtime threshold**
- Rolling downtime for machine or line exceeds configured minutes per shift/day.
- Trigger: recompute job (5 min) + on WO close.

**Ineffective repair**
- Same technician closes ≥ 2 WOs on same machine in `X` days, with a new failure ≤ `infant_mortality_hours` later.

### 8.4 Rankings & Pareto

- **Failure Pareto**: group breakdowns by dimension (`failure_mode`, `machine`, `technician`, `shift`), sort by count and by cumulative downtime.
- **Machine reliability score** (0–100):
  `0.4·norm(MTBF) + 0.3·norm(1/MTTR) + 0.3·norm(availability)` — dimensions normalised across peer machines on same line.
- **Criticality score** (`criticality_computed`):
  `w_freq·f_norm + w_downtime·d_norm + w_mttr·mttr_norm + w_safety·safety + w_business·business_weight`
  Weights live in `settings.criticality_weights`, defaults: `0.25/0.30/0.20/0.15/0.10`.
  Admin override via `machines.criticality_manual`.
- **Composite criticality** = max(manual, computed) — with which one used explicitly displayed.

### 8.5 Compute strategy

- **On-write** (fast path): each breakdown/WO transition updates `machine_status` + writes an event.
- **Aggregations** (slow path): APScheduler job every 5 min recomputes KPIs per machine/line for the last 24 h / 7 d / 30 d windows and stores results in a `kpi_cache` collection with `{scope, window, values, computed_at}`. UI reads cache; ad-hoc queries fall through to live aggregation with Mongo aggregation pipelines.
- **Ad-hoc analytics** use Mongo `$group / $lookup / $bucket` pipelines optimised by the indexes in §2.7.
- **Backfill on Excel import** — reliability engine re-runs for affected machines only.

### 8.6 Data-quality safeguards

- Never invent timestamps. If Excel row lacks start/end, breakdown is stored with `duration_seconds=null` and excluded from MTTR/MTBF sums (still visible in history).
- The UI displays "n/a" for windows with zero failures and shows the sample size for every KPI.
- Reliability engine unit tests will assert formula behaviour on curated fixtures before any UI ships.

---

*(continued in `03_DIGITAL_TWIN_DEPLOYMENT.md`.)*
