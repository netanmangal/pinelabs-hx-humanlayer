import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, API } from "../App";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const EVENT_META = {
  llm_start:    { color: "#0ea5e9", label: "LLM thinking" },
  llm_end:      { color: "#0ea5e9", label: "LLM responded" },
  tool_start:   { color: "#6366f1", label: "Tool called" },
  tool_end:     { color: "#10b981", label: "Tool result" },
  agent_action: { color: "#f59e0b", label: "Decision" },
  agent_finish: { color: "#10b981", label: "Completed" },
  chain_start:  { color: "#475569", label: "Chain start" },
  chain_end:    { color: "#475569", label: "Chain end" },
};

// ── Compact Agent Journey (shown inside HITL card) ────────────────────────────
function AgentJourney({ sessionId, headers, hitlCreatedAt }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetch(`${API}/sessions/${sessionId}/events`, { headers })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        // Only show events BEFORE the HITL request
        const before = hitlCreatedAt
          ? list.filter(e => !e.timestamp || new Date(e.timestamp) <= new Date(hitlCreatedAt))
          : list;
        // Deduplicate and keep meaningful events
        const meaningful = before.filter(e =>
          ["tool_start","tool_end","agent_action","llm_start","llm_end"].includes(e.event_type)
        );
        setEvents(meaningful.slice(-8)); // last 8 events
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <div style={{ margin: "12px 0", borderRadius: 8, background: "#06060e", border: "1px solid rgba(255,255,255,0.05)", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span style={{ fontSize: 10, color: "#475569", fontFamily: "JetBrains Mono", letterSpacing: 0.5 }}>AGENT JOURNEY BEFORE THIS REQUEST</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 0" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 11, color: "#334155" }}>Loading context…</span>
        </div>
      ) : events.length === 0 ? (
        <p style={{ fontSize: 11, color: "#334155", padding: "6px 0" }}>No prior events in this session</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {events.map((evt, i) => {
            const meta = EVENT_META[evt.event_type] || { color: "#475569", label: evt.event_type };
            const isLast = i === events.length - 1;
            const name = evt.data?.name || evt.data?.tool || "";
            const preview = evt.data?.input
              ? (typeof evt.data.input === "string" ? evt.data.input : JSON.stringify(evt.data.input))?.slice(0, 60)
              : evt.data?.output
              ? (typeof evt.data.output === "string" ? evt.data.output : JSON.stringify(evt.data.output))?.slice(0, 60)
              : "";
            return (
              <div key={evt.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", position: "relative", paddingLeft: 18 }}>
                {/* Dot + line */}
                <div style={{ position: "absolute", left: 4, top: 7, width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                {!isLast && <div style={{ position: "absolute", left: 6, top: 13, width: 1, height: "calc(100% + 4px)", background: "rgba(255,255,255,0.04)" }} />}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: meta.color, fontWeight: 500 }}>{meta.label}</span>
                  {name && <span style={{ fontSize: 10, color: "#334155", marginLeft: 6, fontFamily: "JetBrains Mono" }}>{name}</span>}
                  {preview && <div style={{ fontSize: 10, color: "#1e293b", fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}{preview.length >= 60 ? "…" : ""}</div>}
                </div>
                <span style={{ fontSize: 9, color: "#1e293b", fontFamily: "JetBrains Mono", flexShrink: 0 }}>
                  {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                </span>
              </div>
            );
          })}
          {/* HITL point indicator */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 18, marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(245,158,11,0.15)" }}>
            <div style={{ position: "absolute", left: 4, width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 6px #f59e0b", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>⏸ Paused here — awaiting your decision</span>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── HITL Card ─────────────────────────────────────────────────────────────────
function HITLCard({ evt, onApprove, onReject, headers }) {
  const [comment, setComment] = useState("");
  const [action, setAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const isPending = evt.status === "pending";

  const toolStr = JSON.stringify(evt.tool_input || {}, null, 2);
  const borderColor = isPending ? "rgba(245,158,11,0.3)" : evt.status === "approved" ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)";
  const headerBg = isPending ? "rgba(245,158,11,0.05)" : evt.status === "approved" ? "rgba(16,185,129,0.04)" : "rgba(244,63,94,0.04)";

  async function handle(type) {
    setLoading(true); setAction(type);
    try { await (type === "approve" ? onApprove(evt.id, comment) : onReject(evt.id, comment)); }
    finally { setLoading(false); }
  }

  return (
    <motion.div data-testid={`hitl-card-${evt.id}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      style={{ background: "#08080f", border: `1px solid ${borderColor}`, borderRadius: 14, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: headerBg, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isPending && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b", animation: "pulse 1.5s infinite", flexShrink: 0 }} />}
          <div>
            <div style={{ fontFamily: "Space Grotesk", fontSize: 14, fontWeight: 700, color: "#fff" }}>{evt.tool_name}</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2, fontFamily: "JetBrains Mono" }}>
              {evt.created_at ? new Date(evt.created_at).toLocaleString() : ""}
              {evt.session_id && <span style={{ marginLeft: 8, color: "#1e293b" }}>session:{evt.session_id?.slice(0,8)}…</span>}
            </div>
          </div>
        </div>
        <span data-testid={`hitl-status-${evt.id}`} style={{
          fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 600, fontFamily: "JetBrains Mono",
          ...(isPending ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }
            : evt.status === "approved" ? { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }
            : { background: "rgba(244,63,94,0.1)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.2)" }),
        }}>
          {evt.status}
        </span>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Agent Journey Toggle */}
        {evt.session_id && (
          <button onClick={() => setShowContext(s => !s)}
            style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: 0 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5"
              style={{ transition: "transform 0.2s", transform: showContext ? "rotate(90deg)" : "none" }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono" }}>
              {showContext ? "Hide" : "Show"} agent journey ({isPending ? "helps you decide" : "context"})
            </span>
          </button>
        )}
        <AnimatePresence>
          {showContext && evt.session_id && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
              <AgentJourney sessionId={evt.session_id} headers={headers} hitlCreatedAt={evt.created_at} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tool Input */}
        <div style={{ marginBottom: isPending ? 12 : 0 }}>
          <div style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono", marginBottom: 6 }}>TOOL ARGUMENTS</div>
          <pre style={{ fontSize: 12, color: "#82aaff", fontFamily: "JetBrains Mono", background: "#04040a", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 14px", margin: 0, maxHeight: 180, overflow: "auto", lineHeight: 1.6 }}>
            {toolStr}
          </pre>
        </div>

        {/* Decision result */}
        {!isPending && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: evt.status === "approved" ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.06)", border: `1px solid ${evt.status === "approved" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: evt.status === "approved" ? "#10b981" : "#f43f5e" }}>
                {evt.status === "approved" ? "✓ Approved" : "✗ Rejected"}
              </span>
              {evt.decided_at && <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono", marginLeft: 4 }}>{new Date(evt.decided_at).toLocaleTimeString()}</span>}
            </div>
            {evt.decision_comment && <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{evt.decision_comment}</p>}
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea data-testid={`hitl-comment-${evt.id}`} placeholder="Optional comment — explain your decision to the agent…"
              value={comment} onChange={e => setComment(e.target.value)} rows={2}
              style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#94a3b8", fontSize: 12, padding: "8px 12px", fontFamily: "Inter", resize: "none", outline: "none", transition: "border-color 0.2s", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "rgba(99,102,241,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button data-testid={`approve-btn-${evt.id}`} onClick={() => handle("approve")} disabled={loading}
                style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.1)", color: "#10b981", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "rgba(16,185,129,0.2)"; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "rgba(16,185,129,0.1)"; }}>
                {loading && action === "approve" ? <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid #10b981", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                {loading && action === "approve" ? "Approving…" : "Approve"}
              </button>
              <button data-testid={`reject-btn-${evt.id}`} onClick={() => handle("reject")} disabled={loading}
                style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(244,63,94,0.3)", background: "rgba(244,63,94,0.08)", color: "#f43f5e", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "rgba(244,63,94,0.16)"; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "rgba(244,63,94,0.08)"; }}>
                {loading && action === "reject" ? <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid #f43f5e", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                {loading && action === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </motion.div>
  );
}

// ── Main HITL Dashboard ───────────────────────────────────────────────────────
export default function HITLDashboard() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const prevCountRef = useRef(0);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchEvents = useCallback(async () => {
    if (!token) return;
    try {
      const url = filter === "all" ? `${API}/hitl/events?limit=50` : `${API}/hitl/events?status=${filter}&limit=50`;
      const data = await fetch(url, { headers }).then(r => r.json());
      const list = Array.isArray(data) ? data : [];
      const pending = list.filter(e => e.status === "pending").length;
      if (pending > prevCountRef.current && prevCountRef.current >= 0 && pending > 0)
        toast.info(`${pending} pending approval${pending > 1 ? "s" : ""}`, { id: "hitl-notify" });
      prevCountRef.current = pending;
      setEvents(list);
    } catch { } finally { setLoading(false); }
  }, [filter, token]);  // stable deps only — no interval

  useEffect(() => { fetchEvents(); }, [filter, token]);  // fetch once on mount/filter change, no polling

  async function onApprove(id, comment) {
    const r = await fetch(`${API}/hitl/events/${id}/approve`, { method: "POST", headers, body: JSON.stringify({ comment }) });
    if (r.ok) { toast.success("Approved — agent resumes"); fetchEvents(); } else toast.error("Failed");
  }
  async function onReject(id, comment) {
    const r = await fetch(`${API}/hitl/events/${id}/reject`, { method: "POST", headers, body: JSON.stringify({ comment }) });
    if (r.ok) { toast.error("Rejected — agent notified"); fetchEvents(); } else toast.error("Failed");
  }

  const pendingCount = events.filter(e => e.status === "pending").length;
  const counts = { pending: events.filter(e=>e.status==="pending").length, approved: 0, rejected: 0, all: events.length };

  return (
    <div style={{ padding: "32px 36px", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h1 style={{ fontFamily: "Space Grotesk", fontSize: 22, fontWeight: 700, color: "#fff" }}>HITL Review</h1>
            {pendingCount > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", fontWeight: 600, animation: "pulse 1.5s infinite" }}>
                {pendingCount} awaiting
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#475569" }}>Review agent actions before they execute • see full context, then decide</p>
        </div>
        <button onClick={fetchEvents}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: "#475569", fontSize: 12, transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div data-testid="hitl-filter-tabs" style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 10, background: "#09090b", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 24 }}>
        {["pending", "approved", "rejected", "all"].map(f => (
          <button key={f} data-testid={`filter-${f}`} onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.2s", fontFamily: "Inter", textTransform: "capitalize",
              background: filter === f ? "rgba(99,102,241,0.2)" : "transparent",
              color: filter === f ? "#818cf8" : "#475569",
              outline: filter === f ? "1px solid rgba(99,102,241,0.3)" : "none",
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", background: "#09090b", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5"><path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/></svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8, fontFamily: "Space Grotesk" }}>
            {filter === "pending" ? "No pending approvals" : `No ${filter} events`}
          </p>
          <p style={{ fontSize: 13, color: "#334155" }}>
            {filter === "pending" ? "Run: python multi_agent.py --hitl \"tool_name\" \"your query\"" : `Switch to a different filter`}
          </p>
        </div>
      ) : (
        <div data-testid="hitl-events-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          <AnimatePresence>
            {events.map(evt => (
              <HITLCard key={evt.id} evt={evt} onApprove={onApprove} onReject={onReject} headers={headers} />
            ))}
          </AnimatePresence>
        </div>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
