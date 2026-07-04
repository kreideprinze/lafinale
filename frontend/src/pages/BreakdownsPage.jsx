import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtAgo, fmtDateTime, fmtDuration } from "../lib/format";
import { live } from "../lib/ws";
import { useNavigate } from "react-router-dom";
import { useFilters } from "../contexts/FilterContext";

export default function BreakdownsPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("all");
  const f = useFilters();
  const nav = useNavigate();

  const load = async () => {
    const p = new URLSearchParams();
    if (f.line_id) p.set("line_id", f.line_id);
    if (f.machine_id) p.set("machine_id", f.machine_id);
    if (f.failure_mode_id) p.set("failure_mode_id", f.failure_mode_id);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (status !== "all") p.set("status", status);
    const r = await api.get(`/breakdowns?${p}`);
    setRows(r.data.data);
  };

  useEffect(() => { load(); }, [status, f.line_id, f.machine_id, f.failure_mode_id, f.from, f.to]);
  useEffect(() => {
    const off = live.onEvent((m) => {
      if (m?.type === "event" && (m.event === "breakdown.created" || m.event === "breakdown.closed")) load();
    });
    return off;
  }, [status, f.line_id, f.machine_id, f.failure_mode_id, f.from, f.to]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="mono text-lg tracking-[0.2em]">
          BREAKDOWNS
          <span className="text-mute text-xs ml-3">· {rows.length} records</span>
        </h1>
        <div className="flex gap-2">
          <select className="field mono" style={{ width: 150 }} value={status} data-testid="bd-flt-status"
            onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>
      <div className="panel" data-testid="bd-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Ticket</th><th>Started</th><th>Duration</th><th>Machine</th><th>Type</th>
              <th>Severity</th><th>Status</th><th>Description</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-mute text-center py-8">No breakdowns.</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.id} data-testid={`bd-row-${b.ticket_no}`}>
                <td className="mono text-data">{b.ticket_no}</td>
                <td className="text-dim">{fmtDateTime(b.breakdown_start_ts)}</td>
                <td className="mono">{fmtDuration(b.duration_seconds)}</td>
                <td className="mono">{b.equipment_text}</td>
                <td className="mono">{b.breakdown_type}</td>
                <td className={`mono ${b.severity === "critical" ? "text-danger" : b.severity === "high" ? "text-warn" : ""}`}>{b.severity}</td>
                <td><span className={`chip ${b.status === "closed" ? "chip-ok" : "chip-warn"}`}>{b.status}</span></td>
                <td className="text-dim" style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.description}
                </td>
                <td>
                  {b.work_order_id && (
                    <button className="btn" style={{ padding: "4px 10px" }}
                      onClick={() => nav(`/work-orders/${b.work_order_id}`)}
                      data-testid={`bd-open-${b.ticket_no}`}>WO</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
