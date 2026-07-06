import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { live } from "../lib/ws";
import { useAuth } from "../contexts/AuthContext";
import { useFilters } from "../contexts/FilterContext";
import { fmtAgo, statusClass, statusDot } from "../lib/format";
import QuickBreakdownDialog from "../components/QuickBreakdownDialog";
import { useNavigate } from "react-router-dom";
import { Plus, AlertTriangle, Wrench, MousePointerClick } from "lucide-react";

/**
 * Control Room — operations-focused floor view.
 *   • Left sidebar:
 *       - Compact SUMMARY counts (Active BDs / Open WOs / Critical Down)
 *       - ACTIVE BREAKDOWNS list  (click → machine details / highlight)
 *       - ACTIVE WORK ORDERS list (click → WO details / highlight)
 *   • Main: live process flow diagram (unchanged behaviour).
 *   • Public: no login required. Right-click / double-click / New Breakdown button
 *     opens the report dialog which posts to /api/breakdowns/report anonymously.
 */
export default function ControlRoomPage() {
  const { user } = useAuth();
  const f = useFilters();
  const [lines, setLines] = useState([]);
  const [activeLine, setActiveLine] = useState(null);
  const [tree, setTree] = useState(null);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [preselectMachine, setPreselectMachine] = useState(null);

  // Sidebar data
  const [activeBds, setActiveBds] = useState([]);
  const [activeWos, setActiveWos] = useState([]);
  const [highlightMachineId, setHighlightMachineId] = useState(null);
  const nodeRefs = useRef({});
  const nav = useNavigate();

  // Line list scoped to current department (defaults to process for the twin)
  useEffect(() => {
    const p = new URLSearchParams();
    if (f.department) p.set("department", f.department);
    else p.set("department", "process");
    api.get(`/lines?${p}`).then((r) => {
      setLines(r.data.data);
      const g = f.line_id ? r.data.data.find((l) => l.id === f.line_id) : null;
      if (g) setActiveLine(g);
      else if (r.data.data.length > 0) setActiveLine(r.data.data[0]);
      else setActiveLine(null);
    });
  }, [f.department, f.line_id]);

  useEffect(() => {
    if (!f.line_id) return;
    const g = lines.find((l) => l.id === f.line_id);
    if (g && (!activeLine || activeLine.id !== g.id)) setActiveLine(g);
  }, [f.line_id, lines]);

  const loadTree = useCallback(async () => {
    if (!activeLine) return;
    const r = await api.get(`/lines/${activeLine.id}/tree`);
    setTree(r.data.data);
  }, [activeLine]);

  useEffect(() => { loadTree(); }, [loadTree]);

  // Load sidebar data (respects global filters, refreshed on WS event)
  const loadSidebar = useCallback(async () => {
    const p = new URLSearchParams();
    if (f.department) p.set("department", f.department);
    if (f.line_id) p.set("line_id", f.line_id);
    p.set("active_only", "true");
    p.set("limit", "50");
    try {
      const [b, w] = await Promise.all([
        api.get(`/breakdowns?${p}`),
        api.get(`/work-orders?${p}`),
      ]);
      setActiveBds(b.data.data || []);
      setActiveWos(w.data.data || []);
    } catch { /* noop */ }
  }, [f.department, f.line_id]);

  useEffect(() => { loadSidebar(); }, [loadSidebar]);

  // WS
  useEffect(() => {
    if (!activeLine) return;
    const channel = `line:${activeLine.id}`;
    live.subscribe(channel);
    const off = live.onEvent((msg) => {
      if (msg?.type !== "event") return;
      if (msg.event === "machine.status_changed" && msg.channel === channel) {
        setTree((cur) => {
          if (!cur) return cur;
          return { ...cur, machines: cur.machines.map((m) =>
            m.id === msg.payload.machine_id
              ? { ...m, status: msg.payload.to, status_since: msg.at }
              : m) };
        });
      }
      if (msg.event === "breakdown.created" || msg.event === "breakdown.closed"
          || msg.event === "wo.started" || msg.event === "wo.closed"
          || msg.event === "wo.assigned") {
        loadTree();
        loadSidebar();
      }
    });
    return () => { off(); live.unsubscribe(channel); };
  }, [activeLine?.id, loadTree, loadSidebar]);

  // Build process flow layout
  const flow = useMemo(() => {
    if (!tree) return null;
    const groups = tree.groups || [];
    const machines = tree.machines || [];
    const rootMachines = machines.filter((m) => m.kind !== "subsystem");
    rootMachines.sort((a, b) => a.sequence - b.sequence);
    const byParent = {};
    machines.filter((m) => m.kind === "subsystem").forEach((m) => {
      if (!byParent[m.parent_machine_id]) byParent[m.parent_machine_id] = [];
      byParent[m.parent_machine_id].push(m);
    });
    const groupMap = {};
    groups.forEach((g) => (groupMap[g.id] = g));
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

  // Machine name index for sidebar rows
  const machineIndex = useMemo(() => {
    const map = {};
    if (tree) {
      for (const m of tree.machines) map[m.id] = m;
    }
    return map;
  }, [tree]);

  const onNodeClick = (m) => {
    if (m.is_packing) {
      alert(`${m.name} is a terminator/packing endpoint — no MTTR/MTBF/Availability tracked.`);
      return;
    }
    nav(`/machine/${m.id}`);
  };

  const quickReport = useCallback((m) => {
    setPreselectMachine(m);
    setDlgOpen(true);
  }, []);

  const focusMachine = useCallback((machineId) => {
    if (!machineId) return;
    setHighlightMachineId(machineId);
    const el = nodeRefs.current[machineId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setTimeout(() => setHighlightMachineId(null), 3000);
  }, []);

  // Counts for the summary strip
  const counts = useMemo(() => {
    const critical = activeBds.filter((b) => b.severity === "critical").length;
    return { bd: activeBds.length, wo: activeWos.length, critical };
  }, [activeBds, activeWos]);

  const shortAreaName = (l) => l?.code || "";

  return (
    <div className="grid" style={{ gridTemplateColumns: "340px 1fr", height: "calc(100vh - 96px)" }}>
      {/* LEFT RAIL */}
      <div
        className="panel-2"
        style={{ borderRight: "1px solid #1f1f1f", display: "flex", flexDirection: "column", minHeight: 0 }}
        data-testid="cr-sidebar"
      >
        {/* Summary counts */}
        <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #1f1f1f" }} data-testid="cr-summary">
          <SummaryTile label="ACTIVE BDs" value={counts.bd} tone={counts.bd > 0 ? "danger" : "muted"} testid="cr-count-bd" />
          <SummaryTile label="OPEN WOs" value={counts.wo} tone={counts.wo > 0 ? "warn" : "muted"} testid="cr-count-wo" />
          <SummaryTile label="CRITICAL DOWN" value={counts.critical} tone={counts.critical > 0 ? "danger" : "muted"} testid="cr-count-critical" />
        </div>

        {/* Active Breakdowns */}
        <SidebarPanel
          title="ACTIVE BREAKDOWNS"
          icon={<AlertTriangle size={12} className="text-danger" />}
          testid="cr-active-bd"
          emptyText="No active breakdowns"
          items={activeBds}
          renderRow={(b) => {
            const machine = machineIndex[b.machine_id];
            return (
              <div
                key={b.id}
                className="sidebar-row"
                data-testid={`cr-bd-row-${b.ticket_no}`}
                onClick={() => {
                  if (machine) focusMachine(b.machine_id);
                  else if (b.work_order_id) nav(`/work-orders/${b.work_order_id}`);
                }}
                title={`Click to focus machine or open detail\n${b.description || ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[10px] text-data">{b.ticket_no}</span>
                  <span className={`chip-tiny ${sevChipClass(b.severity)}`}>{b.severity}</span>
                </div>
                <div className="text-[11px] text-white mt-1 truncate" title={b.equipment_text}>
                  {b.equipment_text || machine?.name || "—"}
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-mute tracking-[0.1em] uppercase">
                  <span>{b.department || ""}</span>
                  <span>{fmtAgo(b.breakdown_start_ts)}</span>
                </div>
              </div>
            );
          }}
        />

        {/* Active Work Orders */}
        <SidebarPanel
          title="ACTIVE WORK ORDERS"
          icon={<Wrench size={12} className="text-warn" />}
          testid="cr-active-wo"
          emptyText="No open work orders"
          items={activeWos}
          renderRow={(w) => {
            const machine = machineIndex[w.machine_id];
            return (
              <div
                key={w.id}
                className="sidebar-row"
                data-testid={`cr-wo-row-${w.wo_no}`}
                onClick={() => {
                  if (user) nav(`/work-orders/${w.id}`);
                  else focusMachine(w.machine_id);
                }}
                title={user ? "Click to open work order" : "Click to focus machine (login required for WO details)"}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[10px] text-data">{w.wo_no}</span>
                  <span className={`chip-tiny ${prioChipClass(w.priority)}`}>{(w.priority || "").toUpperCase()}</span>
                </div>
                <div className="text-[11px] text-white mt-1 truncate">
                  {machine?.name || "—"}
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-mute tracking-[0.1em] uppercase">
                  <span>{w.assigned_to ? "ASSIGNED" : "UNASSIGNED"}</span>
                  <span>{(w.status || "").toUpperCase()}</span>
                </div>
              </div>
            );
          }}
        />
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
              onClick={() => { setActiveLine(l); f.setLine(l.id); }}
            >
              {shortAreaName(l)}
            </div>
          ))}
          <div className="ml-auto flex items-center gap-3 pr-3">
            <button
              data-testid="btn-quick-breakdown"
              className="btn btn-danger"
              onClick={() => { setPreselectMachine(null); setDlgOpen(true); }}
            >
              <Plus size={14} className="inline mr-1" /> NEW BREAKDOWN
            </button>
          </div>
        </div>

        {/* Twin canvas */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px", background: "#050505" }}>
          {!tree && <div className="text-mute mono text-xs">Loading…</div>}
          {tree && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="mono text-xs text-mute tracking-[0.2em] uppercase">
                  Live Process Flow · {shortAreaName(tree.line)}
                </div>
                <span className="chip chip-info" data-testid="machine-count">
                  {tree.machines.filter((m) => !m.is_packing).length} MACHINES
                </span>
                <span className="ml-auto text-[10px] text-mute mono tracking-[0.15em] uppercase flex items-center gap-1">
                  <MousePointerClick size={10} /> DOUBLE-CLICK OR RIGHT-CLICK ANY MACHINE TO REPORT
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-2" data-testid="twin-canvas">
                {flow?.map((item, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <div className="flow-arrow mono">▶</div>}
                    {item.kind === "single" ? (
                      <FlowNode
                        machine={item.machine}
                        subs={item.subs}
                        nodeRef={(el) => (nodeRefs.current[item.machine.id] = el)}
                        highlighted={highlightMachineId === item.machine.id}
                        onClick={() => onNodeClick(item.machine)}
                        onReport={() => quickReport(item.machine)}
                        onSubClick={(s) => onNodeClick(s)}
                        onSubReport={(s) => quickReport(s)}
                        setSubRef={(id, el) => (nodeRefs.current[id] = el)}
                        highlightMachineId={highlightMachineId}
                      />
                    ) : (
                      <div className="stage" data-testid={`stage-${item.group.code}`}>
                        <div className="stage-label">{item.group.name} · PARALLEL</div>
                        <div className="stage-machines">
                          {item.machines.map((m) => (
                            <FlowNode
                              key={m.id}
                              machine={m}
                              subs={[]}
                              nodeRef={(el) => (nodeRefs.current[m.id] = el)}
                              highlighted={highlightMachineId === m.id}
                              onClick={() => onNodeClick(m)}
                              onReport={() => quickReport(m)}
                              minWidth={180}
                            />
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
        onCreated={() => { loadTree(); loadSidebar(); }}
      />
    </div>
  );
}

// ------------- helpers -------------

function FlowNode({ machine, subs = [], nodeRef, highlighted, onClick, onReport, onSubClick, onSubReport, setSubRef, highlightMachineId, minWidth }) {
  return (
    <div className="flex flex-col">
      <div
        ref={nodeRef}
        className={`node ${statusClass(machine.status)} ${highlighted ? "node-highlighted" : ""}`}
        data-testid={`node-${machine.code}`}
        style={minWidth ? { minWidth } : undefined}
        onClick={onClick}
        onDoubleClick={(e) => { e.preventDefault(); if (!machine.is_packing) onReport && onReport(); }}
        onContextMenu={(e) => { e.preventDefault(); if (!machine.is_packing) onReport && onReport(); }}
      >
        <div className="flex items-center justify-between">
          <div className="code">{machine.code}</div>
          <span className={statusDot(machine.status)} />
        </div>
        <div className="name">{machine.name}</div>
        <div className="meta">
          {machine.is_packing ? "TERMINATOR" : (machine.status || "unknown").toUpperCase()}
          {machine.status_since && ` · ${fmtAgo(machine.status_since)}`}
        </div>
        {!machine.is_packing && onReport && (
          <button
            className="node-report-btn"
            data-testid={`node-report-${machine.code}`}
            onClick={(e) => { e.stopPropagation(); onReport(); }}
            title="Report breakdown"
          >
            <AlertTriangle size={10} /> REPORT
          </button>
        )}
        {subs.length > 0 && (
          <div className="subsystems">
            {subs.map((s) => (
              <div
                key={s.id}
                ref={setSubRef ? (el) => setSubRef(s.id, el) : undefined}
                className={`subsystem ${statusClass(s.status)} ${highlightMachineId === s.id ? "node-highlighted" : ""}`}
                data-testid={`sub-${s.code}`}
                onClick={(e) => { e.stopPropagation(); onSubClick && onSubClick(s); }}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); onSubReport && onSubReport(s); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSubReport && onSubReport(s); }}
                title={s.name}
              >
                {s.name.replace(/^(Heat|Main|Oil|OPTYX ?)/, "").trim() || s.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarPanel({ title, icon, items, renderRow, emptyText, testid }) {
  return (
    <div className="sidebar-panel" data-testid={testid}>
      <div className="sidebar-panel-hd">
        {icon}
        <span>{title}</span>
        <span className="ml-auto mono text-[10px] text-mute">{items?.length || 0}</span>
      </div>
      <div className="sidebar-panel-body">
        {(!items || items.length === 0) ? (
          <div className="sidebar-empty">{emptyText}</div>
        ) : (
          items.map(renderRow)
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone, testid }) {
  const color = tone === "danger" ? "var(--danger)"
              : tone === "warn"   ? "var(--warn)"
              :                     "var(--text-dim)";
  return (
    <div className="p-2" style={{ borderRight: "1px solid #1f1f1f" }}>
      <div className="text-[9px] text-mute tracking-[0.15em] uppercase">{label}</div>
      <div className="mono text-lg" style={{ color }} data-testid={testid}>{value}</div>
    </div>
  );
}

function sevChipClass(sev) {
  if (sev === "critical") return "chip-tiny-danger";
  if (sev === "high") return "chip-tiny-warn";
  if (sev === "medium") return "chip-tiny-info";
  return "chip-tiny-muted";
}

function prioChipClass(p) {
  if (p === "p1") return "chip-tiny-danger";
  if (p === "p2") return "chip-tiny-warn";
  if (p === "p3") return "chip-tiny-info";
  return "chip-tiny-muted";
}
