import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "../lib/api";
import { live } from "../lib/ws";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, obj=logged in
  const [loading, setLoading] = useState(true);

  const check = async () => {
    if (!getToken()) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const r = await api.get("/auth/me");
      setUser(r.data.data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { check(); }, []);

  useEffect(() => {
    // Connect WS as soon as we know whether the user is authed or not (loading finished).
    // Authenticated users get user/role channels; guests get the public channel.
    if (loading) return;
    live.connect();
    return () => live.disconnect();
  }, [loading, user && user.id]);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    setToken(r.data.data.access_token);
    setUser(r.data.data.user);
    return r.data.data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* noop */ }
    setToken(null);
    live.disconnect();
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh: check }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
