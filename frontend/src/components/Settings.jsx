import React, { useState, useEffect } from "react";
import { useAuth, API } from "../App";
import { toast } from "sonner";

function Section({ title, description, children }) {
  return (
    <div style={{ background: "#0e0e18", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontFamily: "Space Grotesk", fontSize: 15, fontWeight: 700, color: "#fff" }}>{title}</h3>
          {description && <p style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{description}</p>}
        </div>
      </div>
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </div>
  );
}

function FormRow({ children }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, type = "button", variant = "primary", testId, disabled }) {
  const styles = {
    primary: { background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", boxShadow: "0 0 14px rgba(99,102,241,0.25)" },
    danger: { background: "rgba(244,63,94,0.08)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.25)" },
    ghost: { background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" },
  };
  return (
    <button data-testid={testId} type={type} onClick={onClick} disabled={disabled}
      style={{ padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, transition: "all 0.2s", fontFamily: "Space Grotesk", whiteSpace: "nowrap", ...styles[variant] }}
      onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}>
      {children}
    </button>
  );
}

function EmptyState({ text }) {
  return <p style={{ fontSize: 13, color: "#334155", padding: "12px 0", fontStyle: "italic" }}>{text}</p>;
}

export default function Settings() {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [newKey, setNewKey] = useState({ name: "", project_id: "" });
  const [createdKey, setCreatedKey] = useState(null);
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function fetchAll() {
    try {
      const [p, k] = await Promise.all([
        fetch(`${API}/projects`, { headers }).then(r => r.json()),
        fetch(`${API}/api-keys`, { headers }).then(r => r.json()),
      ]);
      setProjects(Array.isArray(p) ? p : []);
      setApiKeys(Array.isArray(k) ? k : []);
      if (user?.org_id) {
        const m = await fetch(`${API}/organizations/${user.org_id}/members`, { headers }).then(r => r.json());
        setMembers(Array.isArray(m) ? m : []);
      }
    } catch {}
  }

  useEffect(() => { if (token) fetchAll(); }, [token]);

  async function createProject(e) {
    e.preventDefault();
    const r = await fetch(`${API}/projects`, { method: "POST", headers, body: JSON.stringify(newProject) });
    if (r.ok) { toast.success("Project created"); setNewProject({ name: "", description: "" }); fetchAll(); }
    else toast.error("Failed to create project");
  }

  async function createKey(e) {
    e.preventDefault();
    const r = await fetch(`${API}/api-keys`, { method: "POST", headers, body: JSON.stringify(newKey) });
    if (r.ok) {
      const data = await r.json();
      setCreatedKey(data.key);
      setNewKey({ name: "", project_id: "" });
      toast.success("API key created — save it now!");
      fetchAll();
    } else toast.error("Failed to create API key");
  }

  async function revokeKey(id) {
    const r = await fetch(`${API}/api-keys/${id}`, { method: "DELETE", headers });
    if (r.ok) { toast.success("API key revoked"); fetchAll(); }
    else toast.error("Failed to revoke");
  }

  async function inviteMember(e) {
    e.preventDefault();
    const r = await fetch(`${API}/organizations/${user?.org_id}/invite`, {
      method: "POST", headers, body: JSON.stringify({ email: inviteEmail, role: "member" })
    });
    if (r.ok) { toast.success("Member invited"); setInviteEmail(""); fetchAll(); }
    else toast.error("Failed to invite");
  }

  return (
    <div className="page-pad" style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "Space Grotesk", fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "#475569" }}>Manage your projects, API keys, and team members</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Projects */}
        <Section title="Projects" description="Organize your agents into projects">
          <form onSubmit={createProject} style={{ marginBottom: 16 }}>
            <FormRow>
              <input data-testid="project-name-input" placeholder="Project name" required
                value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                style={{ flex: "1 1 180px", minWidth: 0 }} />
              <input placeholder="Description (optional)"
                value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                style={{ flex: "2 1 200px", minWidth: 0 }} />
              <Btn type="submit" testId="create-project-btn">Create</Btn>
            </FormRow>
          </form>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.length === 0 ? <EmptyState text="No projects yet — create one to generate API keys" /> : (
              projects.map(p => (
                <div key={p.id} data-testid={`project-${p.id}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{p.name}</p>
                    {p.description && <p style={{ fontSize: 12, color: "#475569" }}>{p.description}</p>}
                  </div>
                  <code style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "rgba(99,102,241,0.1)", color: "#818cf8", fontFamily: "JetBrains Mono", flexShrink: 0 }}>
                    {p.id.slice(0, 8)}…
                  </code>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* API Keys */}
        <Section title="API Keys" description="Generate keys to connect your agents to HumanLayer">
          {createdKey && (
            <div data-testid="new-api-key-display"
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#10b981", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your new API key — copy it now, it won't show again</p>
                <code style={{ fontSize: 12, color: "#34d399", wordBreak: "break-all", fontFamily: "JetBrains Mono" }}>{createdKey}</code>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button data-testid="copy-key-btn" onClick={() => { navigator.clipboard.writeText(createdKey); toast.success("Copied!"); }}
                  style={{ padding: "6px 12px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 7, color: "#10b981", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  Copy
                </button>
                <button onClick={() => setCreatedKey(null)} style={{ padding: "6px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "#475569", fontSize: 12, cursor: "pointer" }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <form onSubmit={createKey} style={{ marginBottom: 16 }}>
            <FormRow>
              <input data-testid="key-name-input" placeholder="Key name (e.g. Production)" required
                value={newKey.name} onChange={e => setNewKey({ ...newKey, name: e.target.value })}
                style={{ flex: "1 1 160px", minWidth: 0 }} />
              <select data-testid="key-project-select" required value={newKey.project_id}
                onChange={e => setNewKey({ ...newKey, project_id: e.target.value })}
                style={{ flex: "1 1 160px", minWidth: 0 }}>
                <option value="">Select project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Btn type="submit" testId="create-key-btn">Generate key</Btn>
            </FormRow>
          </form>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {apiKeys.length === 0 ? <EmptyState text="No API keys yet — generate one to connect your agent" /> : (
              apiKeys.map(k => (
                <div key={k.id} data-testid={`api-key-${k.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{k.name}</span>
                      <span className={k.status === "active" ? "badge-approved" : "badge-rejected"}>{k.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <code style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono" }}>{k.key_prefix}…</code>
                      {k.last_used_at && <span style={{ fontSize: 11, color: "#334155" }}>Last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                      {k.created_at && <span style={{ fontSize: 11, color: "#1e293b" }}>Created {new Date(k.created_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  {k.status === "active" && (
                    <Btn variant="danger" testId={`revoke-key-${k.id}`} onClick={() => revokeKey(k.id)}>Revoke</Btn>
                  )}
                </div>
              ))
            )}
          </div>
        </Section>

        {/* Team */}
        <Section title="Team Members" description="Invite colleagues to review and approve agent actions">
          <form onSubmit={inviteMember} style={{ marginBottom: 16 }}>
            <FormRow>
              <input data-testid="invite-email-input" type="email" placeholder="colleague@company.com" required
                value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                style={{ flex: "1 1 200px", minWidth: 0 }} />
              <Btn type="submit" testId="invite-btn">Send invite</Btn>
            </FormRow>
          </form>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.length === 0 ? <EmptyState text="No team members yet" /> : (
              members.map(m => (
                <div key={m.id} data-testid={`member-${m.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,rgba(99,102,241,0.25),rgba(14,165,233,0.15))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#818cf8", flexShrink: 0 }}>
                    {m.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.email}</p>
                    <p style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</p>
                  </div>
                  <span className="badge-active">{m.role}</span>
                </div>
              ))
            )}
          </div>
        </Section>

      </div>
    </div>
  );
}
