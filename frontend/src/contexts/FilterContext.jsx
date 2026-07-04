import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../lib/api";

/**
 * Global Analytics Context — persistent filter state used by all modules.
 * Persists to localStorage so it survives navigation and page reloads.
 */
const KEY = "cmms.filters.v1";

const DEFAULT_STATE = {
  preset: "last_30_days",
  from: null,      // ISO string
  to: null,        // ISO string
  line_id: null,
  machine_id: null,
  failure_mode_id: null,
  technician_id: null,
};

const FilterCtx = createContext(null);

function loadInitial() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...s };
    }
  } catch { /* noop */ }
  return { ...DEFAULT_STATE, ...computeRange("last_30_days") };
}

// Compute [from, to] ISO strings for a given preset.
export function computeRange(preset) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  let from, to;
  switch (preset) {
    case "today":
      from = startOfDay(now); to = endOfDay(now); break;
    case "yesterday": {
      const y = new Date(now.getTime() - 86400_000);
      from = startOfDay(y); to = endOfDay(y); break;
    }
    case "last_7_days":
      to = endOfDay(now); from = startOfDay(new Date(now.getTime() - 6 * 86400_000)); break;
    case "last_30_days":
      to = endOfDay(now); from = startOfDay(new Date(now.getTime() - 29 * 86400_000)); break;
    case "this_month":
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      to = endOfDay(now); break;
    case "previous_month": {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0);
      to = endOfDay(now); break;
    }
    case "this_year":
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      to = endOfDay(now); break;
    case "all_time":
      from = new Date(2020, 0, 1, 0, 0, 0);
      to = endOfDay(now);
      break;
    default:
      to = endOfDay(now); from = startOfDay(new Date(now.getTime() - 29 * 86400_000));
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export const PRESETS = [
  { v: "today", label: "TODAY" },
  { v: "yesterday", label: "YESTERDAY" },
  { v: "last_7_days", label: "LAST 7 DAYS" },
  { v: "last_30_days", label: "LAST 30 DAYS" },
  { v: "this_month", label: "THIS MONTH" },
  { v: "previous_month", label: "PREVIOUS MONTH" },
  { v: "this_quarter", label: "THIS QUARTER" },
  { v: "this_year", label: "THIS YEAR" },
  { v: "all_time", label: "ALL TIME" },
  { v: "custom", label: "CUSTOM" },
];

export function FilterProvider({ children }) {
  const [state, setState] = useState(loadInitial);
  const [lines, setLines] = useState([]);
  const [machines, setMachines] = useState([]);
  const [failureModes, setFailureModes] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
  }, [state]);

  // Load master lists once
  useEffect(() => {
    api.get("/lines").then((r) => setLines(r.data.data)).catch(() => {});
    api.get("/machines").then((r) => setMachines(r.data.data)).catch(() => {});
    api.get("/failure-modes").then((r) => setFailureModes(r.data.data)).catch(() => {});
    api.get("/users/technicians").then((r) => setTechnicians(r.data.data)).catch(() => {});
  }, []);

  const applyPreset = useCallback((preset) => {
    if (preset === "custom") {
      setState((s) => ({ ...s, preset }));
      return;
    }
    const { from, to } = computeRange(preset);
    setState((s) => ({ ...s, preset, from, to }));
  }, []);

  const setLine = useCallback((line_id) => {
    // Changing line clears machine to avoid stale scope
    setState((s) => ({ ...s, line_id: line_id || null,
      machine_id: line_id !== s.line_id ? null : s.machine_id }));
  }, []);
  const setMachine = useCallback((machine_id) => setState((s) => ({ ...s, machine_id: machine_id || null })), []);
  const setFailureMode = useCallback((id) => setState((s) => ({ ...s, failure_mode_id: id || null })), []);
  const setTechnician = useCallback((id) => setState((s) => ({ ...s, technician_id: id || null })), []);
  const setDates = useCallback((from, to) => setState((s) => ({ ...s, from, to, preset: "custom" })), []);

  const clear = useCallback(() => {
    const r = computeRange("last_30_days");
    setState({ ...DEFAULT_STATE, ...r });
  }, []);

  // Machines filtered to the active line (for the Machine dropdown)
  const machinesInScope = useMemo(() => {
    let list = machines.filter((m) => !m.is_packing && m.kind !== "stage");
    if (state.line_id) list = list.filter((m) => m.line_id === state.line_id);
    return list;
  }, [machines, state.line_id]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (state.line_id) n++;
    if (state.machine_id) n++;
    if (state.failure_mode_id) n++;
    if (state.technician_id) n++;
    // Count date range as "active" only if not the default 30-day preset
    if (state.preset && state.preset !== "last_30_days") n++;
    return n;
  }, [state]);

  const value = {
    ...state,
    lines,
    machines,
    machinesInScope,
    failureModes,
    technicians,
    setLine, setMachine, setFailureMode, setTechnician,
    setDates, applyPreset, clear,
    activeCount,
  };

  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export function useFilters() {
  return useContext(FilterCtx);
}
