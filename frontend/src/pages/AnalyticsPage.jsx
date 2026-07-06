import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtDuration } from "../lib/format";
import { useFilters } from "../contexts/FilterContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const DEPT_LABEL = { process: "Process", packaging: "Packaging", utilities: "Utilities" };

export default function AnalyticsPage() {
  const f = useFilters();
  const [line, setLine] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [trend, setTrend] = useState([]);
  const [pareto, setPareto] = useState([]);
  const [deptKpi, setDeptKpi] = useState(null);

  // Prefer global line filter, else first available in scope
  useEffect(() => {
    if (f.line_id) {
      setLine(f.linesInScope.find((l) => l.id === f.line_id) || null);
    } else if (f.linesInScope.length > 0) {
      setLine(f.linesInScope[0]);
    } else {
      setLine(null);
    }
  }, [f.line_id, f.linesInScope]);

  // Department-wide KPI (if a department is selected)
  useEffect(() => {
    if (!f.department) { setDeptKpi(null); return; }
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    api.get(`/analytics/department/${f.department}/kpi?${p}`).then((r) => setDeptKpi(r.data.data));
  }, [f.department, f.from, f.to]);

  useEffect(() => {
    if (!line) return;
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.department) p.set("department", f.department);
    if (f.machine_id) p.set("machine_id", f.machine_id);
    if (f.failure_mode_id) p.set("failure_mode_id", f.failure_mode_id);
    const qs = p.toString() ? `&${p}` : "";
    api.get(`/analytics/rankings?limit=20&line_id=${line.id}${qs}`).then((r) => setRankings(r.data.data));
    const days = f.from && f.to
      ? Math.min(365, Math.max(1, Math.ceil((new Date(f.to) - new Date(f.from)) / 86400_000)))
      : 30;
    api.get(`/analytics/line/${line.id}/downtime-trend?days=${days}`).then((r) => setTrend(r.data.data));
    const pareto_qs = new URLSearchParams();
    if (f.from) pareto_qs.set("from", f.from);
    if (f.to) pareto_qs.set("to", f.to);
    api.get(`/analytics/line/${line.id}/pareto?dim=machine&${pareto_qs}`).then((r) => setPareto(r.data.data));
  }, [line, f.from, f.to, f.department, f.machine_id, f.failure_mode_id]);

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="mono text-lg tracking-[0.2em]">ANALYTICS · RELIABILITY</h1>
        <div className="text-xs text-mute mono">
          {f.department && <span className="text-data mr-3">DEPT: {DEPT_LABEL[f.department]}</span>}
          Area: <span className="text-white">{line?.code || "—"}</span> · Range from global filters
        </div>
      </div>

      {deptKpi && (
        <div className="panel" data-testid="ana-dept-kpi">
          <div className="panel-hd">
            <span>DEPARTMENT KPI · {DEPT_LABEL[deptKpi.department]}</span>
            <span className="mono text-mute text-xs">
              {deptKpi.window_from?.slice(0,10)} → {deptKpi.window_to?.slice(0,10)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 p-4">
            <div className="kpi"><div className="label">Failures</div>
              <div className="value" data-testid="ana-dept-failures">{deptKpi.failures}</div>
              <div className="sub">total in window</div></div>
            <div className="kpi"><div className="label">Downtime</div>
              <div className="value">{fmtDuration(deptKpi.downtime_seconds)}</div>
              <div className="sub">accumulated</div></div>
            <div className="kpi"><div className="label">MTTR</div>
              <div className="value">{fmtDuration(deptKpi.mttr_seconds)}</div>
              <div className="sub">n={deptKpi.n_closed_wo}</div></div>
            <div className="kpi"><div className="label">Top cause</div>
              <div className="value small">{deptKpi.top_causes?.[0]?.label || "—"}</div>
              <div className="sub">{deptKpi.top_causes?.[0]?.count || 0} events</div></div>
          </div>
          {deptKpi.top_equipment?.length > 0 && (
            <div className="p-4 pt-0">
              <div className="text-[10px] tracking-[0.15em] text-mute uppercase mb-2">Top problematic equipment</div>
              <table className="tbl">
                <thead><tr><th>Machine</th><th>Failures</th><th>Downtime</th></tr></thead>
                <tbody>
                  {deptKpi.top_equipment.slice(0, 5).map((e) => (
                    <tr key={e.machine_id} data-testid={`ana-dept-eq-${e.code}`}>
                      <td className="mono">{e.code} · {e.name}</td>
                      <td className="mono">{e.count}</td>
                      <td className="mono text-danger">{fmtDuration(e.downtime_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
