import React, { useEffect, useState, useRef } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const TYPES = [
  { v: "mechanical", label: "MECHANICAL" },
  { v: "electrical", label: "ELECTRICAL" },
  { v: "control",    label: "CONTROL (PLC)" },
];

const DEPT_LABEL = { process: "Process", packaging: "Packaging", utilities: "Utilities" };

/**
 * Quick breakdown reporting dialog — operator-first.
 *
 * Behaviour:
 *  • If a machine was preselected (right-click / double-click / node button), the
 *    Department / Area / Equipment are auto-captured and read-only.
 *  • If no machine preselected (from the "NEW BREAKDOWN" button), user picks
 *    department → area → machine first.
 *  • Reporter Name is a mandatory free-text field. No login required.
 *  • Auto Create Work Order is enabled by default.
 *  • Uses public endpoint /api/breakdowns/report when guest, /api/breakdowns
 *    when the user is authenticated (so the audit trail records the operator
 *    account when a technician submits on behalf).
 */
export default function QuickBreakdownDialog({ open, onClose, activeLine, preselectMachine, onCreated }) {
  const { user } = useAuth();

  // Manual picker state (used when nothing is preselected)
  const [department, setDepartment] = useState("process");
  const [lines, setLines] = useState([]);
  const [lineId, setLineId] = useState(null);
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState(null);

  // Form state
  const [reporter, setReporter] = useState("");
  const [type, setType] = useState("mechanical");
  const [desc, setDesc] = useState("");
  const [autoWO, setAutoWO] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ticket, setTicket] = useState(null);
  const reporterRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const initialDept = preselectMachine?.department || activeLine?.department || "process";
    setDepartment(initialDept);
    setLineId(preselectMachine?.line_id || activeLine?.id || null);
    setMachineId(preselectMachine?.id || null);
    setType("mechanical");
    setDesc("");
    setReporter("");
    setAutoWO(true);
    setErr("");
    setTicket(null);
    setTimeout(() => reporterRef.current?.focus(), 100);
  }, [open, preselectMachine?.id, activeLine?.id, user?.full_name]);

  // Load lines & machines only when manual picker is needed
  useEffect(() => {
    if (!open || preselectMachine) return;
    api.get(`/lines?department=${department}`).then((r) => {
      setLines(r.data.data);
      if (!r.data.data.find((l) => l.id === lineId)) {
        setLineId(r.data.data[0]?.id || null);
      }
    });
  }, [department, open, preselectMachine]);

  useEffect(() => {
    if (!open || preselectMachine || !lineId) return;
    api.get(`/machines?line_id=${lineId}`).then((r) => {
      const list = r.data.data.filter((m) => !m.is_packing);
      setMachines(list);
      if (!list.find((m) => m.id === machineId)) {
        setMachineId(list[0]?.id || null);
      }
    });
  }, [lineId, open, preselectMachine]);

  if (!open) return null;

  const submit = async (e) => {
    e?.preventDefault();
    if (!reporter.trim()) { setErr("Reporter name is required."); reporterRef.current?.focus(); return; }
    if (!machineId) { setErr("Please pick a machine."); return; }
    if (!desc.trim()) { setErr("Remarks are required."); return; }
    setBusy(true); setErr("");
    try {
      // Prefer authenticated endpoint for logged-in techs/admins (so `reported_by` is set);
      // fall back to public endpoint for anonymous operator submissions.
      const endpoint = user ? "/breakdowns" : "/breakdowns/report";
      const body = user
        ? {
            line_id: lineId,
            machine_id: machineId,
            breakdown_type: type,
            description: desc.trim(),
            reporter_name: reporter.trim(),
            auto_create_work_order: autoWO,
          }
        : {
            machine_id: machineId,
            breakdown_type: type,
            description: desc.trim(),
            reporter_name: reporter.trim(),
            auto_create_work_order: autoWO,
          };
      const r = await api.post(endpoint, body);
      setTicket(r.data.data.breakdown);
      onCreated && onCreated();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally {
      setBusy(false);
    }
  };

  const contextDept  = preselectMachine?.department || department;
  const contextArea  = preselectMachine
    ? (lines.find((l) => l.id === preselectMachine.line_id)?.code
        || activeLine?.code
        || preselectMachine.line_id?.slice(0, 6))
    : (lines.find((l) => l.id === lineId)?.code || "");
  const contextEquip = preselectMachine?.name || machines.find((m) => m.id === machineId)?.name || "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="dlg-breakdown"
    >
      <div className="panel" style={{ width: 560, maxHeight: "92vh", overflowY: "auto" }}>
        <div className="panel-hd">
          <span>{ticket ? "BREAKDOWN CREATED" : "REPORT BREAKDOWN"}</span>
          <button onClick={onClose} className="text-mute hover:text-white" data-testid="dlg-close">✕</button>
        </div>

        {ticket ? (
          <div className="p-6 flex flex-col gap-3">
            <div className="chip chip-ok self-start" data-testid="bd-success">CREATED</div>
            <div className="mono text-2xl text-data" data-testid="bd-ticket">{ticket.ticket_no}</div>
            <div className="text-dim text-sm">
              Machine set to <span className="text-danger">FAILED</span>
              {ticket.work_order_id
                ? <> · work order dispatched to technicians.</>
                : <> · no work order created (auto-WO was disabled).</>}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn" onClick={onClose} data-testid="bd-close">CLOSE</button>
              <button className="btn btn-primary" onClick={() => { setTicket(null); setDesc(""); }} data-testid="bd-report-another">
                REPORT ANOTHER
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 flex flex-col gap-4">
            {/* Auto-captured context bar */}
            <div
              className="grid grid-cols-3 gap-2 p-3"
              style={{ border: "1px solid var(--border-strong)", background: "rgba(34,211,238,0.03)" }}
              data-testid="bd-context"
            >
              <ContextField label="Dept"    value={DEPT_LABEL[contextDept] || contextDept || "—"} testid="bd-ctx-dept" />
              <ContextField label="Area"    value={contextArea || "—"} testid="bd-ctx-area" />
              <ContextField label="Equipment" value={contextEquip || "—"} testid="bd-ctx-equipment" />
            </div>

            {/* Manual picker only when nothing was preselected */}
            {!preselectMachine && (
              <div className="flex flex-col gap-3 p-3" style={{ border: "1px dashed var(--border-strong)" }}>
                <div>
                  <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Department</label>
                  <div className="grid grid-cols-3 gap-1 mt-2">
                    {["process", "packaging", "utilities"].map((d) => (
                      <button type="button" key={d} data-testid={`bd-dept-${d}`}
                        className="btn" style={{
                          padding: "6px 4px", fontSize: 10,
                          borderColor: department === d ? "var(--data)" : "var(--border-strong)",
                          color: department === d ? "var(--data)" : "var(--text-dim)",
                        }}
                        onClick={() => setDepartment(d)}>{d.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Area</label>
                  <select className="field mt-2 mono" data-testid="bd-line"
                    value={lineId || ""} onChange={(e) => setLineId(e.target.value)}>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Machine</label>
                  <select className="field mt-2 mono" data-testid="bd-machine"
                    value={machineId || ""} onChange={(e) => setMachineId(e.target.value)}>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} · {m.name}{m.kind === "subsystem" ? " (subsystem)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Reporter Name *</label>
              <input
                ref={reporterRef}
                className="field mt-2 mono"
                data-testid="bd-reporter-name"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                required
                maxLength={80}
              />
            </div>

            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Breakdown Type</label>
              <div className="grid grid-cols-3 gap-1 mt-2">
                {TYPES.map((t) => (
                  <button type="button" key={t.v} data-testid={`bd-type-${t.v}`}
                    className="btn" style={{
                      padding: "8px 6px", fontSize: 10,
                      borderColor: type === t.v ? "var(--data)" : "var(--border-strong)",
                      color: type === t.v ? "var(--data)" : "var(--text-dim)",
                    }}
                    onClick={() => setType(t.v)}>{t.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Remarks *</label>
              <textarea
                className="field mt-2 mono"
                data-testid="bd-desc"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What's happening on the floor?"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-[11px] text-dim mono cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="bd-auto-wo"
                checked={autoWO}
                onChange={(e) => setAutoWO(e.target.checked)}
              />
              <span className="tracking-[0.1em] uppercase">Auto-create Work Order</span>
              <span className="text-mute">— dispatches to maintenance immediately</span>
            </label>

            {err && <div className="chip chip-danger self-start" data-testid="bd-error">{err}</div>}
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={onClose} data-testid="bd-cancel">CANCEL</button>
              <button type="submit" className="btn btn-danger" disabled={busy} data-testid="bd-submit">
                {busy ? "SUBMITTING…" : "SUBMIT BREAKDOWN"}
              </button>
              <span className="text-[10px] text-mute mono self-center ml-auto">&lt; 10 SEC TARGET</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ContextField({ label, value, testid }) {
  return (
    <div>
      <div className="text-[9px] tracking-[0.15em] text-mute uppercase">{label}</div>
      <div className="mono text-xs text-white truncate mt-1" data-testid={testid} title={value}>{value}</div>
    </div>
  );
}
