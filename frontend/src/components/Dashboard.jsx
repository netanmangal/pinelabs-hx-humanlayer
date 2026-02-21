import React, { useState, useEffect, useCallback } from "react";
import { useAuth, API } from "../App";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const EVENT_META = {
  llm_start:    { color: "#0ea5e9", icon: "💬", label: "LLM thinking",    bg: "rgba(14,165,233,0.08)" },
  llm_end:      { color: "#0ea5e9", icon: "✓",  label: "LLM response",    bg: "rgba(14,165,233,0.05)" },
  tool_start:   { color: "#6366f1", icon: "→",  label: "Tool call",       bg: "rgba(99,102,241,0.08)" },
  tool_end:     { color: "#10b981", icon: "←",  label: "Tool result",     bg: "rgba(16,185,129,0.06)" },
  agent_action: { color: "#f59e0b", icon: "⚡",  label: "Agent decision",  bg: "rgba(245,158,11,0.08)" },
  agent_finish: { color: "#10b981", icon: "✓",  label: "Agent finished",  bg: "rgba(16,185,129,0.08)" },
  chain_start:  { color: "#475569", icon: "▶",  label: "Chain start",     bg: "rgba(71,85,105,0.05)" },
  chain_end:    { color: "#475569", icon: "■",  label: "Chain end",       bg: "rgba(71,85,105,0.05)" },
  tool_error:   { color: "#f43f5e", icon: "✗",  label: "Tool error",      bg: "rgba(244,63,94,0.08)" },
  llm_error:    { color: "#f43f5e", icon: "✗",  label: "LLM error",       bg: "rgba(244,63,94,0.08)" },
};

function StatCard({ label, value, color, icon, sub }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: "Space Grotesk", fontSize: 26, fontWeight: 800, color: "#fff" }}>{value}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: color, marginTop: 4, fontFamily: "JetBrains Mono" }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

function EventStep({ evt, index, isLast }) {
  const meta = EVENT_META[evt.event_type] || { color: "#94a3b8", icon: "·", label: evt.event_type, bg: "transparent" };
  const [expanded, setExpanded] = useState(false);
  const hasDetail = evt.data?.input || evt.data?.output || evt.data?.metadata?.agent_log;

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      {/* Timeline line */}
      {!isLast && <div style={{ position: "absolute", left: 15, top: 30, bottom: -8, width: 1, background: "rgba(255,255,255,0.05)" }} />}
      {/* Icon */}
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: meta.bg, border: `1px solid ${meta.color}40`, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "JetBrains Mono", flexShrink: 0, zIndex: 1 }}>
        {meta.icon}
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: hasDetail ? "pointer" : "default" }}
          onClick={() => hasDetail && setExpanded(e => !e)}>
          <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{meta.label}</span>
          {evt.data?.name && (
            <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#64748b", fontFamily: "JetBrains Mono" }}>
              {evt.data.name}
            </span>
          )}
          <span style={{ fontSize: 10, color: "#334155", marginLeft: "auto", fontFamily: "JetBrains Mono" }}>
            {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
          </span>
          {hasDetail && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"
              style={{ transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          )}
        </div>

        {/* Inline preview */}
        {!expanded && (evt.data?.input || evt.data?.metadata?.agent_log) && (
          <div style={{ fontSize: 11, color: "#334155", marginTop: 3, fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
            {typeof (evt.data.input || evt.data.metadata?.agent_log) === "string"
              ? (evt.data.input || evt.data.metadata?.agent_log)?.slice(0, 80)
              : JSON.stringify(evt.data.input || evt.data.metadata?.agent_log)?.slice(0, 80)}
            {((evt.data.input || evt.data.metadata?.agent_log)?.length > 80) ? "…" : ""}
          </div>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden" }}>
              <div style={{ marginTop: 8, background: "#06060e", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 14px" }}>
                {evt.data?.input && (
                  <div style={{ marginBottom: evt.data?.output ? 10 : 0 }}>
                    <div style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono", marginBottom: 4 }}>INPUT</div>
                    <pre style={{ fontSize: 11, color: "#6366f1", fontFamily: "JetBrains Mono", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                      {typeof evt.data.input === "string" ? evt.data.input : JSON.stringify(evt.data.input, null, 2)}
                    </pre>
                  </div>
                )}
                {evt.data?.output && (
                  <div>
                    <div style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono", marginBottom: 4 }}>OUTPUT</div>
                    <pre style={{ fontSize: 11, color: "#10b981", fontFamily: "JetBrains Mono", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                      {typeof evt.data.output === "string" ? evt.data.output?.slice(0, 400) : JSON.stringify(evt.data.output, null, 2)?.slice(0, 400)}
                      {(typeof evt.data.output === "string" ? evt.data.output : JSON.stringify(evt.data.output))?.length > 400 ? "\n…" : ""}
                    </pre>
                  </div>
                )}
                {evt.data?.metadata?.agent_log && (
                  <div>
                    <div style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono", marginBottom: 4 }}>REASONING</div>
                    <pre style={{ fontSize: 11, color: "#f59e0b", fontFamily: "JetBrains Mono", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                      {evt.data.metadata.agent_log?.slice(0, 300)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SessionCard({ session, headers }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState([]);
  const [loadingEvts, setLoadingEvts] = useState(false);

  async function loadEvents() {
    if (events.length > 0) { setExpanded(e => !e); return; }
    setLoadingEvts(true);
    setExpanded(true);
    try {
      const r = await fetch(`${API}/sessions/${session.id}/events`, { headers });
      const data = await r.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch { } finally { setLoadingEvts(false); }
  }

  const statusColor = { active: "#0ea5e9", completed: "#10b981", failed: "#f43f5e" }[session.status] || "#64748b";
  const stats = session.statistics || {};
  const duration = session.start_time && session.end_time
    ? `${Math.round((new Date(session.end_time) - new Date(session.start_time)) / 1000)}s`
    : session.status === "active" ? "running" : null;

  return (
    <div style={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden", transition: "border-color 0.3s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.25)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" }}
        onClick={loadEvents}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0, boxShadow: session.status === "active" ? `0 0 8px ${statusColor}` : "none" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "Space Grotesk", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
              {session.name || `session-${session.id?.slice(0, 8)}`}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
              {session.event_count > 0 && <span style={{ fontSize: 10, color: "#334155" }}>{session.event_count} events</span>}
              {stats.tool_calls > 0 && <span style={{ fontSize: 10, color: "#334155" }}>{stats.tool_calls} tools</span>}
              {stats.total_tokens > 0 && <span style={{ fontSize: 10, color: "#334155" }}>{stats.total_tokens?.toLocaleString()} tokens</span>}
              {duration && <span style={{ fontSize: 10, color: "#334155" }}>{duration}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: `1px solid ${statusColor}40`, color: statusColor }}>
            {session.status}
          </span>
          <span style={{ fontSize: 10, color: "#334155" }}>{session.start_time ? new Date(session.start_time).toLocaleTimeString() : ""}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"
            style={{ transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* Events timeline */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ padding: "16px 18px" }}>
              {loadingEvts ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#334155", fontSize: 12 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                  Loading agent steps…
                </div>
              ) : events.length === 0 ? (
                <p style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "16px 0" }}>No events recorded for this session</p>
              ) : (
                <div>
                  {events.map((evt, i) => (
                    <EventStep key={evt.id} evt={evt} index={i} isLast={i === events.length - 1} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState({ sessions: 0, events: 0, hitl_pending: 0, hitl_total: 0 });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [s, sess] = await Promise.all([
        fetch(`${API}/stats`, { headers }).then(r => r.json()),
        fetch(`${API}/sessions?limit=20`, { headers }).then(r => r.json()),
      ]);
      setStats(s);
      setSessions(Array.isArray(sess) ? sess : []);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 8000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: "32px 36px", minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "Space Grotesk", fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Overview</h1>
          <p style={{ fontSize: 13, color: "#475569" }}>Real-time agent activity • click any session to expand steps</p>
        </div>
        <button data-testid="refresh-btn" onClick={fetchData}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#475569", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard label="Sessions" value={stats.sessions} color="#6366f1" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard label="Events captured" value={stats.events} color="#0ea5e9" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} />
        <StatCard label="HITL pending" value={stats.hitl_pending} color="#f59e0b" sub={stats.hitl_pending > 0 ? "Action required" : ""} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/></svg>} />
        <StatCard label="HITL resolved" value={stats.hitl_total} color="#10b981" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>} />
      </div>

      {/* Sessions */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Agent Sessions</span>
          <span style={{ fontSize: 11, color: "#334155", marginLeft: "auto" }}>{sessions.length} sessions</span>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>

        {sessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#09090b", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 6 }}>No sessions yet</p>
            <p style={{ fontSize: 12, color: "#334155" }}>Run your agent with HumanLayer SDK to see activity here</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sessions.map(s => (
              <SessionCard key={s.id} session={s} headers={headers} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
