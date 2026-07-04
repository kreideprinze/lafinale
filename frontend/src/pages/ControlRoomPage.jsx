import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import { live } from "../lib/ws";
import { useAuth } from "../contexts/AuthContext";
import { fmtDuration, fmtAgo, statusClass, statusDot } from "../lib/format";
import QuickBreakdownDialog from "../components/QuickBreakdownDialog";
import KpiStrip from "../components/KpiStrip";
import AlertFeed from "../components/AlertFeed";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

export default function ControlRoomPage() {
  const { user } = useAuth();
  const [lines, setLines] = useState([]);
  const [activeLine, setActiveLine] = useState(null);
  const [tree, setTree] = useState(null); // {line, groups, machines}
  const [dlgOpen, setDlgOpen] = useState(false);
  const [preselectMachine, setPreselectMachine] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/lines").then((r) => {
      setLines(r.data.data);
      if (r.data.data.length > 0) setActiveLine(r.data.data[0]);
    });
  }, []);

  const loadTree = useCallback(async () => {
    if (!activeLine) return;
    const r = await api.get(`/lines/${activeLine.id}/tree`);
    setTree(r.data.data);
  }, [activeLine]);

  useEffect(() => { loadTree(); }, [loadTree]);

  // Subscribe to live channel
  useEffect(() => {
    if (!activeLine) return;
    const channel = `line:${activeLine.id}`;
    live.subscribe(channel);
    const off = live.onEvent((msg) => {
      if (msg?.type !== "event") return;
      if (msg.channel !== channel) return;
      if (msg.event === "machine.status_changed" && tree) {
        setTree((cur) => {
          if (!cur) return cur;
          const next = { ...cur, machines: cur.machines.map((m) =>
            m.id === msg.payload.machine_id
              ? { ...m, status: msg.payload.to, status_since: msg.at }
              : m) };
          return next;
        });
      }
      if (msg.event === "breakdown.created" || msg.event === "breakdown.closed"
          || msg.event === "wo.started" || msg.event === "wo.closed") {
        loadTree();
      }
    });
    return () => { off(); live.unsubscribe(channel); };
  }, [activeLine?.id, tree, loadTree]);

  // Build process flow layout
  const flow = useMemo(() => {
    if (!tree) return null;
    const groups = tree.groups || [];
    const machines = tree.machines || [];
    // Root-level nodes are: non-subsystem machines (kind != subsystem), sorted by sequence
    // Each stage-group holds its parallel machines.
    const rootMachines = machines.filter((m) => m.kind !== "subsystem");
    // Order via sequence
    rootMachines.sort((a, b) => a.sequence - b.sequence);
    // Attach subsystems by parent
    const byParent = {};
    machines.filter((m) => m.kind === "subsystem").forEach((m) => {
      if (!byParent[m.parent_machine_id]) byParent[m.parent_machine_id] = [];
      byParent[m.parent_machine_id].push(m);
    });
    // Group parallel machines
    const groupMap = {};
    groups.forEach((g) => (groupMap[g.id] = g));
    // Build flow items: either single-machine or group-of-parallels
    const seen = new Set();
    const items = [];
    for (const m of rootMachines) {
      if (m.group_id) {
        if (seen.has(m.group_id)) continue;
        const g = groupMap[m.group_id];
        const members = rootMachines.filter((mm) => mm.group_id === m.group_id)
          .sort((a, b) => a.sequence - b.sequence);
        seen.add(m.group_id);
        items.push({ kind: "group", group: g, machines: members });
      } else {
        items.push({ kind: "single", machine: m, subs: byParent[m.id] || [] });
      }
    }
    return items;
  }, [tree]);

  const onNodeClick = (m) => {
    if (m.is_packing) {
      alert(`${m.name} is a terminator/packing endpoint — no MTTR/MTBF/Availability tracked.`);
      return;
    }
    nav(`/machine/${m.id}`);
  };

  const quickReport = (m) => {
    setPreselectMachine(m);
    setDlgOpen(true);
  };

  const canReport = user && (user.role === "operator" || user.role === "admin" || user.role === "technician");

  return (
    <div className="grid" style={{ gridTemplateColumns: "300px 1fr", height: "calc(100vh - 56px)" }}>
      {/* LEFT RAIL */}
      <div className="panel-2" style={{ borderRight: "1px solid #1f1f1f", display: "flex", flexDirection: "column" }}>
        <KpiStrip lineId={activeLine?.id} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <AlertFeed activeLineId={activeLine?.id} />
        </div>
      </div>

      {/* MAIN */}
      <div className="flex flex-col min-w-0">
        {/* Line tabs */}
        <div className="tab-strip" style={{ overflowX: "auto" }}>
          {lines.map((l) => (
            <div
              key={l.id}
              data-testid={`line-tab-${l.code}`}
              className={`tab ${activeLine?.id === l.id ? "active" : ""}`}
              onClick={() => setActiveLine(l)}
            >
              {l.code}
            </div>
          ))}
          <div className="ml-auto flex items-center gap-3 pr-3">
            {canReport && (
              <button
                data-testid="btn-quick-breakdown"
                className="btn btn-danger"
                onClick={() => { setPreselectMachine(null); setDlgOpen(true); }}
              >
                <Plus size={14} className="inline mr-1" /> NEW BREAKDOWN
              </button>
            )}
          </div>
        </div>

        {/* Twin canvas */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px", background: "#050505" }}>
          {!tree && <div className="text-mute mono text-xs">Loading…</div>}
          {tree && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="mono text-xs text-mute tracking-[0.2em] uppercase">
                  Live Process Flow · {tree.line.name}
                </div>
                <span className="chip chip-info" data-testid="machine-count">
                  {tree.machines.filter((m) => !m.is_packing).length} MACHINES
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-2" data-testid="twin-canvas">
                {flow?.map((item, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <div className="flow-arrow mono">▶</div>}
                    {item.kind === "single" ? (
                      <div className="flex flex-col">
                        <div
                          className={`node ${statusClass(item.machine.status)}`}
                          data-testid={`node-${item.machine.code}`}
                          onClick={() => onNodeClick(item.machine)}
                          onContextMenu={(e) => { e.preventDefault(); if (!item.machine.is_packing) quickReport(item.machine); }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="code">{item.machine.code}</div>
                            <span className={statusDot(item.machine.status)} />
                          </div>
                          <div className="name">{item.machine.name}</div>
                          <div className="meta">
                            {item.machine.is_packing ? "TERMINATOR" : (item.machine.status || "unknown").toUpperCase()}
                            {item.machine.status_since && ` · ${fmtAgo(item.machine.status_since)}`}
                          </div>
                          {item.subs.length > 0 && (
                            <div className="subsystems">
                              {item.subs.map((s) => (
                                <div key={s.id}
                                  className={`subsystem ${statusClass(s.status)}`}
                                  data-testid={`sub-${s.code}`}
                                  onClick={(e) => { e.stopPropagation(); onNodeClick(s); }}
                                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); quickReport(s); }}
                                  title={s.name}
                                >
                                  {s.name.replace(/^(Heat|Main|Oil|OPTYX ?)/, "").trim() || s.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="stage" data-testid={`stage-${item.group.code}`}>
                        <div className="stage-label">{item.group.name} · PARALLEL</div>
                        <div className="stage-machines">
                          {item.machines.map((m) => (
                            <div
                              key={m.id}
                              className={`node ${statusClass(m.status)}`}
                              data-testid={`node-${m.code}`}
                              style={{ minWidth: 180 }}
                              onClick={() => onNodeClick(m)}
                              onContextMenu={(e) => { e.preventDefault(); quickReport(m); }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="code">{m.code}</div>
                                <span className={statusDot(m.status)} />
                              </div>
                              <div className="name">{m.name}</div>
                              <div className="meta">{(m.status || "unknown").toUpperCase()}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div className="mt-6 flex gap-4 text-[10px] text-mute mono tracking-[0.15em] uppercase">
                <div className="flex items-center gap-2"><span className="dot dot-ok" /> RUNNING</div>
                <div className="flex items-center gap-2"><span className="dot dot-danger" /> FAILED</div>
                <div className="flex items-center gap-2"><span className="dot dot-warn" /> REPAIR</div>
                <div className="flex items-center gap-2"><span className="dot dot-idle" /> IDLE</div>
                <div className="ml-auto">RIGHT-CLICK ANY MACHINE TO REPORT BREAKDOWN</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <QuickBreakdownDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        activeLine={activeLine}
        preselectMachine={preselectMachine}
        onCreated={loadTree}
      />
    </div>
  );
}
