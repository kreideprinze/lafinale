import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { FilterProvider } from "./contexts/FilterContext";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import ControlRoomPage from "./pages/ControlRoomPage";
import BreakdownsPage from "./pages/BreakdownsPage";
import WorkOrderQueuePage from "./pages/WorkOrderQueuePage";
import WorkOrderDetailPage from "./pages/WorkOrderDetailPage";
import MachineDetailPage from "./pages/MachineDetailPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TimelineReplayPage from "./pages/TimelineReplayPage";
import RuntimePage from "./pages/RuntimePage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminPage from "./pages/AdminPage";
import { Toaster } from "sonner";

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white mono text-xs tracking-[0.2em]">
        LOADING…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Shell({ children }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <BrowserRouter>
          <Toaster theme="dark" position="top-right" />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><Shell><ControlRoomPage /></Shell></RequireAuth>} />
            <Route path="/breakdowns" element={<RequireAuth><Shell><BreakdownsPage /></Shell></RequireAuth>} />
            <Route path="/work-orders" element={<RequireAuth roles={["admin", "technician"]}><Shell><WorkOrderQueuePage /></Shell></RequireAuth>} />
            <Route path="/work-orders/:id" element={<RequireAuth><Shell><WorkOrderDetailPage /></Shell></RequireAuth>} />
            <Route path="/machine/:id" element={<RequireAuth><Shell><MachineDetailPage /></Shell></RequireAuth>} />
            <Route path="/analytics" element={<RequireAuth roles={["admin", "technician"]}><Shell><AnalyticsPage /></Shell></RequireAuth>} />
            <Route path="/timeline" element={<RequireAuth roles={["admin", "technician"]}><Shell><TimelineReplayPage /></Shell></RequireAuth>} />
            <Route path="/runtime" element={<RequireAuth roles={["admin"]}><Shell><RuntimePage /></Shell></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><Shell><NotificationsPage /></Shell></RequireAuth>} />
            <Route path="/admin/*" element={<RequireAuth roles={["admin"]}><Shell><AdminPage /></Shell></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </AuthProvider>
  );
}
