import React, { useEffect, useState } from "react";
import { BACKEND_URL, api } from "../lib/api";
import { Zap } from "lucide-react";

/**
 * Brand — renders the currently configured logo + company name.
 *
 * If the admin has uploaded a custom logo, we display it from
 * /api/settings/branding/logo (with a cache-buster keyed to logo_updated_at).
 * Otherwise we fall back to the lightning bolt.
 *
 * Loads branding once, then listens for a global "branding.updated" event so
 * the shell + login page refresh instantly after the admin saves changes.
 */
export default function Brand({ compact = false, iconSize = 16, showName = true }) {
  const [b, setB] = useState({ company_name: "Factory CMMS", has_logo: false, logo_updated_at: null });
  const [imgFailed, setImgFailed] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/settings/branding");
      setB(r.data.data);
      setImgFailed(false);
    } catch { /* keep defaults */ }
  };

  useEffect(() => {
    load();
    const onEvt = () => load();
    window.addEventListener("branding.updated", onEvt);
    return () => window.removeEventListener("branding.updated", onEvt);
  }, []);

  const showLogo = b.has_logo && !imgFailed;
  const logoUrl = showLogo
    ? `${BACKEND_URL}/api/settings/branding/logo?v=${encodeURIComponent(b.logo_updated_at || "0")}`
    : null;

  return (
    <div className="flex items-center gap-2" data-testid="brand-title">
      {showLogo ? (
        <img
          src={logoUrl}
          alt=""
          data-testid="brand-logo-img"
          onError={() => setImgFailed(true)}
          style={{ height: iconSize + 6, width: "auto", maxWidth: 42, objectFit: "contain" }}
        />
      ) : (
        <Zap size={iconSize} className="text-data" data-testid="brand-logo-fallback" />
      )}
      {showName && (
        <span
          className="mono tracking-[0.2em]"
          style={{ fontSize: compact ? 12 : 14 }}
          data-testid="brand-company-name"
        >
          {(b.company_name || "Factory CMMS").toUpperCase()}
        </span>
      )}
    </div>
  );
}

// Convenience: trigger every Brand instance to reload (call after saving branding).
export function refreshBrand() {
  window.dispatchEvent(new Event("branding.updated"));
}
