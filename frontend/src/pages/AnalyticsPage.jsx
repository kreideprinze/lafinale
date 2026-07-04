import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtDuration } from "../lib/format";
import { useFilters } from "../contexts/FilterContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export default function AnalyticsPage() {
  const f = useFilters();
  const [line, setLine] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [trend, setTrend] = useState([]);
  const [pareto, setPareto] = useState([]);

  // Prefer global line filter, else first available
  useEffect(() => {
    if (f.line_id) {
      setLine(f.lines.find((l) => l.id === f.line_id) || null);
    } else if (f.lines.length > 0 && !line) {
      setLine(f.lines[0]);
    }
  }, [f.line_id, f.lines]);

  useEffect(() => {
    if (!line) return;
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.machine_id) p.set("machine_id", f.machine_id);
    if (f.failure_mode_id) p.set("failure_mode_id", f.failure_mode_id);
    const qs = p.toString() ? `&${p}` : "";
    api.get(`/analytics/rankings?limit=20&line_id=${line.id}${qs}`).then((r) => setRankings(r.data.data));
    // Trend uses `days` computed from date range
    const days = f.from && f.to
      ? Math.min(365, Math.max(1, Math.ceil((new Date(f.to) - new Date(f.from)) / 86400_000)))
      : 30;
    api.get(`/analytics/line/${line.id}/downtime-trend?days=${days}`).then((r) => setTrend(r.data.data));
    const pareto_qs = new URLSearchParams();
    if (f.from) pareto_qs.set("from", f.from);
    if (f.to) pareto_qs.set("to", f.to);
    api.get(`/analytics/line/${line.id}/pareto?dim=machine&${pareto_qs}`).then((r) => setPareto(r.data.data));
  }, [line, f.from, f.to, f.machine_id, f.failure_mode_id]);

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="mono text-lg tracking-[0.2em]">ANALYTICS · RELIABILITY</h1>
        <div className="text-xs text-mute mono">
          Line: <span className="text-white">{line?.code || "—"}</span> · Range from global filters
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>DOWNTIME TREND</span></div>
        <div className="p-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} unit="m" />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #1f1f1f", color: "#fff" }} />
              <Line type="monotone" dataKey="downtime_minutes" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="panel">
          <div className="panel-hd"><span>MACHINE PARETO · BY DOWNTIME</span></div>
          <div className="p-3" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pareto.slice(0, 10).map(p => ({ name: (p.label || "").slice(0, 14), downtime_min: Math.round(p.downtime_seconds / 60) }))}>
                <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} unit="m" />
                <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #1f1f1f", color: "#fff" }} />
                <Bar dataKey="downtime_min" fill="#22d3ee" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd"><span>MACHINE RANKINGS · WORST OFFENDERS</span></div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Machine</th><th>Failures</th><th>Downtime</th></tr></thead>
              <tbody>
                {rankings.length === 0 && (
                  <tr><td colSpan={4} className="text-mute text-center py-6">No data.</td></tr>
                )}
                {rankings.map((r, i) => (
                  <tr key={r.machine_id} data-testid={`rank-${i}`}>
                    <td className="mono">{i + 1}</td>
                    <td className="mono">{r.code} · {r.name}</td>
                    <td className="mono">{r.count}</td>
                    <td className="mono text-danger">{fmtDuration(r.downtime_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
