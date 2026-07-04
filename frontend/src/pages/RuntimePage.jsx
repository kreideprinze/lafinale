import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { fmtPct } from "../lib/format";

export default function RuntimePage() {
  const [lines, setLines] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    line_id: "", date: new Date().toISOString().slice(0, 10),
    calendar_hours: 24, dark_hours: 0, run_time_hours: 22,
    notes: "",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api.get("/lines").then((r) => {
      setLines(r.data.data);
      if (r.data.data.length > 0) setForm(f => ({ ...f, line_id: r.data.data[0].id }));
    });
    load();
  }, []);

  const load = async () => {
    const r = await api.get("/runtime?limit=200");
    setItems(r.data.data);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setOk("");
    try {
      await api.post("/runtime", {
        line_id: form.line_id, date: form.date,
        calendar_hours: Number(form.calendar_hours),
        dark_hours: Number(form.dark_hours),
        run_time_hours: Number(form.run_time_hours),
        notes: form.notes || null,
      });
      setOk("Runtime saved."); await load();
    } catch (e) {
      setErr(formatApiError(e?.response?.data?.detail) || e.message);
    }
  };

  const lineName = (id) => lines.find(l => l.id === id)?.code || id?.slice(0, 6);

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "1fr 2fr" }}>
      <div className="panel">
        <div className="panel-hd"><span>PLANT RUNTIME · ENTRY</span></div>
        <form onSubmit={submit} className="p-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Line</label>
            <select className="field mt-1 mono" data-testid="rt-line"
              value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })}>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Date</label>
            <input type="date" className="field mt-1 mono" data-testid="rt-date"
              value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Calendar (hrs)</label>
              <input type="number" step="0.1" className="field mt-1 mono" data-testid="rt-cal"
                value={form.calendar_hours} onChange={(e) => setForm({ ...form, calendar_hours: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Dark (hrs)</label>
              <input type="number" step="0.1" className="field mt-1 mono" data-testid="rt-dark"
                value={form.dark_hours} onChange={(e) => setForm({ ...form, dark_hours: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Run Time (hrs)</label>
              <input type="number" step="0.1" className="field mt-1 mono" data-testid="rt-run"
                value={form.run_time_hours} onChange={(e) => setForm({ ...form, run_time_hours: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Notes</label>
            <input className="field mt-1" data-testid="rt-notes"
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {err && <div className="chip chip-danger" data-testid="rt-error">{err}</div>}
          {ok && <div className="chip chip-ok" data-testid="rt-ok">{ok}</div>}
          <button className="btn btn-primary" type="submit" data-testid="rt-save">SAVE / UPSERT</button>
          <div className="text-[10px] text-mute mono">
            Availability calculations use these values.<br />
            Missing entries → &quot;Availability Not Configured&quot;.
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>RECENT ENTRIES</span></div>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <table className="tbl">
            <thead>
              <tr><th>Date</th><th>Line</th><th>Calendar</th><th>Dark</th><th>Run</th><th>Availability</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="text-mute text-center py-6">No entries.</td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id} data-testid={`rt-row-${r.id}`}>
                  <td className="mono">{r.date}</td>
                  <td className="mono">{lineName(r.line_id)}</td>
                  <td className="mono">{r.calendar_hours}h</td>
                  <td className="mono">{r.dark_hours}h</td>
                  <td className="mono">{r.run_time_hours}h</td>
                  <td className="mono">{r.calendar_hours > 0 ? fmtPct(r.run_time_hours / r.calendar_hours) : "—"}</td>
                  <td className="text-dim">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
