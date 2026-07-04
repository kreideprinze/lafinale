import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { live } from "../lib/ws";
import { fmtDuration } from "../lib/format";
import { useFilters } from "../contexts/FilterContext";

export default function KpiStrip({ lineId }) {
  const f = useFilters();
  const [kpi, setKpi] = useState(null);
  const [openCount, setOpenCount] = useState(0);

  // Use global line filter if set, else the prop lineId (from control room tab).
  const effectiveLine = f.line_id || lineId;

  const load = useCallback(async () => {
    if (!effectiveLine) return;
    const params = new URLSearchParams();
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    const qs = params.toString() ? `?${params}` : "";
    const [k, wo2] = await Promise.all([
      api.get(`/analytics/line/${effectiveLine}/kpi${qs}`),
      api.get(`/work-orders?line_id=${effectiveLine}`),
    ]);
    setKpi(k.data.data);
    setOpenCount(wo2.data.data.filter((w) => !["closed", "cancelled"].includes(w.status)).length);
  }, [effectiveLine, f.from, f.to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!effectiveLine) return;
    const off = live.onEvent((m) => {
      if (m?.type === "event" && m.channel === `line:${effectiveLine}`) load();
    });
    const t = setInterval(load, 30000);
    return () => { off(); clearInterval(t); };
  }, [effectiveLine, load]);

  return (
    <div className="p-3 grid grid-cols-2 gap-2" data-testid="kpi-strip">
      <div className="kpi" data-testid="kpi-availability">
        <div className="label">Availability</div>
        <div className={`value ${kpi?.availability_display?.length > 8 ? "small" : ""} ${kpi?.availability != null ? (kpi.availability > 0.9 ? "value-ok" : kpi.availability > 0.75 ? "value-warn" : "value-danger") : ""}`}>
          {kpi?.availability_display || "—"}
        </div>
        <div className="sub">30d window</div>
      </div>
      <div className="kpi" data-testid="kpi-mttr">
        <div className="label">MTTR</div>
        <div className="value">{fmtDuration(kpi?.mttr_seconds)}</div>
        <div className="sub">n={kpi?.n_closed_wo ?? 0}</div>
      </div>
      <div className="kpi" data-testid="kpi-mtbf">
        <div className="label">MTBF</div>
        <div className="value">{fmtDuration(kpi?.mtbf_seconds)}</div>
        <div className="sub">n={kpi?.failures ?? 0}</div>
      </div>
      <div className="kpi" data-testid="kpi-open-wo">
        <div className="label">Open WOs</div>
        <div className={`value ${openCount > 0 ? "value-warn" : ""}`}>{openCount}</div>
        <div className="sub">live</div>
      </div>
      <div className="kpi col-span-2" data-testid="kpi-downtime">
        <div className="label">Downtime · 30d</div>
        <div className="value">{fmtDuration(kpi?.downtime_seconds)}</div>
        <div className="sub">failures={kpi?.failures ?? 0}</div>
      </div>
    </div>
  );
}
