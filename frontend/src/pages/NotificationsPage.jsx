import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtAgo } from "../lib/format";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const load = async () => {
    const r = await api.get("/notifications?limit=200");
    setItems(r.data.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="mono text-lg tracking-[0.2em]">NOTIFICATIONS</h1>
        <button className="btn" onClick={async () => { await api.post("/notifications/read-all"); load(); }} data-testid="notif-readall">
          MARK ALL READ
        </button>
      </div>
      <div className="panel">
        <table className="tbl" data-testid="notif-table">
          <thead><tr><th>Kind</th><th>Severity</th><th>Title</th><th>When</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="text-mute text-center py-6">No notifications.</td></tr>}
            {items.map((n) => (
              <tr key={n.id}>
                <td className="mono">{n.kind}</td>
                <td className={`mono ${n.severity === "critical" ? "text-danger" : n.severity === "high" ? "text-warn" : ""}`}>{n.severity}</td>
                <td>{n.title}<div className="text-mute text-xs">{n.body}</div></td>
                <td className="text-dim">{fmtAgo(n.created_at)}</td>
                <td>{n.read_at ? <span className="chip">read</span> : <span className="chip chip-info">new</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
