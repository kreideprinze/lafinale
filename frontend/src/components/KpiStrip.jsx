import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { live } from "../lib/ws";
import { fmtDuration } from "../lib/format";

export default function KpiStrip({ lineId }) {
  const [kpi, setKpi] = useState(null);
  const [openCount, setOpenCount] = useState(0);

  const load = useCallback(async () => {
    if (!lineId) return;
    const [k, wo] = await Promise.all([
      api.get(`/analytics/line/${lineId}/kpi`),
      api.get(`/work-orders?line_id=${lineId}&status=open`),
    ]);
    setKpi(k.data.data);
    // Count all not-closed WOs
    const wo2 = await api.get(`/work-orders?line_id=${lineId}`);
    setOpenCount(wo2.data.data.filter((w) => !["closed", "cancelled"].includes(w.status)).length);
  }, [lineId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!lineId) return;
    const off = live.onEvent((m) => {
      if (m?.type === "event" && m.channel === `line:${lineId}`) load();
    });
    const t = setInterval(load, 30000);
    return () => { off(); clearInterval(t); };
  }, [lineId, load]);

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
