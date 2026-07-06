import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtDuration } from "../lib/format";
import { useFilters } from "../contexts/FilterContext";

/**
 * Personnel analytics panel — plugs into the Analytics page as a tab.
 *
 * Consumes the current global filters (department / date range).
 */
export default function PersonnelPanel() {
  const f = useFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.department) p.set("department", f.department);
    setLoading(true);
    api.get(`/analytics/personnel?${p}`)
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [f.from, f.to, f.department]);

  if (loading && !data) return <div className="p-6 text-mute mono text-xs">Loading…</div>;
  if (!data) return <div className="p-6 text-mute mono text-xs">No data.</div>;

  const top = data.top || {};

  return (
    <div className="flex flex-col gap-4" data-testid="ana-personnel">
      {/* Top performers strip */}
      <div className="grid grid-cols-4 gap-3">
        <TopCard
          label="MOST ACTIVE REPORTER"
          person={top.most_active_reporter}
          detail={(t) => `${t.count} breakdowns reported`}
          testid="tp-reporter"
        />
        <TopCard
          label="MOST ACTIVE TECHNICIAN"
          person={top.most_active_technician}
          detail={(t) => `${t.count} work orders`}
          testid="tp-most-active-tech"
        />
        <TopCard
          label="FASTEST TECHNICIAN"
          person={top.fastest_technician}
          detail={(t) => `Avg repair: ${fmtDuration(t.avg_repair_seconds)}`}
          tone="ok"
          testid="tp-fastest"
        />
        <TopCard
          label="SLOWEST TECHNICIAN"
          person={top.slowest_technician}
          detail={(t) => `Avg repair: ${fmtDuration(t.avg_repair_seconds)}`}
          tone="warn"
          testid="tp-slowest"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Reporters table */}
        <div className="panel">
          <div className="panel-hd"><span>BREAKDOWNS REPORTED · PER PERSON</span></div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Reporter</th><th style={{ textAlign: "right" }}>Reported</th></tr></thead>
              <tbody>
                {data.reporters.length === 0 && (
                  <tr><td colSpan={3} className="text-mute text-center py-6">No data.</td></tr>
                )}
                {data.reporters.map((r, i) => (
                  <tr key={r.name} data-testid={`rep-row-${i}`}>
                    <td className="mono text-mute">{i + 1}</td>
                    <td className="mono">{r.name}</td>
                    <td className="mono text-data" style={{ textAlign: "right" }}>{r.breakdowns_reported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Technicians table */}
        <div className="panel">
          <div className="panel-hd"><span>TECHNICIAN PRODUCTIVITY</span></div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Technician</th>
                  <th style={{ textAlign: "right" }}>Completed</th>
                  <th style={{ textAlign: "right" }}>Total Repair</th>
                  <th style={{ textAlign: "right" }}>Avg Repair</th>
                </tr>
              </thead>
              <tbody>
                {data.technicians.length === 0 && (
                  <tr><td colSpan={5} className="text-mute text-center py-6">No data.</td></tr>
                )}
                {data.technicians.map((t, i) => (
                  <tr key={t.user_id} data-testid={`tech-row-${i}`}>
                    <td className="mono text-mute">{i + 1}</td>
                    <td className="mono">{t.name}</td>
                    <td className="mono text-ok" style={{ textAlign: "right" }}>{t.work_orders_completed}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtDuration(t.total_repair_seconds)}</td>
                    <td className="mono text-data" style={{ textAlign: "right" }}>{fmtDuration(t.avg_repair_seconds)}</td>
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

function TopCard({ label, person, detail, tone, testid }) {
  const color = tone === "ok" ? "var(--ok)"
              : tone === "warn" ? "var(--warn)"
              :                    "var(--data)";
  return (
    <div className="panel">
      <div className="p-3">
        <div className="text-[9px] text-mute tracking-[0.2em] uppercase">{label}</div>
        {person ? (
          <>
            <div className="mono text-base mt-2 truncate" style={{ color }} data-testid={testid}>
              {person.name}
            </div>
            <div className="text-[10px] text-dim mt-1">{detail(person)}</div>
          </>
        ) : (
          <div className="mono text-sm text-mute mt-2" data-testid={testid}>—</div>
        )}
      </div>
    </div>
  );
}
