import React, { useState } from "react";
import { useFilters, PRESETS } from "../contexts/FilterContext";
import { X, Calendar, ChevronDown, Filter } from "lucide-react";

export default function GlobalFilterBar() {
  const f = useFilters();
  const [customOpen, setCustomOpen] = useState(false);

  const presetLabel = PRESETS.find((p) => p.v === f.preset)?.label || "CUSTOM";
  const fromShort = f.from ? f.from.slice(0, 10) : "—";
  const toShort = f.to ? f.to.slice(0, 10) : "—";

  return (
    <div
      className="global-filter-bar"
      data-testid="global-filter-bar"
    >
      {/* Date preset dropdown */}
      <FilterCell label="RANGE" testid="flt-range-preset">
        <select
          className="filter-select"
          value={f.preset || "last_30_days"}
          onChange={(e) => f.applyPreset(e.target.value)}
          data-testid="flt-preset-select"
        >
          {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
      </FilterCell>

      {/* Date range display + custom picker */}
      <div className="filter-cell filter-cell-dates">
        <Calendar size={11} className="text-mute" />
        <button
          className="filter-daterange mono"
          onClick={() => setCustomOpen(!customOpen)}
          data-testid="flt-daterange-toggle"
        >
          <span>{fromShort}</span>
          <span className="text-mute mx-2">→</span>
          <span>{toShort}</span>
          <ChevronDown size={10} className="ml-2 text-mute" />
        </button>
        {customOpen && (
          <div className="custom-daterange panel" data-testid="flt-custom-daterange">
            <div className="p-3 flex flex-col gap-2">
              <label className="text-[9px] text-mute tracking-[0.15em] uppercase">FROM</label>
              <input
                type="date"
                className="field mono"
                data-testid="flt-from"
                value={f.from ? f.from.slice(0, 10) : ""}
                onChange={(e) => {
                  const from = new Date(e.target.value + "T00:00:00").toISOString();
                  f.setDates(from, f.to);
                }}
              />
              <label className="text-[9px] text-mute tracking-[0.15em] uppercase">TO</label>
              <input
                type="date"
                className="field mono"
                data-testid="flt-to"
                value={f.to ? f.to.slice(0, 10) : ""}
                onChange={(e) => {
                  const to = new Date(e.target.value + "T23:59:59").toISOString();
                  f.setDates(f.from, to);
                }}
              />
              <button
                className="btn btn-primary mt-2"
                onClick={() => setCustomOpen(false)}
                data-testid="flt-custom-apply"
              >APPLY</button>
            </div>
          </div>
        )}
      </div>

      <FilterCell label="DEPT" testid="flt-dept-cell">
        <select
          className="filter-select"
          value={f.department || ""}
          onChange={(e) => f.setDepartment(e.target.value)}
          data-testid="flt-dept-select"
        >
          <option value="">ALL DEPTS</option>
          {f.departments.map((d) => (
            <option key={d.code} value={d.code}>{d.name.toUpperCase()}</option>
          ))}
        </select>
      </FilterCell>

      <FilterCell label="AREA" testid="flt-line-cell">
        <select
          className="filter-select"
          value={f.line_id || ""}
          onChange={(e) => f.setLine(e.target.value)}
          data-testid="flt-line-select"
        >
          <option value="">ALL AREAS</option>
          {f.linesInScope.map((l) => (
            <option key={l.id} value={l.id}>{l.code}</option>
          ))}
        </select>
      </FilterCell>

      <FilterCell label="MACHINE" testid="flt-machine-cell">
        <select
          className="filter-select"
          value={f.machine_id || ""}
          onChange={(e) => f.setMachine(e.target.value)}
          data-testid="flt-machine-select"
        >
          <option value="">ALL MACHINES</option>
          {f.machinesInScope.map((m) => (
            <option key={m.id} value={m.id}>{m.code}</option>
          ))}
        </select>
      </FilterCell>

      <FilterCell label="FAILURE MODE" testid="flt-mode-cell">
        <select
          className="filter-select"
          value={f.failure_mode_id || ""}
          onChange={(e) => f.setFailureMode(e.target.value)}
          data-testid="flt-mode-select"
        >
          <option value="">ALL MODES</option>
          {f.failureModes.map((fm) => (
            <option key={fm.id} value={fm.id}>{fm.category?.toUpperCase()} · {fm.name}</option>
          ))}
        </select>
      </FilterCell>

      <FilterCell label="TECHNICIAN" testid="flt-tech-cell">
        <select
          className="filter-select"
          value={f.technician_id || ""}
          onChange={(e) => f.setTechnician(e.target.value)}
          data-testid="flt-tech-select"
        >
          <option value="">ALL TECHNICIANS</option>
          {f.technicians.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
      </FilterCell>

      <div className="flex-1" />

      {/* Active filter badge */}
      <div className="flex items-center gap-2 mr-3" data-testid="flt-active-summary">
        <Filter size={12} className="text-mute" />
        <span className="text-[10px] tracking-[0.15em] text-mute uppercase">ACTIVE</span>
        <span
          className={`filter-count-badge ${f.activeCount > 0 ? "on" : ""}`}
          data-testid="flt-active-count"
        >
          {f.activeCount}
        </span>
      </div>
      <button
        className="btn"
        onClick={f.clear}
        data-testid="flt-clear"
        disabled={f.activeCount === 0}
        style={{ padding: "4px 12px" }}
      >
        <X size={11} className="inline mr-1" />
        CLEAR
      </button>
    </div>
  );
}

function FilterCell({ label, children, testid }) {
  return (
    <div className="filter-cell" data-testid={testid}>
      <span className="filter-cell-label">{label}</span>
      {children}
    </div>
  );
}
