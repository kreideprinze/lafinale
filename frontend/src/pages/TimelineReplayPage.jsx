import React, { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { fmtDateTime, statusDot } from "../lib/format";
import { useFilters } from "../contexts/FilterContext";

export default function TimelineReplayPage() {
  const f = useFilters();
  const [line, setLine] = useState(null);
  const [frames, setFrames] = useState([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [statusMap, setStatusMap] = useState({});
  const [machines, setMachines] = useState([]);
  const t = useRef(null);

  useEffect(() => {
    if (f.line_id) {
      setLine(f.lines.find((l) => l.id === f.line_id) || null);
    } else if (f.lines.length > 0 && !line) {
      setLine(f.lines[0]);
    }
  }, [f.line_id, f.lines]);

  useEffect(() => {
    if (!line) return;
    (async () => {
      const from = f.from || new Date(Date.now() - 7 * 86400_000).toISOString();
      const to = f.to || new Date().toISOString();
      const r = await api.get(`/timeline/replay?line_id=${line.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setFrames(r.data.data.frames);
      setIdx(0);
      setStatusMap({});
      setPlaying(false);
      const mr = await api.get(`/machines?line_id=${line.id}`);
      setMachines(mr.data.data);
    })();
  }, [line, f.from, f.to]);

  useEffect(() => {
    if (!playing) { clearInterval(t.current); return; }
    t.current = setInterval(() => {
      setIdx((i) => {
        if (i >= frames.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, Math.max(30, 500 / speed));
    return () => clearInterval(t.current);
  }, [playing, speed, frames.length]);

  useEffect(() => {
    // Reduce statusMap from frames[0..idx]
    const acc = {};
    for (let i = 0; i <= idx && i < frames.length; i++) {
      const f = frames[i];
      if (f.kind === "machine.status_changed" && f.machine_id) {
        acc[f.machine_id] = f.payload?.to || acc[f.machine_id];
      }
      if (f.kind === "breakdown.created" && f.machine_id) {
        acc[f.machine_id] = "failed";
      }
      if (f.kind === "breakdown.closed" && f.machine_id) {
        acc[f.machine_id] = "running";
      }
    }
    setStatusMap(acc);
  }, [idx, frames]);

  const current = frames[idx];

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="mono text-lg tracking-[0.2em]">TIMELINE REPLAY</h1>
        <div className="text-xs text-mute mono">
          Line: <span className="text-white">{line?.code || "—"}</span> · Range from global filters
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd">
          <span>PLAYBACK · {frames.length} events</span>
          <span className="mono text-mute">{current ? fmtDateTime(current.at) : "—"}</span>
        </div>
        <div className="p-4 flex items-center gap-3">
          <button className="btn btn-primary" onClick={() => setPlaying(!playing)} data-testid="tl-playpause">
            {playing ? "PAUSE" : "PLAY"}
          </button>
          <button className="btn" onClick={() => { setIdx(0); setPlaying(false); }} data-testid="tl-reset">RESET</button>
          <div className="flex gap-1">
            {[0.5, 1, 2, 5, 10, 60].map((s) => (
              <button key={s} className="btn" data-testid={`tl-speed-${s}`}
                style={{ padding: "6px 10px", borderColor: speed === s ? "var(--data)" : "var(--border-strong)", color: speed === s ? "var(--data)" : "var(--text-dim)" }}
                onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
          <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={idx}
            data-testid="tl-scrub"
            onChange={(e) => setIdx(Number(e.target.value))} style={{ flex: 1 }} />
          <span className="mono text-mute text-xs" data-testid="tl-pos">{idx + 1} / {frames.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2" data-testid="tl-grid">
        {machines.filter(m => !m.is_packing).map((m) => {
          const st = statusMap[m.id] || m.status || "running";
          return (
            <div key={m.id} className="panel-2 p-3 flex items-center gap-2">
              <span className={statusDot(st)} />
              <div className="flex-1 min-w-0">
                <div className="mono text-[10px] text-mute">{m.code}</div>
                <div className="text-sm truncate">{m.name}</div>
              </div>
              <div className="mono text-[10px] text-dim uppercase">{st}</div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-hd"><span>EVENT LOG</span></div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <table className="tbl">
            <thead><tr><th>#</th><th>At</th><th>Kind</th><th>Machine</th><th>Details</th></tr></thead>
            <tbody>
              {frames.slice(0, idx + 1).reverse().slice(0, 100).map((f, i) => {
                const real = idx - i;
                return (
                  <tr key={f.id || real}>
                    <td className="mono">{real + 1}</td>
                    <td className="mono text-dim">{fmtDateTime(f.at)}</td>
                    <td className="mono">{f.kind}</td>
                    <td className="mono text-dim">{f.machine_id?.slice(0, 8) || "—"}</td>
                    <td className="text-dim mono text-xs" style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {JSON.stringify(f.payload || {})}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
