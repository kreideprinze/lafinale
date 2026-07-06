import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { live } from "../lib/ws";
import { api } from "../lib/api";
import { Bell, LogOut, LogIn, Zap } from "lucide-react";
import GlobalFilterBar from "./GlobalFilterBar";

// Nav items visible when NOT logged in (operator kiosk mode).
const NAV_PUBLIC = [
  { to: "/", label: "Control Room" },
];

const NAV_ALL = [
  { to: "/", label: "Control Room", roles: ["admin", "technician", "operator"] },
  { to: "/breakdowns", label: "Breakdowns", roles: ["admin", "technician", "operator"] },
  { to: "/work-orders", label: "Work Orders", roles: ["admin", "technician"] },
  { to: "/analytics", label: "Analytics", roles: ["admin", "technician"] },
  { to: "/timeline", label: "Timeline", roles: ["admin", "technician"] },
  { to: "/runtime", label: "Runtime", roles: ["admin"] },
  { to: "/admin", label: "Admin", roles: ["admin"] },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [now, setNow] = useState(new Date());
  const [wsState, setWsState] = useState("connecting");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const off = live.onState((s) => setWsState(s));
    return off;
  }, []);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let mounted = true;
    const fetchUnread = async () => {
      try {
        const r = await api.get("/notifications?unread_only=true&limit=200");
        if (mounted) setUnread(r.data.data.length);
      } catch { /* noop */ }
    };
    fetchUnread();
    const off = live.onEvent((m) => {
      if (m?.type === "event" && m.event === "notification.new") fetchUnread();
      if (m?.type === "event" && m.event === "alert.raised") fetchUnread();
    });
    const t = setInterval(fetchUnread, 60000);
    return () => { mounted = false; off(); clearInterval(t); };
  }, [user]);

  const items = user
    ? NAV_ALL.filter((i) => i.roles.includes(user.role))
    : NAV_PUBLIC;

  return (
    <div className="App min-h-screen flex flex-col">
      {/* TOP BAR */}
      <div className="panel-2" style={{ borderBottom: "1px solid #1f1f1f" }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2" data-testid="brand-title">
              <Zap size={16} className="text-data" />
              <span className="mono text-sm tracking-[0.2em]">FACTORY CMMS</span>
              <span className="text-mute text-xs mono">ENTERPRISE v1.0</span>
            </div>
            <nav className="flex items-center gap-0">
              {items.map((i) => {
                const active = i.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(i.to);
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    data-testid={`nav-${i.label.toLowerCase().replace(/ /g, "-")}`}
                    className="px-4 py-2 text-xs uppercase tracking-[0.15em]"
                    style={{
                      color: active ? "var(--data)" : "var(--text-mute)",
                      borderBottom: active ? "2px solid var(--data)" : "2px solid transparent",
                    }}
                  >
                    {i.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="mono text-xs text-dim" data-testid="topbar-clock">
              {now.toISOString().replace("T", " ").split(".")[0]} UTC
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className={`dot ${wsState === "open" ? "dot-ok" : "dot-warn"}`} />
              <span className="text-mute uppercase tracking-[0.1em]" data-testid="ws-state">
                {wsState === "open" ? "LIVE" : "OFFLINE"}
              </span>
            </span>
            {user && (
              <Link to="/notifications" data-testid="topbar-notifications"
                className="relative flex items-center gap-1 text-xs text-dim hover:text-white">
                <Bell size={14} />
                {unread > 0 && (
                  <span
                    data-testid="unread-count"
                    className="mono"
                    style={{ color: "var(--alert)" }}
                  >{unread}</span>
                )}
              </Link>
            )}
            {user ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-dim mono" data-testid="topbar-user">
                  {user.full_name} · {user.role.toUpperCase()}
                </span>
                <button
                  className="btn"
                  data-testid="btn-logout"
                  onClick={async () => { await logout(); nav("/"); }}
                  style={{ padding: "4px 10px" }}
                >
                  <LogOut size={12} className="inline mr-1" />
                  LOGOUT
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                data-testid="btn-maintenance-login"
                className="text-[10px] tracking-[0.15em] uppercase text-mute hover:text-data transition-colors flex items-center gap-1"
                style={{ letterSpacing: "0.15em" }}
              >
                <LogIn size={11} />
                Maintenance Login
              </Link>
            )}
          </div>
        </div>
      </div>

      <GlobalFilterBar />

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
