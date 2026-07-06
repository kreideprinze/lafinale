import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";

/**
 * Admin > System — data operations for demo/prod lifecycle.
 *
 * Actions:
 *   • Seed Demo Data — populates demo plant/lines/machines/failure modes
 *   • Wipe Transactional — deletes breakdowns, WOs, timeline, notifications
 *   • Remove Demo Data — full wipe: transactional + master (machines/lines/plant)
 *     Users and settings are always preserved.
 *
 * All destructive actions require typing "CONFIRM" to proceed.
 */
export default function SystemPage() {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [pendingAction, setPendingAction] = useState(null); // "wipe-tx" | "wipe-demo" | "seed"

  const load = async () => {
    try {
      const r = await api.get("/admin/data-summary");
      setSummary(r.data.data);
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    }
  };

  useEffect(() => { load(); }, []);

  const doAction = async () => {
    setBusy(true); setErr(""); setResult(null);
    try {
      let r;
      if (pendingAction === "wipe-tx") r = await api.post("/admin/wipe-transactional");
      else if (pendingAction === "wipe-demo") r = await api.post("/admin/wipe-demo");
      else if (pendingAction === "seed") r = await api.post("/admin/seed-demo");
      setResult({ action: pendingAction, data: r.data.data });
      setPendingAction(null);
      setConfirmText("");
      await load();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const need = (a) => { setPendingAction(a); setConfirmText(""); setErr(""); setResult(null); };

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="panel">
        <div className="panel-hd"><span>DATABASE SUMMARY</span></div>
        <div className="p-5 mono text-sm text-dim" data-testid="system-summary">
          {!summary && <div className="text-mute">Loading…</div>}
          {summary && (
            <table className="tbl" style={{ fontSize: 11 }}>
              <thead><tr><th>Collection</th><th style={{ textAlign: "right" }}>Documents</th></tr></thead>
              <tbody>
                {Object.entries(summary).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono text-white">{k}</td>
                    <td className="mono text-data" style={{ textAlign: "right" }} data-testid={`sys-cnt-${k}`}>
                      {v.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>DATA OPERATIONS</span></div>
        <div className="p-5 flex flex-col gap-4">
          <ActionRow
            title="SEED DEMO DATA"
            desc="Populate the demo plant with 3 departments, lines, machines, failure modes. Safe to re-run — creates only missing records."
            variant="primary"
            testid="sys-btn-seed"
            onClick={() => need("seed")}
          />
          <ActionRow
            title="WIPE TRANSACTIONAL DATA"
            desc="Delete all breakdowns, work orders, timeline events, notifications, audit logs, and runtime logs. Keeps machines, lines, users, settings."
            variant="warn"
            testid="sys-btn-wipe-tx"
            onClick={() => need("wipe-tx")}
          />
          <ActionRow
            title="REMOVE DEMO DATA"
            desc="Full nuke: transactional + master data (machines, lines, plant, failure modes). Keeps users + branding. Use this to convert a demo install into a production install."
            variant="danger"
            testid="sys-btn-wipe-demo"
            onClick={() => need("wipe-demo")}
          />
          {err && <div className="chip chip-danger self-start" data-testid="sys-err">{err}</div>}
          {result && (
            <div className="text-[11px] mono text-ok" data-testid="sys-result">
              {result.action === "seed" ? "Demo data seeded." : "Deleted:"}
              {result.action !== "seed" && (
                <ul className="mt-1">
                  {Object.entries(result.data).map(([k, v]) => (
                    <li key={k}>· {k}: <span className="text-warn">{v}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={(e) => e.target === e.currentTarget && setPendingAction(null)}
        >
          <div className="panel" style={{ width: 480 }}>
            <div className="panel-hd">
              <span>CONFIRM · {pendingAction.toUpperCase().replace("-", " ")}</span>
              <button onClick={() => setPendingAction(null)} className="text-mute hover:text-white">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-4 text-sm">
              {pendingAction === "seed" ? (
                <div className="text-dim">This will create demo data. Existing records will not be duplicated.</div>
              ) : (
                <div className="text-danger">
                  This action is <strong>IRREVERSIBLE</strong>.  Type <span className="mono text-white">CONFIRM</span> below to proceed.
                </div>
              )}
              {pendingAction !== "seed" && (
                <input
                  className="field mono"
                  data-testid="sys-confirm-input"
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type CONFIRM"
                />
              )}
              <div className="flex gap-2">
                <button className="btn" onClick={() => setPendingAction(null)} data-testid="sys-confirm-cancel">CANCEL</button>
                <button
                  className={`btn ${pendingAction === "seed" ? "btn-primary" : "btn-danger"}`}
                  onClick={doAction}
                  disabled={busy || (pendingAction !== "seed" && confirmText !== "CONFIRM")}
                  data-testid="sys-confirm-run"
                >
                  {busy ? "…" : (pendingAction === "seed" ? "SEED" : "PROCEED")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionRow({ title, desc, variant, testid, onClick }) {
  const cls = variant === "danger" ? "btn-danger"
            : variant === "warn"   ? "btn-warn"
            :                        "btn-primary";
  return (
    <div className="p-3" style={{ border: "1px solid var(--border-strong)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="mono text-xs tracking-[0.15em] text-white">{title}</div>
          <div className="text-[11px] text-mute mt-1 leading-relaxed">{desc}</div>
        </div>
        <button className={`btn ${cls}`} onClick={onClick} data-testid={testid}>RUN</button>
      </div>
    </div>
  );
}
