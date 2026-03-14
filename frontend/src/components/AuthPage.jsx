import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, API } from "../App";
import { motion } from "framer-motion";

export default function AuthPage({ mode }) {
  const [form, setForm] = useState({ email: "", password: "", name: "", org_name: "" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const isLogin = mode === "login";

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await fetch(`${API}${isLogin ? "/auth/login" : "/auth/signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Request failed");
      login(data.token, data.user);
      toast.success(isLogin ? "Welcome back!" : "Account created!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#02040a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow blobs */}
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 400, background: "radial-gradient(ellipse at center, rgba(99,102,241,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "5%", width: 300, height: 300, background: "radial-gradient(ellipse at center, rgba(14,165,233,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 1 }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/>
            </svg>
          </div>
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, color: "#fff", fontSize: 20 }}>HumanLayer</span>
        </div>

        {/* Card */}
        <div style={{
          background: "#0e0e18",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 0 0 1px rgba(99,102,241,0.05), 0 25px 50px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.06)",
        }}>
          {/* Heading */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "Space Grotesk", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              {isLogin ? "Welcome back" : "Create your account"}
            </h1>
            <p style={{ fontSize: 14, color: "#64748b" }}>
              {isLogin ? "Sign in to your HumanLayer dashboard" : "Traceability, auditability, and human oversight for AI commerce agents"}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!isLogin && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.02em" }}>Full name</label>
                  <input
                    data-testid="name-input"
                    type="text"
                    required
                    placeholder="John Doe"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.02em" }}>Organization name</label>
                  <input
                    data-testid="org-input"
                    type="text"
                    required
                    placeholder="Acme AI"
                    value={form.org_name}
                    onChange={e => setForm({ ...form, org_name: e.target.value })}
                  />
                </div>
              </>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.02em" }}>Email address</label>
              <input
                data-testid="email-input"
                type="email"
                required
                placeholder="you@company.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.02em" }}>Password</label>
              <input
                data-testid="password-input"
                type="password"
                required
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />

            <button
              data-testid="auth-submit-btn"
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: loading ? "#4338ca" : "linear-gradient(135deg,#6366f1,#4f46e5)",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.75 : 1,
                boxShadow: "0 0 24px rgba(99,102,241,0.35)",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "Space Grotesk",
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.boxShadow = "0 0 40px rgba(99,102,241,0.55)"; e.currentTarget.style.transform = "translateY(-1px)"; }}}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 24px rgba(99,102,241,0.35)"; e.currentTarget.style.transform = "none"; }}
            >
              {loading && (
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
              )}
              {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        {/* Switch link */}
        <p style={{ textAlign: "center", fontSize: 14, color: "#475569", marginTop: 20 }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <Link to={isLogin ? "/signup" : "/login"} data-testid="auth-switch-link"
            style={{ color: "#818cf8", fontWeight: 600, textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={e => e.target.style.color = "#a5b4fc"}
            onMouseLeave={e => e.target.style.color = "#818cf8"}>
            {isLogin ? "Sign up free" : "Sign in"}
          </Link>
        </p>

        {/* Demo hint */}
        <p style={{ textAlign: "center", fontSize: 12, color: "#1e293b", marginTop: 12, fontFamily: "JetBrains Mono" }}>
          Demo: demo@humanlayer.dev · demo1234
        </p>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
