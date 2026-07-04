import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { live } from "../lib/ws";
import { fmtDateTime, fmtDuration, fmtAgo } from "../lib/format";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useFilters } from "../contexts/FilterContext";

const TABS = [
  { key: "me", label: "My Queue" },
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
];

const STATUS_COLOR = {
  open: "chip-info", assigned: "chip-warn", in_progress: "chip-warn",
  awaiting_parts: "chip-warn", completed: "chip-info", closed: "",
  cancelled: "",
};

export default function WorkOrderQueuePage() {
  const { user } = useAuth();
  const f = useFilters();
  const [tab, setTab] = useState(user?.role === "technician" ? "me" : "open");
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab === "me") params.set("assigned_to", "me");
    else if (tab === "open") params.set("status", "open");
    if (f.line_id) params.set("line_id", f.line_id);
    if (f.machine_id) params.set("machine_id", f.machine_id);
    if (f.technician_id && tab !== "me") params.set("assigned_to", f.technician_id);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    const r = await api.get(`/work-orders?${params}`);
    setRows(r.data.data);
  }, [tab, f.line_id, f.machine_id, f.technician_id, f.from, f.to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off = live.onEvent((m) => {
      if (m?.type === "event" && (m.event.startsWith("wo.") || m.event.startsWith("breakdown."))) load();
    });
    return off;
  }, [load]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="mono text-lg tracking-[0.2em]">WORK ORDERS</h1>
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button key={t.key} data-testid={`wo-tab-${t.key}`}
              className="btn"
              style={{
                borderColor: tab === t.key ? "var(--data)" : "var(--border-strong)",
                color: tab === t.key ? "var(--data)" : "var(--text-dim)",
                marginLeft: 0,
              }}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel" data-testid="wo-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>WO No</th><th>Status</th><th>Priority</th><th>Machine</th>
              <th>Line</th><th>Created</th><th>Assigned</th><th>Repair Time</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-mute text-center py-8">No work orders</td></tr>
            )}
            {rows.map((w) => (
              <tr key={w.id} data-testid={`wo-row-${w.wo_no}`}>
                <td className="mono">{w.wo_no}</td>
                <td><span className={`chip ${STATUS_COLOR[w.status] || ""}`}>{w.status}</span></td>
                <td className="mono">{w.priority}</td>
                <td className="mono">{w.machine_id?.slice(0, 6)}</td>
                <td className="mono">{w.line_id?.slice(0, 6)}</td>
                <td className="text-dim">{fmtAgo(w.created_at)}</td>
                <td className="text-dim">{w.assigned_to ? "yes" : "—"}</td>
                <td className="mono">{fmtDuration(w.repair_time_seconds)}</td>
                <td>
                  <Link className="btn" style={{ padding: "4px 10px" }}
                    data-testid={`wo-open-${w.wo_no}`}
                    to={`/work-orders/${w.id}`}>OPEN</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
