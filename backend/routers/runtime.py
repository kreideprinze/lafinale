"""Plant Runtime module — Date / Line / Calendar hrs / Dark hrs / Run time."""
import csv
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from db import get_db
from models import RuntimeUpsertReq, uid, now_utc
from deps import get_current_user, require_admin, write_audit


router = APIRouter(prefix="/api/runtime", tags=["runtime"])


@router.get("")
async def list_runtime(
    line_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(200, le=2000),
    user=Depends(get_current_user),
):
    db = get_db()
    q: dict = {}
    if line_id:
        q["line_id"] = line_id
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        q["date"] = rng
    items = await db.runtime_logs.find(q, {"_id": 0}).sort("date", -1).to_list(limit)
    return {"ok": True, "data": items}


@router.post("")
async def upsert_runtime(req: RuntimeUpsertReq, admin=Depends(require_admin)):
    db = get_db()
    line = await db.production_lines.find_one({"id": req.line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    if req.calendar_hours < 0 or req.dark_hours < 0 or req.run_time_hours < 0:
        raise HTTPException(status_code=400, detail="Hours must be non-negative")
    if req.run_time_hours > req.calendar_hours:
        raise HTTPException(status_code=400, detail={
            "code": "RUNTIME_INVALID",
            "message": "Run time cannot exceed calendar hours"
        })
    now = now_utc().isoformat()
    existing = await db.runtime_logs.find_one({"line_id": req.line_id, "date": req.date}, {"_id": 0})
    if existing:
        await db.runtime_logs.update_one(
            {"line_id": req.line_id, "date": req.date},
            {"$set": {
                "calendar_hours": req.calendar_hours,
                "dark_hours": req.dark_hours,
                "run_time_hours": req.run_time_hours,
                "notes": req.notes,
                "updated_at": now, "updated_by": admin["id"],
            }},
        )
        item = await db.runtime_logs.find_one({"line_id": req.line_id, "date": req.date}, {"_id": 0})
    else:
        item = {
            "id": uid(),
            "line_id": req.line_id, "date": req.date,
            "calendar_hours": req.calendar_hours,
            "dark_hours": req.dark_hours,
            "run_time_hours": req.run_time_hours,
            "notes": req.notes,
            "created_at": now, "updated_at": now,
            "created_by": admin["id"], "updated_by": admin["id"],
        }
        await db.runtime_logs.insert_one(item)
        item.pop("_id", None)
    await write_audit(admin["id"], "runtime.upsert", "runtime_log", item["id"], after=item)
    return {"ok": True, "data": item}


@router.delete("/{runtime_id}")
async def delete_runtime(runtime_id: str, admin=Depends(require_admin)):
    db = get_db()
    r = await db.runtime_logs.delete_one({"id": runtime_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    await write_audit(admin["id"], "runtime.delete", "runtime_log", runtime_id)
    return {"ok": True}



# ---------------- BULK CSV IMPORT ----------------
def _parse_csv_date(v: str) -> Optional[str]:
    """Accept YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY. Return ISO date or None."""
    from datetime import datetime as _dt
    if not v:
        return None
    v = v.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%b-%Y"):
        try:
            return _dt.strptime(v, fmt).date().isoformat()
        except Exception:
            continue
    return None


def _parse_float(v: str) -> Optional[float]:
    try:
        return float(str(v).strip())
    except Exception:
        return None


async def _parse_runtime_csv(file: UploadFile) -> dict:
    """Read CSV, resolve line_code -> line_id, validate rows.

    Expected columns (case-insensitive; some may be blank):
      - line_code (or line, code)
      - date
      - calendar_hours (or calendar)
      - dark_hours (or dark)
      - run_time_hours (or run, runtime)
      - notes (optional)
    """
    db = get_db()
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail={"code": "CSV_EMPTY", "message": "CSV is empty"})
    fieldmap = {(f or "").strip().lower(): f for f in reader.fieldnames}

    def col(*aliases):
        for a in aliases:
            if a in fieldmap:
                return fieldmap[a]
        return None

    col_line = col("line_code", "line", "code")
    col_dept = col("department", "dept")
    col_date = col("date", "day")
    col_cal = col("calendar_hours", "calendar", "cal_hrs", "cal")
    col_dark = col("dark_hours", "dark", "dark_hrs")
    col_run = col("run_time_hours", "run_hours", "run", "runtime", "runtime_hours")
    col_notes = col("notes", "note", "remark", "remarks")

    missing = [n for n, c in (("line_code", col_line), ("date", col_date),
                                ("calendar_hours", col_cal), ("dark_hours", col_dark),
                                ("run_time_hours", col_run)) if c is None]
    if missing:
        raise HTTPException(status_code=400, detail={
            "code": "CSV_MISSING_COLUMNS",
            "message": f"Missing required columns: {', '.join(missing)}",
        })

    # Preload lines for matching
    lines = await db.production_lines.find({}, {"_id": 0}).to_list(2000)
    by_code_only = {}
    by_dept_code = {}
    for ln in lines:
        code = (ln.get("code") or "").strip().lower()
        dept = (ln.get("department") or "").strip().lower()
        by_dept_code[(dept, code)] = ln
        # Track duplicates in code-only map
        if code in by_code_only:
            by_code_only[code] = "AMBIGUOUS"
        else:
            by_code_only[code] = ln

    parsed = []
    errors = []
    for idx, row in enumerate(reader, start=2):  # start=2 for spreadsheet-style row numbers
        code_raw = (row.get(col_line) or "").strip()
        dept_raw = (row.get(col_dept) or "").strip() if col_dept else ""
        date_raw = (row.get(col_date) or "").strip()
        cal_raw = row.get(col_cal)
        dark_raw = row.get(col_dark)
        run_raw = row.get(col_run)
        notes = (row.get(col_notes) if col_notes else None)

        if not any([code_raw, date_raw, cal_raw, dark_raw, run_raw]):
            continue  # skip blank rows

        # Resolve line
        line = None
        if dept_raw:
            line = by_dept_code.get((dept_raw.lower(), code_raw.lower()))
        else:
            hit = by_code_only.get(code_raw.lower())
            if hit == "AMBIGUOUS":
                line = "AMBIGUOUS"
            else:
                line = hit

        date_iso = _parse_csv_date(date_raw)
        cal = _parse_float(cal_raw)
        dark = _parse_float(dark_raw)
        run = _parse_float(run_raw)

        row_errs = []
        if line == "AMBIGUOUS":
            row_errs.append(f"line_code '{code_raw}' exists in multiple departments — add a 'department' column")
            line = None
        elif not line:
            row_errs.append(f"unknown line_code '{code_raw}'"
                              + (f" in department '{dept_raw}'" if dept_raw else ""))
        if not date_iso:
            row_errs.append(f"invalid date '{date_raw}'")
        if cal is None or cal < 0:
            row_errs.append("calendar_hours invalid")
        if dark is None or dark < 0:
            row_errs.append("dark_hours invalid")
        if run is None or run < 0:
            row_errs.append("run_time_hours invalid")
        if cal is not None and run is not None and run > cal:
            row_errs.append("run_time > calendar")

        if row_errs:
            errors.append({"row": idx, "line_code": code_raw, "date": date_raw,
                             "errors": row_errs})
            continue

        parsed.append({
            "row": idx,
            "line_id": line["id"],
            "line_code": line.get("code"),
            "department": line.get("department"),
            "date": date_iso,
            "calendar_hours": cal,
            "dark_hours": dark,
            "run_time_hours": run,
            "notes": (notes.strip() if isinstance(notes, str) and notes.strip() else None),
        })

    # detect duplicate (line_id, date) pairs in file
    seen = {}
    for p in parsed:
        k = (p["line_id"], p["date"])
        seen[k] = seen.get(k, 0) + 1
    dup_pairs = [f"{k[1]}/{k[0][:6]}" for k, v in seen.items() if v > 1]

    return {"parsed": parsed, "errors": errors, "duplicates_in_file": dup_pairs}


@router.post("/bulk-import/dry-run")
async def bulk_runtime_dry_run(file: UploadFile = File(...), admin=Depends(require_admin)):
    res = await _parse_runtime_csv(file)
    db = get_db()
    would_update = 0
    would_insert = 0
    for p in res["parsed"]:
        existing = await db.runtime_logs.find_one({"line_id": p["line_id"], "date": p["date"]}, {"_id": 0})
        if existing:
            would_update += 1
        else:
            would_insert += 1
    return {"ok": True, "data": {
        "total_rows": len(res["parsed"]) + len(res["errors"]),
        "valid_rows": len(res["parsed"]),
        "errors": res["errors"][:50],
        "error_count": len(res["errors"]),
        "duplicates_in_file": res["duplicates_in_file"],
        "would_insert": would_insert,
        "would_update": would_update,
        "sample": res["parsed"][:5],
    }}


@router.post("/bulk-import/commit")
async def bulk_runtime_commit(file: UploadFile = File(...), admin=Depends(require_admin)):
    res = await _parse_runtime_csv(file)
    db = get_db()
    now = now_utc().isoformat()
    inserted = 0
    updated = 0
    for p in res["parsed"]:
        existing = await db.runtime_logs.find_one({"line_id": p["line_id"], "date": p["date"]}, {"_id": 0})
        if existing:
            await db.runtime_logs.update_one(
                {"line_id": p["line_id"], "date": p["date"]},
                {"$set": {
                    "calendar_hours": p["calendar_hours"],
                    "dark_hours": p["dark_hours"],
                    "run_time_hours": p["run_time_hours"],
                    "notes": p["notes"],
                    "updated_at": now, "updated_by": admin["id"],
                }},
            )
            updated += 1
        else:
            doc = {
                "id": uid(),
                "line_id": p["line_id"], "date": p["date"],
                "calendar_hours": p["calendar_hours"],
                "dark_hours": p["dark_hours"],
                "run_time_hours": p["run_time_hours"],
                "notes": p["notes"],
                "created_at": now, "updated_at": now,
                "created_by": admin["id"], "updated_by": admin["id"],
            }
            await db.runtime_logs.insert_one(doc)
            inserted += 1
    await write_audit(admin["id"], "runtime.bulk_import", "runtime_log", "bulk",
                      after={"inserted": inserted, "updated": updated})
    return {"ok": True, "data": {
        "inserted": inserted,
        "updated": updated,
        "skipped_errors": len(res["errors"]),
        "errors": res["errors"][:50],
    }}


@router.get("/bulk-import/template")
async def bulk_runtime_template(user=Depends(get_current_user)):
    """Return CSV template header + example row for the user to download."""
    csv_body = (
        "line_code,department,date,calendar_hours,dark_hours,run_time_hours,notes\n"
        "PC21,process,2026-01-15,24,2,20,Example row — delete before import\n"
    )
    from fastapi.responses import Response
    return Response(content=csv_body, media_type="text/csv",
                     headers={"Content-Disposition": "attachment; filename=runtime_template.csv"})
