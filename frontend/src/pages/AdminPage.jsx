import React, { useState } from "react";
import { Link, useLocation, Routes, Route } from "react-router-dom";
import UsersPage from "./admin/UsersPage";
import MachinesPage from "./admin/MachinesPage";
import ImportPage from "./admin/ImportPage";

const TABS = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/machines", label: "Machines" },
  { to: "/admin/import", label: "Import Excel" },
];

export default function AdminPage() {
  const loc = useLocation();
  return (
    <div>
      <div className="tab-strip">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} data-testid={`admin-tab-${t.label.toLowerCase().replace(/ /g, "-")}`}
            className={`tab ${loc.pathname.startsWith(t.to) ? "active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>
      <Routes>
        <Route path="users" element={<UsersPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route index element={<UsersPage />} />
      </Routes>
    </div>
  );
}
