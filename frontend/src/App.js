import React, { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import LandingPage from "./components/LandingPage";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import HITLDashboard from "./components/HITLDashboard";
import Settings from "./components/Settings";
import "./index.css";

export const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND}/api`;

const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("hl_user") || "null"); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("hl_token") || null);
  const login = (tok, usr) => {
    localStorage.setItem("hl_token", tok);
    localStorage.setItem("hl_user", JSON.stringify(usr));
    setToken(tok); setUser(usr);
  };
  const logout = () => {
    localStorage.removeItem("hl_token"); localStorage.removeItem("hl_user");
    setToken(null); setUser(null);
  };
  return <AuthCtx.Provider value={{ user, token, login, logout, authed: !!token }}>{children}</AuthCtx.Provider>;
}

function Protected({ children }) {
  const { authed } = useAuth();
  return authed ? children : <Navigate to="/login" replace />;
}

// ── Nav icons ─────────────────────────────────────────────────────────────────
const NavIcons = {
  grid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  menu: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
};

function SidebarContent({ onClose }) {
  const location = useLocation();
  const { logout, user } = useAuth();
  const nav = [
    { path: "/dashboard", icon: "grid", label: "Overview" },
    { path: "/hitl", icon: "shield", label: "HITL Review" },
    { path: "/settings", icon: "settings", label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Logo */}
      <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/></svg>
          </div>
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, color: "#fff", fontSize: 15 }}>HumanLayer</span>
        </Link>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4 }}>
            {NavIcons.close}
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {nav.map(n => {
          const active = location.pathname === n.path;
          return (
            <Link key={n.path} to={n.path} onClick={onClose || undefined}
              data-testid={`nav-${n.label.toLowerCase().replace(" ", "-")}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10,
                color: active ? "#fff" : "#94a3b8",
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                borderLeft: `2px solid ${active ? "#6366f1" : "transparent"}`,
                textDecoration: "none", fontSize: 14, fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
              }}>
              {NavIcons[n.icon]}
              {n.label}
              {n.path === "/hitl" && active && (
                <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 6px #f59e0b" }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,rgba(99,102,241,0.3),rgba(14,165,233,0.2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#818cf8", flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || "User"}</p>
            <p style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email || ""}</p>
          </div>
          <button data-testid="logout-btn" onClick={logout}
            title="Sign out"
            style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", transition: "color 0.2s", flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "#f43f5e"}
            onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#02040a" }}>
      {/* Desktop sidebar */}
      <aside style={{
        position: "fixed", left: 0, top: 0, height: "100%", width: 220, zIndex: 40,
        background: "rgba(8,8,15,0.97)", backdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "none",
      }} className="hl-sidebar-desktop">
        <SidebarContent />
      </aside>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 45, backdropFilter: "blur(4px)" }} />
      )}

      {/* Mobile sidebar */}
      <aside style={{
        position: "fixed", left: 0, top: 0, height: "100%", width: 260, zIndex: 50,
        background: "rgba(8,8,15,0.99)", backdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", flexDirection: "column",
      }} className="hl-sidebar-mobile">
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minHeight: "100vh", background: "#02040a", display: "flex", flexDirection: "column" }}
        className="hl-main-content">
        {/* Mobile top bar */}
        <div className="hl-topbar" style={{
          display: "none", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(8,8,15,0.95)", backdropFilter: "blur(20px)",
          position: "sticky", top: 0, zIndex: 30,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setMobileOpen(true)}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex" }}>
              {NavIcons.menu}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/></svg>
              </div>
              <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, color: "#fff", fontSize: 14 }}>HumanLayer</span>
            </div>
          </div>
        </div>
        {children}
      </main>

      <style>{`
        @media (min-width: 768px) {
          .hl-sidebar-desktop { display: flex !important; flex-direction: column; }
          .hl-sidebar-mobile { display: none !important; }
          .hl-main-content { margin-left: 220px; }
          .hl-topbar { display: none !important; }
        }
        @media (max-width: 767px) {
          .hl-topbar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/dashboard" element={<Protected><AppLayout><Dashboard /></AppLayout></Protected>} />
          <Route path="/hitl" element={<Protected><AppLayout><HITLDashboard /></AppLayout></Protected>} />
          <Route path="/settings" element={<Protected><AppLayout><Settings /></AppLayout></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
