import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtDuration } from "../lib/format";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export default function AnalyticsPage() {
  const [lines, setLines] = useState([]);
  const [line, setLine] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [trend, setTrend] = useState([]);
  const [pareto, setPareto] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    api.get("/lines").then((r) => {
      setLines(r.data.data);
      if (r.data.data.length > 0) setLine(r.data.data[0]);
    });
  }, []);

  useEffect(() => {
    if (!line) return;
    api.get(`/analytics/rankings?line_id=${line.id}&metric=downtime&days=${days}`).then((r) => setRankings(r.data.data));
    api.get(`/analytics/line/${line.id}/downtime-trend?days=${days}`).then((r) => setTrend(r.data.data));
    api.get(`/analytics/line/${line.id}/pareto?dim=machine`).then((r) => setPareto(r.data.data));
  }, [line, days]);

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="mono text-lg tracking-[0.2em]">ANALYTICS · RELIABILITY</h1>
        <div className="flex gap-2 items-center">
          <select className="field mono" style={{ width: 240 }} value={line?.id || ""} data-testid="ana-line"
            onChange={(e) => setLine(lines.find(l => l.id === e.target.value))}>
            {lines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
          <select className="field mono" style={{ width: 120 }} value={days} data-testid="ana-days"
            onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>DOWNTIME TREND · {days}d</span></div>
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
