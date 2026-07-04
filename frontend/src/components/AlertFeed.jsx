import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { live } from "../lib/ws";
import { fmtAgo } from "../lib/format";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AlertFeed({ activeLineId }) {
  const [alerts, setAlerts] = useState([]);
  const nav = useNavigate();

  const load = useCallback(async () => {
    const r = await api.get("/notifications?limit=30");
    setAlerts(r.data.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = live.onEvent((m) => {
      if (m?.type !== "event") return;
      if (["notification.new", "alert.raised", "breakdown.created", "wo.assigned",
             "wo.closed", "breakdown.closed"].includes(m.event)) {
        load();
      }
    });
    const t = setInterval(load, 60000);
    return () => { off(); clearInterval(t); };
  }, [load]);

  return (
    <div className="flex flex-col h-full">
      <div className="panel-hd">
        <span>ALERT FEED</span>
        <button
          className="text-[10px] text-mute hover:text-white"
          onClick={async () => { await api.post("/notifications/read-all"); load(); }}
          data-testid="alerts-mark-read"
        >
          MARK ALL READ
        </button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }} data-testid="alert-feed">
        {alerts.length === 0 && (
          <div className="p-4 text-mute text-xs mono">No alerts.</div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="alert-row" data-testid={`alert-${a.id}`}
            onClick={() => a.machine_id && nav(`/machine/${a.machine_id}`)}
            style={{ cursor: a.machine_id ? "pointer" : "default" }}>
            <AlertTriangle
              size={14}
              className={a.severity === "critical" ? "text-danger"
                : a.severity === "high" ? "text-warn"
                : "text-mute"}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs" style={{ lineHeight: 1.35 }}>{a.title}</div>
              <div className="text-[10px] text-mute mono">{fmtAgo(a.created_at)}</div>
            </div>
            {!a.read_at && <span className="dot dot-info" />}
          </div>
        ))}
      </div>
    </div>
  );
}
