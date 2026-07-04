import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtDateTime, fmtDuration, statusDot } from "../lib/format";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

export default function MachineDetailPage() {
  const { id } = useParams();
  const [machine, setMachine] = useState(null);
  const [kpi, setKpi] = useState(null);
  const [pareto, setPareto] = useState([]);
  const [history, setHistory] = useState({ breakdowns: [], work_orders: [] });

  useEffect(() => {
    api.get(`/machines/${id}`).then((r) => setMachine(r.data.data));
    api.get(`/analytics/machine/${id}/kpi`).then((r) => setKpi(r.data.data));
    api.get(`/analytics/machine/${id}/pareto?dim=failure_mode`).then((r) => setPareto(r.data.data));
    api.get(`/analytics/machine/${id}/history?limit=25`).then((r) => setHistory(r.data.data));
  }, [id]);

  if (!machine) return <div className="p-6 text-mute mono">Loading…</div>;

  const paretoRows = pareto.slice(0, 8).map((p) => ({
    name: (p.label || "").slice(0, 18),
    count: p.count,
    downtime_min: Math.round(p.downtime_seconds / 60),
  }));

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-mute text-xs mono">{machine.code}</div>
          <h1 className="text-2xl font-normal">{machine.name}</h1>
          <div className="text-dim text-sm mono mt-1">
            {machine.kind?.toUpperCase()} · {machine.machine_type?.toUpperCase()}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={statusDot(machine.status)} />
          <span className="mono text-sm">{(machine.status || "unknown").toUpperCase()}</span>
        </div>
      </div>

      {/* KPI Cards */}
      {machine.is_packing ? (
        <div className="panel">
          <div className="p-6 text-mute mono">
            This is a terminator / packing endpoint. MTTR, MTBF, and Availability are not tracked.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          <div className="kpi"><div className="label">Availability</div>
            <div className="value" data-testid="md-availability">{kpi?.availability_display || "—"}</div>
            <div className="sub">30d</div></div>
          <div className="kpi"><div className="label">MTTR</div>
            <div className="value" data-testid="md-mttr">{fmtDuration(kpi?.mttr_seconds)}</div>
            <div className="sub">n={kpi?.n_closed_wo ?? 0}</div></div>
          <div className="kpi"><div className="label">MTBF</div>
            <div className="value" data-testid="md-mtbf">{fmtDuration(kpi?.mtbf_seconds)}</div>
            <div className="sub">n={kpi?.failures ?? 0}</div></div>
          <div className="kpi"><div className="label">Downtime</div>
            <div className="value" data-testid="md-downtime">{fmtDuration(kpi?.downtime_seconds)}</div>
            <div className="sub">30d</div></div>
          <div className="kpi"><div className="label">Failures</div>
            <div className="value" data-testid="md-failures">{kpi?.failures ?? 0}</div>
            <div className="sub">30d</div></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="panel">
          <div className="panel-hd"><span>FAILURE PARETO · 90d</span></div>
          <div className="p-3" style={{ height: 260 }}>
            {paretoRows.length === 0 && <div className="text-mute text-xs">No failures in window.</div>}
            {paretoRows.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paretoRows}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #1f1f1f", color: "#fff" }} />
                  <Bar dataKey="count" fill="#22d3ee" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd"><span>RECENT BREAKDOWNS</span></div>
          <div className="p-0" style={{ maxHeight: 260, overflowY: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Ticket</th><th>Started</th><th>Duration</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {history.breakdowns.length === 0 && (
                  <tr><td colSpan={5} className="text-mute text-center py-6">No breakdowns.</td></tr>
                )}
                {history.breakdowns.map((b) => (
                  <tr key={b.id} data-testid={`md-bd-${b.ticket_no}`}>
                    <td className="mono">{b.ticket_no}</td>
                    <td className="text-dim">{fmtDateTime(b.breakdown_start_ts)}</td>
                    <td className="mono">{fmtDuration(b.duration_seconds)}</td>
                    <td className="mono">{b.breakdown_type}</td>
                    <td><span className={`chip ${b.status === "closed" ? "chip-ok" : "chip-warn"}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>WORK ORDER HISTORY</span></div>
        <table className="tbl">
          <thead><tr><th>WO</th><th>Status</th><th>Repair Time</th><th>Action Taken</th><th>Closed</th><th></th></tr></thead>
          <tbody>
            {history.work_orders.length === 0 && (
              <tr><td colSpan={6} className="text-mute text-center py-6">No work orders.</td></tr>
            )}
            {history.work_orders.map((w) => (
              <tr key={w.id}>
                <td className="mono">{w.wo_no}</td>
                <td><span className={`chip ${w.status === "closed" ? "chip-ok" : "chip-warn"}`}>{w.status}</span></td>
                <td className="mono">{fmtDuration(w.repair_time_seconds)}</td>
                <td className="text-dim" style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>{w.action_taken || "—"}</td>
                <td className="text-dim">{fmtDateTime(w.closed_at)}</td>
                <td><Link className="btn" style={{ padding: "4px 10px" }} to={`/work-orders/${w.id}`}>OPEN</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
