export function fmtDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function fmtAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtPct(v, digits = 2) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function statusClass(status) {
  switch (status) {
    case "running": return "node-ok";
    case "failed": return "node-danger";
    case "repair": return "node-warn";
    case "starved":
    case "idle":
    default: return "node-idle";
  }
}

export function statusDot(status) {
  switch (status) {
    case "running": return "dot dot-ok";
    case "failed": return "dot dot-danger";
    case "repair": return "dot dot-warn";
    default: return "dot dot-idle";
  }
}
