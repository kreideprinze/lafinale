import React, { useEffect, useState, useMemo, useRef } from "react";
import { api, formatApiError } from "../lib/api";

const TYPES = [
  { v: "mechanical", label: "MECHANICAL" },
  { v: "electrical", label: "ELECTRICAL" },
  { v: "process", label: "PROCESS" },
  { v: "instrumentation", label: "INSTRUMENTATION" },
  { v: "utility", label: "UTILITY" },
  { v: "operator_error", label: "OPERATOR ERROR" },
  { v: "other", label: "OTHER" },
];

const DEPTS = [
  { v: "process",   label: "PROCESS" },
  { v: "packaging", label: "PACKAGING" },
  { v: "utilities", label: "UTILITIES" },
];

export default function QuickBreakdownDialog({ open, onClose, activeLine, preselectMachine, onCreated }) {
  const [department, setDepartment] = useState("process");
  const [lines, setLines] = useState([]);
  const [lineId, setLineId] = useState(null);
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState(null);
  const [type, setType] = useState("mechanical");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ticket, setTicket] = useState(null);
  const descRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const initialDept = preselectMachine?.department || activeLine?.department || "process";
    setDepartment(initialDept);
    setLineId(preselectMachine?.line_id || activeLine?.id || null);
    setMachineId(preselectMachine?.id || null);
    setType("mechanical");
    setDesc("");
    setErr("");
    setTicket(null);
    setTimeout(() => descRef.current?.focus(), 100);
  }, [open, preselectMachine?.id, activeLine?.id]);

  // Load lines when department changes
  useEffect(() => {
    if (!open) return;
    api.get(`/lines?department=${department}`).then((r) => {
      setLines(r.data.data);
      if (!r.data.data.find((l) => l.id === lineId)) {
        setLineId(r.data.data[0]?.id || null);
      }
    });
  }, [department, open]);

  useEffect(() => {
    if (!lineId) { setMachines([]); return; }
    api.get(`/machines?line_id=${lineId}`).then((r) => {
      const list = r.data.data.filter((m) => !m.is_packing);
      setMachines(list);
      if (!preselectMachine && !list.find((m) => m.id === machineId)) {
        setMachineId(list[0]?.id || null);
      }
    });
  }, [lineId]);

  if (!open) return null;

  const submit = async (e) => {
    e?.preventDefault();
    if (!lineId || !machineId || !desc.trim()) {
      setErr("Line, machine and description are required."); return;
    }
    setBusy(true); setErr("");
    try {
      const r = await api.post("/breakdowns", {
        line_id: lineId,
        machine_id: machineId,
        breakdown_type: type,
        description: desc.trim(),
      });
      setTicket(r.data.data.breakdown);
      onCreated && onCreated();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="dlg-breakdown"
    >
      <div className="panel" style={{ width: 560 }}>
        <div className="panel-hd">
          <span>{ticket ? "BREAKDOWN CREATED" : "REPORT BREAKDOWN"}</span>
          <button onClick={onClose} className="text-mute hover:text-white" data-testid="dlg-close">✕</button>
        </div>

        {ticket ? (
          <div className="p-6 flex flex-col gap-3">
            <div className="chip chip-ok self-start" data-testid="bd-success">CREATED</div>
            <div className="mono text-2xl text-data" data-testid="bd-ticket">{ticket.ticket_no}</div>
            <div className="text-dim text-sm">Machine set to <span className="text-danger">FAILED</span> · work order dispatched to technicians.</div>
            <div className="flex gap-2 mt-4">
              <button className="btn" onClick={onClose} data-testid="bd-close">CLOSE</button>
              <button className="btn btn-primary" onClick={() => { setTicket(null); setDesc(""); }} data-testid="bd-report-another">
                REPORT ANOTHER
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 flex flex-col gap-4">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Department</label>
              <div className="grid grid-cols-3 gap-1 mt-2">
                {DEPTS.map((d) => (
                  <button type="button" key={d.v} data-testid={`bd-dept-${d.v}`}
                    className="btn" style={{
                      padding: "6px 4px", fontSize: 10,
                      borderColor: department === d.v ? "var(--data)" : "var(--border-strong)",
                      color: department === d.v ? "var(--data)" : "var(--text-dim)",
                    }}
                    onClick={() => setDepartment(d.v)}>{d.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Area</label>
              <select className="field mt-2 mono" data-testid="bd-line"
                value={lineId || ""} onChange={(e) => setLineId(e.target.value)}>
                {lines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
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
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Breakdown Type</label>
              <div className="grid grid-cols-4 gap-1 mt-2">
                {TYPES.map((t) => (
                  <button type="button" key={t.v} data-testid={`bd-type-${t.v}`}
                    className="btn" style={{
                      padding: "6px 4px", fontSize: 10,
                      borderColor: type === t.v ? "var(--data)" : "var(--border-strong)",
                      color: type === t.v ? "var(--data)" : "var(--text-dim)",
                    }}
                    onClick={() => setType(t.v)}>{t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Description</label>
              <textarea
                ref={descRef}
                className="field mt-2 mono"
                data-testid="bd-desc"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What's happening?"
                required
              />
            </div>
            {err && <div className="chip chip-danger self-start" data-testid="bd-error">{err}</div>}
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={onClose} data-testid="bd-cancel">CANCEL</button>
              <button type="submit" className="btn btn-danger" disabled={busy} data-testid="bd-submit">
                {busy ? "SUBMITTING…" : "SUBMIT BREAKDOWN"}
              </button>
              <span className="text-[10px] text-mute mono self-center ml-auto">&lt; 15 SEC TARGET</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
