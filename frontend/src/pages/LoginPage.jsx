import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { formatApiError } from "../lib/api";
import Brand from "../components/Brand";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await login(email.trim().toLowerCase(), password);
      nav("/");
    } catch (err) {
      setError(formatApiError(err?.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillAccount = (e, p) => {
    setEmail(e); setPassword(p);
  };

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-6">
            <Brand iconSize={22} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-normal leading-tight mb-4">
            Industrial Maintenance<br />
            <span className="text-data">Intelligence Platform</span>
          </h1>
          <p className="text-dim mono text-sm leading-relaxed">
            Centralized CMMS · Reliability Engineering · Digital Twin<br />
            SCADA control-room monitoring for continuous 24/7 operations.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            <button
              className="btn text-left"
              data-testid="fill-admin"
              onClick={() => fillAccount("admin@factory.local", "Admin@123")}
              style={{ padding: "10px 12px" }}
            >
              <div className="text-[10px] text-mute tracking-[0.15em]">ADMIN</div>
              <div className="mono text-[11px] mt-1 truncate">admin@factory.local</div>
            </button>
            <button
              className="btn text-left"
              data-testid="fill-tech"
              onClick={() => fillAccount("tech@factory.local", "Tech@123")}
              style={{ padding: "10px 12px" }}
            >
              <div className="text-[10px] text-mute tracking-[0.15em]">TECHNICIAN</div>
              <div className="mono text-[11px] mt-1 truncate">tech@factory.local</div>
            </button>
            <button
              className="btn text-left"
              data-testid="fill-op"
              onClick={() => fillAccount("op@factory.local", "Op@123")}
              style={{ padding: "10px 12px" }}
            >
              <div className="text-[10px] text-mute tracking-[0.15em]">OPERATOR</div>
              <div className="mono text-[11px] mt-1 truncate">op@factory.local</div>
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <span>Login</span>
            <span className="mono text-mute">v1.0.0</span>
          </div>
          <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Email</label>
              <input
                data-testid="login-email"
                className="field mt-2 mono"
                type="text"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@factory.local"
                required
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Password</label>
              <input
                data-testid="login-password"
                className="field mt-2 mono"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div data-testid="login-error" className="chip chip-danger self-start">
                {error}
              </div>
            )}
            <button
              type="submit"
              data-testid="login-submit"
              className="btn btn-primary mt-2"
              disabled={busy}
            >
              {busy ? "SIGNING IN…" : "SIGN IN"}
            </button>
            <div className="text-[10px] text-mute mono">
              LAN deployment · No cloud dependency
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
