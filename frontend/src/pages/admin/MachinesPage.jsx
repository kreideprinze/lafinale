import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";

export default function MachinesPage() {
  const [lines, setLines] = useState([]);
  const [line, setLine] = useState(null);
  const [machines, setMachines] = useState([]);
  const [edit, setEdit] = useState({});
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api.get("/lines").then((r) => {
      setLines(r.data.data);
      if (r.data.data.length > 0) setLine(r.data.data[0]);
    });
  }, []);

  useEffect(() => {
    if (!line) return;
    api.get(`/machines?line_id=${line.id}`).then((r) => setMachines(r.data.data));
  }, [line]);

  const save = async (m) => {
    setErr(""); setOk("");
    const e = edit[m.id] || {};
    try {
      await api.patch(`/machines/${m.id}`, {
        sap_code: e.sap_code ?? m.sap_code,
        machine_type: e.machine_type ?? m.machine_type,
        criticality_manual: e.criticality_manual !== undefined ? Number(e.criticality_manual) || null : m.criticality_manual,
      });
      setOk(`Saved ${m.code}`);
      const r = await api.get(`/machines?line_id=${line.id}`);
      setMachines(r.data.data);
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="mono text-sm tracking-[0.2em]">MACHINE ASSET REGISTER</h2>
        <div className="flex gap-2 items-center">
          {ok && <div className="chip chip-ok" data-testid="mch-ok">{ok}</div>}
          {err && <div className="chip chip-danger" data-testid="mch-err">{err}</div>}
          <select className="field mono" style={{ width: 260 }} value={line?.id || ""} data-testid="mch-line"
            onChange={(e) => setLine(lines.find((l) => l.id === e.target.value))}>
            {lines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </div>
      </div>
      <div className="panel">
        <table className="tbl" data-testid="mch-table">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>SAP Code</th><th>Type</th>
              <th>Status</th><th>Criticality</th><th>Kind</th><th>Packing</th><th></th>
            </tr>
          </thead>
          <tbody>
            {machines.map((m) => {
              const e = edit[m.id] || {};
              return (
                <tr key={m.id} data-testid={`mch-row-${m.code}`}>
                  <td className="mono">{m.code}</td>
                  <td>{m.name}</td>
                  <td>
                    <input className="field mono" style={{ padding: 4, width: 140 }}
                      data-testid={`mch-sap-${m.code}`}
                      value={e.sap_code ?? m.sap_code ?? ""}
                      onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, sap_code: ev.target.value } })} />
                  </td>
                  <td>
                    <select className="field mono" style={{ padding: 4 }}
                      data-testid={`mch-type-${m.code}`}
                      value={e.machine_type ?? m.machine_type ?? "general"}
                      onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, machine_type: ev.target.value } })}>
                      {["mechanical", "electrical", "process", "instrumentation", "utility", "conveyor", "terminator", "general"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="mono">{m.status}</td>
                  <td>
                    <input type="number" min="1" max="10" className="field mono" style={{ padding: 4, width: 60 }}
                      data-testid={`mch-crit-${m.code}`}
                      value={e.criticality_manual ?? m.criticality_manual ?? ""}
                      onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, criticality_manual: ev.target.value } })} />
                  </td>
                  <td className="mono text-mute">{m.kind}</td>
                  <td className={`mono ${m.is_packing ? "text-mute" : ""}`}>{m.is_packing ? "yes" : "—"}</td>
                  <td>
                    <button className="btn" style={{ padding: "4px 10px" }}
                      data-testid={`mch-save-${m.code}`} onClick={() => save(m)}>SAVE</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
