import React, { useState } from "react";
import { api, formatApiError } from "../../lib/api";

/**
 * Bulk Runtime CSV Upload — backfill calendar / dark / run-time hours
 * for many lines / dates in one shot.
 *
 * CSV columns (case-insensitive):
 *   line_code, date, calendar_hours, dark_hours, run_time_hours, notes
 */
export default function RuntimeImportPage() {
  const [file, setFile] = useState(null);
  const [dry, setDry] = useState(null);
  const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => { setDry(null); setCommitted(null); setErr(""); };

  const downloadTemplate = async () => {
    try {
      const r = await api.get("/runtime/bulk-import/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "runtime_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    }
  };

  const runDry = async () => {
    if (!file) return;
    setBusy(true); reset();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/runtime/bulk-import/dry-run", fd,
        { headers: { "Content-Type": "multipart/form-data" } });
      setDry(r.data.data);
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const runCommit = async () => {
    if (!file) return;
    setBusy(true); setErr(""); setCommitted(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/runtime/bulk-import/commit", fd,
        { headers: { "Content-Type": "multipart/form-data" } });
      setCommitted(r.data.data);
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="panel">
        <div className="panel-hd"><span>BULK RUNTIME IMPORT · CSV</span></div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[10px] text-mute mono leading-relaxed">
            Columns: <span className="text-data">line_code, department, date, calendar_hours, dark_hours, run_time_hours, notes</span><br />
            <span className="text-mute">department</span> is optional — required only when a line code exists in multiple departments (e.g. PC21).<br />
            Existing entries (same line + date) will be <span className="text-warn">UPDATED</span>. New entries will be inserted.<br />
            date accepts <span className="text-data">YYYY-MM-DD</span>, <span className="text-data">DD-MM-YYYY</span>, or <span className="text-data">DD/MM/YYYY</span>.
          </div>

          <button
            className="btn"
            onClick={downloadTemplate}
            data-testid="rt-imp-template"
            style={{ alignSelf: "flex-start", padding: "4px 12px" }}
          >
            DOWNLOAD CSV TEMPLATE
          </button>

          <input
            type="file"
            accept=".csv,text/csv"
            className="text-dim"
            data-testid="rt-imp-file"
            onChange={(e) => { setFile(e.target.files[0]); reset(); }}
          />

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={runDry}
                    disabled={!file || busy} data-testid="rt-imp-dry">
              {busy ? "…" : "DRY RUN"}
            </button>
            <button className="btn btn-danger" onClick={runCommit}
                    disabled={!file || busy || !dry || dry.error_count > 0}
                    data-testid="rt-imp-commit"
                    title={dry?.error_count > 0 ? "Fix errors before committing" : ""}>
              {busy ? "…" : "COMMIT"}
            </button>
          </div>
          {err && <div className="chip chip-danger" data-testid="rt-imp-error">{err}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>RESULTS</span></div>
        <div className="p-4 mono text-sm text-dim" data-testid="rt-imp-results">
          {!dry && !committed && (
            <div className="text-mute">
              Select a CSV file, then click DRY RUN to preview, then COMMIT to apply.
            </div>
          )}

          {dry && !committed && (
            <div className="flex flex-col gap-1">
              <div>Rows in file: <span className="text-white" data-testid="rt-imp-total">{dry.total_rows}</span></div>
              <div>Valid rows: <span className="text-ok" data-testid="rt-imp-valid">{dry.valid_rows}</span></div>
              <div>Will insert: <span className="text-ok">{dry.would_insert}</span></div>
              <div>Will update (existing): <span className="text-warn">{dry.would_update}</span></div>
              <div>Errors: <span className="text-danger" data-testid="rt-imp-errcount">{dry.error_count}</span></div>
              {dry.duplicates_in_file?.length > 0 && (
                <div>Duplicate line+date in file: <span className="text-warn">{dry.duplicates_in_file.length}</span></div>
              )}
              {dry.errors?.length > 0 && (
                <div className="mt-3">
                  <div className="text-mute text-xs">First errors:</div>
                  <ul className="text-xs mt-1" style={{ maxHeight: 220, overflowY: "auto" }}>
                    {dry.errors.map((e, i) => (
                      <li key={i} data-testid={`rt-imp-err-${i}`}>
                        · Row {e.row} [{e.line_code || "?"} / {e.date || "?"}] — {e.errors.join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dry.sample?.length > 0 && (
                <div className="mt-3">
                  <div className="text-mute text-xs">Sample rows:</div>
                  <table className="tbl mt-1" style={{ fontSize: 11 }}>
                    <thead><tr><th>Line</th><th>Date</th><th>Cal</th><th>Dark</th><th>Run</th></tr></thead>
                    <tbody>
                      {dry.sample.map((s, i) => (
                        <tr key={i}>
                          <td className="mono">{s.line_code}</td>
                          <td className="mono">{s.date}</td>
                          <td className="mono">{s.calendar_hours}</td>
                          <td className="mono">{s.dark_hours}</td>
                          <td className="mono">{s.run_time_hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {committed && (
            <div className="flex flex-col gap-1">
              <div className="chip chip-ok mb-2" data-testid="rt-imp-committed">COMMITTED</div>
              <div>Inserted: <span className="text-ok" data-testid="rt-imp-inserted">{committed.inserted}</span></div>
              <div>Updated: <span className="text-warn" data-testid="rt-imp-updated">{committed.updated}</span></div>
              <div>Skipped (errors): <span className="text-danger">{committed.skipped_errors}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
