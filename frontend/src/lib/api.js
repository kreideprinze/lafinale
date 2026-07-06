import axios from "axios";

// Empty REACT_APP_BACKEND_URL = same-origin (LAN deployment via nginx).
const RAW = (process.env.REACT_APP_BACKEND_URL || "").trim();
export const BACKEND_URL = RAW.replace(/\/+$/, ""); // strip trailing /
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

const TOKEN_KEY = "cmms.access_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: API,
  withCredentials: false,
});

api.interceptors.request.use((cfg) => {
  const tok = getToken();
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(" ");
  if (typeof detail === "object" && detail.message) return detail.message;
  return String(detail);
}
