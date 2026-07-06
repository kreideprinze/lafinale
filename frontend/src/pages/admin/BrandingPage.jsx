import React, { useEffect, useState } from "react";
import { api, formatApiError, BACKEND_URL } from "../../lib/api";
import { refreshBrand } from "../../components/Brand";

/**
 * Admin > Branding — configure company logo + name + accent color.
 */
export default function BrandingPage() {
  const [doc, setDoc] = useState(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = async () => {
    const r = await api.get("/settings/branding");
    setDoc(r.data.data);
    setName(r.data.data.company_name || "");
    setColor(r.data.data.primary_color || "#22d3ee");
  };

  useEffect(() => { load(); }, []);

  const saveMeta = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const fd = new FormData();
      fd.append("company_name", name);
      fd.append("primary_color", color);
      await api.put("/settings/branding", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setOk("Branding saved");
      refreshBrand();
      load();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const uploadLogo = async () => {
    if (!file) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/branding/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setOk("Logo uploaded");
      setFile(null);
      refreshBrand();
      load();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  const deleteLogo = async () => {
    if (!window.confirm("Remove the current company logo?")) return;
    setBusy(true); setErr(""); setOk("");
    try {
      await api.delete("/settings/branding/logo");
      setOk("Logo removed");
      refreshBrand();
      load();
    } catch (ex) {
      setErr(formatApiError(ex?.response?.data?.detail) || ex.message);
    } finally { setBusy(false); }
  };

  if (!doc) return <div className="p-6 text-mute mono text-xs">Loading…</div>;

  const logoUrl = doc.has_logo
    ? `${BACKEND_URL}/api/settings/branding/logo?v=${encodeURIComponent(doc.logo_updated_at || "0")}`
    : null;

  return (
    <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="panel">
        <div className="panel-hd"><span>COMPANY IDENTITY</span></div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Company Name</label>
            <input
              className="field mt-2 mono"
              data-testid="brand-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.15em] text-mute uppercase">Primary Color (hex)</label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                className="field mono"
                data-testid="brand-color-input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: 60, height: 34, padding: 2 }}
              />
              <input
                className="field mono flex-1"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={9}
              />
            </div>
          </div>
          <button
            className="btn btn-primary self-start"
            onClick={saveMeta}
            disabled={busy}
            data-testid="brand-save"
          >
            {busy ? "…" : "SAVE IDENTITY"}
          </button>
          {ok && <div className="chip chip-ok self-start" data-testid="brand-ok">{ok}</div>}
          {err && <div className="chip chip-danger self-start" data-testid="brand-err">{err}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd"><span>COMPANY LOGO</span></div>
        <div className="p-5 flex flex-col gap-4">
          <div
            style={{ height: 120, border: "1px dashed var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)" }}
            data-testid="brand-logo-preview"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="logo" style={{ maxHeight: 100, maxWidth: "80%", objectFit: "contain" }} />
            ) : (
              <div className="text-mute text-xs mono tracking-[0.2em] uppercase">No custom logo — using default</div>
            )}
          </div>

          <div className="text-[10px] text-mute mono leading-relaxed">
            Accepted formats: PNG, JPG, SVG, WEBP.  Max 512 KB.<br />
            Recommended: transparent PNG, height ≥ 40 px, aspect ratio landscape ~3:1.
          </div>

          <input
            type="file"
            accept=".png,.jpg,.jpeg,.svg,.webp"
            className="text-dim"
            data-testid="brand-logo-file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={uploadLogo}
              disabled={!file || busy}
              data-testid="brand-logo-upload"
            >
              {busy ? "…" : "UPLOAD LOGO"}
            </button>
            {doc.has_logo && (
              <button
                className="btn btn-danger"
                onClick={deleteLogo}
                disabled={busy}
                data-testid="brand-logo-delete"
              >
                REMOVE LOGO
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
