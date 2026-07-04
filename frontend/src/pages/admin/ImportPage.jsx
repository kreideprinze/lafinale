import React, { useState } from "react";
import { api, formatApiError } from "../../lib/api";

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [dry, setDry] = useState(null);
  const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const runDry = async () => {
    if (!file) return;
    setBusy(true); setErr(""); setDry(null); setCommitted(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/imports/breakdowns/dry-run", fd,
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
      const r = await api.post("/imports/breakdowns/commit", fd,
        { headers: { "Content-Type": "multipart/form-data" } });
      setCommitted(r.data.data);
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="panel">
        <div className="panel-hd"><span>IMPORT LEGACY EXCEL</span></div>
        <div className="p-4 flex flex-col gap-3">
          <input type="file" accept=".xlsx" className="text-dim" data-testid="imp-file"
            onChange={(e) => setFile(e.target.files[0])} />
          <div className="text-[10px] text-mute mono">
            Expected: single sheet with headers matching maintenance breakdown workbook.
            Machine matching is fuzzy (name/code); unmatched rows are surfaced below.
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={runDry} disabled={!file || busy} data-testid="imp-dry">
              {busy ? "…" : "DRY RUN"}
            </button>
            <button className="btn btn-danger" onClick={runCommit} disabled={!file || busy} data-testid="imp-commit">
              {busy ? "…" : "COMMIT"}
            </button>
          </div>
          {err && <div className="chip chip-danger" data-testid="imp-error">{err}</div>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-hd"><span>RESULTS</span></div>
        <div className="p-4 mono text-sm text-dim" data-testid="imp-results">
          {!dry && !committed && <div className="text-mute">Run a dry run first, then commit.</div>}
          {dry && !committed && (
            <div>
              <div>Rows parsed: <span className="text-white">{dry.total_rows}</span></div>
              <div>Matched machines: <span className="text-ok">{dry.matched}</span></div>
              <div>Unmatched: <span className="text-warn">{dry.unmatched}</span></div>
              <div>Duplicates: <span className="text-mute">{dry.duplicates}</span></div>
              {dry.unmatched_examples?.length > 0 && (
                <div className="mt-3">
                  <div className="text-mute text-xs">Sample unmatched:</div>
                  <ul className="text-xs mt-1">
                    {dry.unmatched_examples.map((u, i) => (
                      <li key={i}>· {u.equipment || "(no equip)"} — {u.area || ""}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {committed && (
            <div>
              <div className="chip chip-ok mb-2">COMMITTED</div>
              <div>Inserted: <span className="text-ok">{committed.inserted}</span></div>
              <div>Skipped duplicates: <span className="text-mute">{committed.skipped}</span></div>
              <div>Unmatched (skipped): <span className="text-warn">{committed.unmatched}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
