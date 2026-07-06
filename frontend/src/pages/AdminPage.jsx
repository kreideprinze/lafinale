import React from "react";
import { Link, useLocation, Routes, Route } from "react-router-dom";
import UsersPage from "./admin/UsersPage";
import MachinesPage from "./admin/MachinesPage";
import ImportPage from "./admin/ImportPage";
import RuntimeImportPage from "./admin/RuntimeImportPage";
import DepartmentsPage from "./admin/DepartmentsPage";

const TABS = [
  { to: "/admin/departments", label: "Departments" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/machines", label: "Machines" },
  { to: "/admin/import", label: "Import Excel" },
  { to: "/admin/runtime-import", label: "Import Runtime" },
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
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="runtime-import" element={<RuntimeImportPage />} />
        <Route index element={<DepartmentsPage />} />
      </Routes>
    </div>
  );
}
