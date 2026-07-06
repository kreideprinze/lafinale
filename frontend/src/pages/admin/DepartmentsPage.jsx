import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { fmtDuration } from "../../lib/format";

const DEPT_META = {
  process:   { label: "Process",   color: "var(--ok)"    },
  packaging: { label: "Packaging", color: "var(--data)"  },
  utilities: { label: "Utilities", color: "var(--warn)"  },
};

export default function DepartmentsPage() {
  const [depts, setDepts] = useState([]);
  const [lines, setLines] = useState([]);
  const [machines, setMachines] = useState([]);
  const [breakdowns, setBreakdowns] = useState({});

  useEffect(() => {
    Promise.all([
      api.get("/departments"),
      api.get("/lines"),
      api.get("/machines"),
    ]).then(([d, l, m]) => {
      setDepts(d.data.data);
      setLines(l.data.data);
      setMachines(m.data.data);
      // For each department, fetch KPI in parallel
      d.data.data.forEach((dep) => {
        api.get(`/analytics/department/${dep.code}/kpi?from=2020-01-01T00:00:00%2B00:00&to=2027-01-01T00:00:00%2B00:00`)
          .then((r) => setBreakdowns((prev) => ({ ...prev, [dep.code]: r.data.data })));
      });
    });
  }, []);

  return (
    <div className="p-6 flex flex-col gap-4">
      <h2 className="mono text-sm tracking-[0.2em]">DEPARTMENT MASTER · PLANT HIERARCHY</h2>

      <div className="grid grid-cols-3 gap-4" data-testid="dept-cards">
        {depts.map((d) => {
          const areaCount = lines.filter((l) => l.department === d.code).length;
          const eqCount = machines.filter((m) => m.department === d.code && !m.is_packing).length;
          const kpi = breakdowns[d.code];
          return (
            <div key={d.code} className="panel" data-testid={`dept-card-${d.code}`}>
              <div className="panel-hd" style={{ borderBottomColor: DEPT_META[d.code]?.color }}>
                <span style={{ color: DEPT_META[d.code]?.color }}>{d.name.toUpperCase()}</span>
                <span className="chip" style={{ borderColor: DEPT_META[d.code]?.color, color: DEPT_META[d.code]?.color }}>
                  {d.code}
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-2">
                <div className="kpi"><div className="label">Areas</div>
                  <div className="value">{areaCount}</div></div>
                <div className="kpi"><div className="label">Equipment</div>
                  <div className="value">{eqCount}</div></div>
                <div className="kpi"><div className="label">Failures (all-time)</div>
                  <div className="value">{kpi ? kpi.failures : "—"}</div></div>
                <div className="kpi"><div className="label">Downtime</div>
                  <div className="value">{kpi ? fmtDuration(kpi.downtime_seconds) : "—"}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-hd"><span>AREAS BY DEPARTMENT</span></div>
        <table className="tbl">
          <thead><tr><th>Dept</th><th>Area code</th><th>Area name</th><th>Equipment</th></tr></thead>
          <tbody>
            {[...lines]
              .sort((a, b) => (a.department || "").localeCompare(b.department || "") || (a.sequence - b.sequence))
              .map((l) => {
                const cnt = machines.filter((m) => m.line_id === l.id && !m.is_packing).length;
                return (
                  <tr key={l.id} data-testid={`dept-area-${l.code}`}>
                    <td className="mono" style={{ color: DEPT_META[l.department]?.color }}>
                      {(l.department || "process").toUpperCase()}
                    </td>
                    <td className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td className="mono">{cnt}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
