import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { fmtDateTime, fmtDuration, fmtAgo } from "../lib/format";

export default function WorkOrderDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [techs, setTechs] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [action, setAction] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [spare, setSpare] = useState({ sap_code: "", qty: 1, cost: 0 });
  const [spares, setSpares] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    const r = await api.get(`/work-orders/${id}`);
    setData(r.data.data);
    setSpares(r.data.data.work_order.spares_used || []);
    setAction(r.data.data.work_order.action_taken || "");
    setRootCause(r.data.data.work_order.root_cause || "");
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (user?.role === "admin" || user?.role === "technician") {
      api.get("/users/technicians").then((r) => setTechs(r.data.data));
    }
  }, [user?.role]);

  if (!data) return <div className="p-6 text-mute mono">Loading…</div>;
  const wo = data.work_order;
  const bd = data.breakdown;
  const events = data.repair_events;

  const call = async (path, body) => {
    setErr("");
    try {
      await api.post(`/work-orders/${id}${path}`, body);
      await load();
    } catch (e) {
      setErr(formatApiError(e?.response?.data?.detail) || e.message);
    }
  };

  const isTech = user?.role === "admin" || user?.role === "technician";
  const isAdmin = user?.role === "admin";
  const isMine = wo.assigned_to === user?.id;
  const canAct = isAdmin || (isMine && isTech);

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <div className="panel">
        <div className="panel-hd">
          <span>WORK ORDER <span className="mono text-data ml-3">{wo.wo_no}</span></span>
          <span className={`chip ${wo.status === "closed" ? "chip-ok" : "chip-warn"}`} data-testid="wo-status">{wo.status}</span>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3 text-sm">
          <Field label="Priority" value={<span className="mono">{wo.priority}</span>} />
          <Field label="Type" value={<span className="mono">{wo.type}</span>} />
          <Field label="Assigned to" value={<span className="mono">{wo.assigned_to ? techs.find(t => t.id === wo.assigned_to)?.full_name || wo.assigned_to.slice(0, 8) : "—"}</span>} />
          <Field label="Created" value={fmtDateTime(wo.created_at)} />
          <Field label="Assigned" value={fmtDateTime(wo.assigned_at)} />
          <Field label="Started" value={fmtDateTime(wo.repair_started_at)} />
          <Field label="Completed" value={fmtDateTime(wo.repair_completed_at)} />
          <Field label="Closed" value={fmtDateTime(wo.closed_at)} />
          <Field label="Repair time" value={<span className="mono">{fmtDuration(wo.repair_time_seconds)}</span>} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>BREAKDOWN</span></div>
        {bd ? (
          <div className="p-4 flex flex-col gap-2 text-sm">
            <div><span className="text-mute text-xs">Ticket</span> · <span className="mono text-data" data-testid="wo-bd-ticket">{bd.ticket_no}</span></div>
            <div><span className="text-mute text-xs">Type</span> · <span className="mono">{bd.breakdown_type}</span></div>
            <div><span className="text-mute text-xs">Severity</span> · <span className="mono">{bd.severity}</span></div>
            <div><span className="text-mute text-xs">Description</span></div>
            <div className="mono text-dim" style={{ whiteSpace: "pre-wrap" }}>{bd.description}</div>
            <div className="text-xs text-mute mt-2">Started {fmtDateTime(bd.breakdown_start_ts)}</div>
          </div>
        ) : <div className="p-4 text-mute">No linked breakdown.</div>}
      </div>

      {/* Actions */}
      <div className="panel col-span-2">
        <div className="panel-hd"><span>ACTIONS</span></div>
        <div className="p-4 flex flex-wrap gap-2 items-start">
          {isAdmin && wo.status === "open" && (
            <div className="flex items-center gap-2">
              <select className="field mono" value={assignTo} data-testid="wo-assignto"
                onChange={(e) => setAssignTo(e.target.value)} style={{ width: 260 }}>
                <option value="">— select technician —</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>)}
              </select>
              <button className="btn btn-primary" disabled={!assignTo} data-testid="wo-assign-btn"
                onClick={() => call("/assign", { assigned_to: assignTo })}>ASSIGN</button>
            </div>
          )}
          {canAct && wo.status === "assigned" && (
            <button className="btn btn-primary" data-testid="wo-start-btn" onClick={() => call("/start")}>
              START REPAIR
            </button>
          )}
          {canAct && wo.status === "in_progress" && (
            <>
              <div className="w-full grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Action Taken *</label>
                  <textarea className="field mt-1 mono" rows={3} value={action}
                    data-testid="wo-action" onChange={(e) => setAction(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Root Cause</label>
                  <textarea className="field mt-1 mono" rows={3} value={rootCause}
                    data-testid="wo-root" onChange={(e) => setRootCause(e.target.value)} />
                </div>
              </div>
              <div className="w-full">
                <div className="text-[10px] tracking-[0.15em] text-mute uppercase mb-1">Spares Used</div>
                <div className="flex gap-2 mb-2">
                  <input className="field mono" style={{ width: 200 }} placeholder="SAP CODE"
                    value={spare.sap_code} data-testid="wo-spare-sap"
                    onChange={(e) => setSpare({ ...spare, sap_code: e.target.value })} />
                  <input className="field mono" style={{ width: 80 }} type="number" placeholder="QTY"
                    value={spare.qty} data-testid="wo-spare-qty"
                    onChange={(e) => setSpare({ ...spare, qty: Number(e.target.value) })} />
                  <button className="btn" type="button" data-testid="wo-spare-add"
                    onClick={() => {
                      if (spare.sap_code) {
                        setSpares([...spares, spare]);
                        setSpare({ sap_code: "", qty: 1, cost: 0 });
                      }
                    }}>ADD</button>
                </div>
                {spares.length > 0 && (
                  <table className="tbl">
                    <thead><tr><th>SAP</th><th>Qty</th><th></th></tr></thead>
                    <tbody>
                      {spares.map((s, i) => (
                        <tr key={i}>
                          <td className="mono">{s.sap_code}</td>
                          <td className="mono">{s.qty}</td>
                          <td><button className="text-mute" onClick={() => setSpares(spares.filter((_, j) => j !== i))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <button className="btn btn-ok" data-testid="wo-complete-btn"
                onClick={() => call("/complete", { action_taken: action, root_cause: rootCause, spares_used: spares })}
                disabled={!action.trim()}>
                COMPLETE REPAIR
              </button>
            </>
          )}
          {canAct && wo.status === "completed" && (
            <button className="btn btn-ok" data-testid="wo-close-btn" onClick={() => call("/close")}>
              CLOSE WORK ORDER
            </button>
          )}
          {err && <div className="chip chip-danger">{err}</div>}
        </div>
      </div>

      <div className="panel col-span-2">
        <div className="panel-hd"><span>REPAIR EVENTS</span></div>
        <div className="p-2">
          {events.length === 0 && <div className="p-3 text-mute mono">No repair events yet.</div>}
          {events.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Event</th><th>At</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.event_type}</td>
                    <td className="mono">{fmtDateTime(e.at)}</td>
                    <td className="mono">{e.by?.slice(0, 8) || "—"}</td>
                    <td className="text-dim">{e.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.15em] text-mute uppercase">{label}</div>
      <div className="mt-1">{value ?? "—"}</div>
    </div>
  );
}
