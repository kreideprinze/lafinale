import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", full_name: "", role: "operator", password: "" });
  const [err, setErr] = useState("");

  const load = async () => {
    const r = await api.get("/users");
    setUsers(r.data.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await api.post("/auth/register", form);
      setForm({ email: "", full_name: "", role: "operator", password: "" });
      await load();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    }
  };

  const toggle = async (u) => {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await load();
  };

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "1fr 2fr" }}>
      <div className="panel">
        <div className="panel-hd"><span>CREATE USER</span></div>
        <form onSubmit={submit} className="p-4 flex flex-col gap-3">
          <input className="field mono" placeholder="Email" data-testid="usr-email"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="field" placeholder="Full name" data-testid="usr-name"
            value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          <select className="field mono" data-testid="usr-role"
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="operator">operator</option>
            <option value="technician">technician</option>
            <option value="admin">admin</option>
          </select>
          <input type="password" className="field mono" placeholder="Password" data-testid="usr-pw"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {err && <div className="chip chip-danger" data-testid="usr-error">{err}</div>}
          <button className="btn btn-primary" type="submit" data-testid="usr-create">CREATE</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>ALL USERS</span></div>
        <table className="tbl">
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-testid={`usr-row-${u.email}`}>
                <td className="mono">{u.email}</td>
                <td>{u.full_name}</td>
                <td className="mono">{u.role}</td>
                <td className={`mono ${u.active ? "text-ok" : "text-mute"}`}>{u.active ? "yes" : "no"}</td>
                <td>
                  <button className="btn" style={{ padding: "4px 10px" }} onClick={() => toggle(u)} data-testid={`usr-toggle-${u.email}`}>
                    {u.active ? "DEACTIVATE" : "ACTIVATE"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
