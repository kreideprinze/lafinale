import { BACKEND_URL, getToken } from "./api";

/**
 * Simple JWT-authenticated WebSocket client with auto-reconnect.
 * Fires listeners for events + connection state.
 */
class LiveSocket {
  constructor() {
    this.ws = null;
    this.subs = new Set();
    this.listeners = new Set();
    this.stateListeners = new Set();
    this.reconnectMs = 1000;
    this.desired = false;
  }

  _wsUrl() {
    // If BACKEND_URL is empty, use same-origin (LAN deployment through nginx).
    let host, scheme;
    if (BACKEND_URL) {
      const httpUrl = new URL(BACKEND_URL);
      scheme = httpUrl.protocol === "https:" ? "wss" : "ws";
      host = httpUrl.host;
    } else {
      scheme = window.location.protocol === "https:" ? "wss" : "ws";
      host = window.location.host;
    }
    return `${scheme}://${host}/api/ws?token=${encodeURIComponent(getToken() || "")}`;
  }

  connect() {
    this.desired = true;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    try {
      this.ws = new WebSocket(this._wsUrl());
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectMs = 1000;
      this._emitState("open");
      if (this.subs.size > 0) {
        this._send({ op: "subscribe", channels: Array.from(this.subs) });
      }
    };
    this.ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data);
        this.listeners.forEach((fn) => fn(data));
      } catch {
        /* ignore parse error */
      }
    };
    this.ws.onclose = () => {
      this._emitState("closed");
      if (this.desired) this._scheduleReconnect();
    };
    this.ws.onerror = () => {
      try { this.ws.close(); } catch { /* noop */ }
    };
  }

  disconnect() {
    this.desired = false;
    if (this.ws) { try { this.ws.close(); } catch { /* noop */ } }
  }

  _scheduleReconnect() {
    setTimeout(() => this.connect(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, 30000);
  }

  _send(payload) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  _emitState(s) {
    this.stateListeners.forEach((fn) => fn(s));
  }

  subscribe(channel) {
    if (this.subs.has(channel)) return;
    this.subs.add(channel);
    this._send({ op: "subscribe", channels: [channel] });
  }

  unsubscribe(channel) {
    if (!this.subs.has(channel)) return;
    this.subs.delete(channel);
    this._send({ op: "unsubscribe", channels: [channel] });
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }
}

export const live = new LiveSocket();
