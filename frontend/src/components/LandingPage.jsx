import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { toast } from "sonner";

// ── 3D Particle Network Canvas ────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;

    const NUM = 70;
    const pts = Array.from({ length: NUM }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < NUM; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99,102,241,0.6)";
        ctx.fill();
        for (let j = i + 1; j < NUM; j++) {
          const q = pts[j];
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(99,102,241,${0.12 * (1 - d / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    const resize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

// ── Floating 3D Orb ───────────────────────────────────────────────────────────
function OrbitOrb() {
  return (
    <div style={{ position: "relative", width: 360, height: 360, margin: "0 auto" }}>
      {/* Core glow */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 120, height: 120, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.4) 0%, rgba(14,165,233,0.1) 60%, transparent 80%)",
        boxShadow: "0 0 60px rgba(99,102,241,0.5), 0 0 120px rgba(99,102,241,0.2)",
        animation: "pulse3d 3s ease-in-out infinite",
      }} />
      {/* Inner sphere */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 80, height: 80, borderRadius: "50%",
        background: "radial-gradient(135deg, rgba(99,102,241,0.8), rgba(14,165,233,0.6))",
        boxShadow: "inset 0 0 20px rgba(255,255,255,0.1), 0 0 30px rgba(99,102,241,0.6)",
      }} />
      {/* Orbit rings */}
      {[
        { size: 200, dur: "8s", rot: "0deg", tilt: "75deg", color: "rgba(99,102,241,0.4)" },
        { size: 260, dur: "12s", rot: "45deg", tilt: "55deg", color: "rgba(14,165,233,0.3)" },
        { size: 320, dur: "18s", rot: "70deg", tilt: "30deg", color: "rgba(99,102,241,0.2)" },
      ].map((ring, i) => (
        <div key={i} style={{
          position: "absolute", top: "50%", left: "50%",
          width: ring.size, height: ring.size,
          marginLeft: -ring.size / 2, marginTop: -ring.size / 2,
          borderRadius: "50%",
          border: `1px solid ${ring.color}`,
          transform: `rotateX(${ring.tilt}) rotateZ(${ring.rot})`,
          animation: `orbit${i} ${ring.dur} linear infinite`,
          transformStyle: "preserve-3d",
        }}>
          {/* Dot on orbit */}
          <div style={{
            position: "absolute", top: -3, left: "50%",
            width: 6, height: 6, borderRadius: "50%",
            background: ring.color.replace("0.", "0.9"),
            boxShadow: `0 0 8px ${ring.color}`,
            transform: "translateX(-50%)",
          }} />
        </div>
      ))}
      {/* Floating nodes */}
      {[
        { top: "10%", left: "5%", delay: "0s" },
        { top: "15%", right: "8%", delay: "0.5s" },
        { bottom: "12%", left: "10%", delay: "1s" },
        { bottom: "8%", right: "5%", delay: "1.5s" },
      ].map((pos, i) => (
        <div key={i} style={{
          position: "absolute", ...pos,
          width: 8, height: 8, borderRadius: "50%",
          background: "rgba(99,102,241,0.8)",
          boxShadow: "0 0 10px rgba(99,102,241,0.6)",
          animation: `float ${2 + i * 0.3}s ease-in-out infinite alternate`,
          animationDelay: pos.delay,
        }} />
      ))}
      <style>{`
        @keyframes pulse3d { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.15)} }
        @keyframes float { from{transform:translateY(0)} to{transform:translateY(-12px)} }
        @keyframes orbit0 { from{transform:rotateX(75deg) rotateZ(0deg)} to{transform:rotateX(75deg) rotateZ(360deg)} }
        @keyframes orbit1 { from{transform:rotateX(55deg) rotateZ(45deg)} to{transform:rotateX(55deg) rotateZ(405deg)} }
        @keyframes orbit2 { from{transform:rotateX(30deg) rotateZ(70deg)} to{transform:rotateX(30deg) rotateZ(430deg)} }
      `}</style>
    </div>
  );
}

// ── Tilt Card ─────────────────────────────────────────────────────────────────
function TiltCard({ children, style = {} }) {
  const cardRef = useRef(null);
  const handleMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 16;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -16;
    el.style.transform = `perspective(800px) rotateX(${y}deg) rotateY(${x}deg) translateZ(8px)`;
  };
  const handleLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = "perspective(800px) rotateX(0) rotateY(0) translateZ(0)";
  };
  return (
    <div ref={cardRef} onMouseMove={handleMove} onMouseLeave={handleLeave}
      style={{ transition: "transform 0.15s ease-out", transformStyle: "preserve-3d", ...style }}>
      {children}
    </div>
  );
}

// ── Terminal Block ─────────────────────────────────────────────────────────────
function Terminal({ code, lang = "python", title = "agent.py" }) {
  const lines = code.split("\n");
  return (
    <div style={{
      background: "#080810", border: "1px solid rgba(99,102,241,0.2)",
      borderRadius: "10px", overflow: "hidden",
      boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {["#f43f5e","#f59e0b","#10b981"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
        <span style={{ marginLeft: 8, fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono" }}>{title}</span>
      </div>
      <pre style={{ margin: 0, padding: "16px 20px", overflow: "auto", fontFamily: "JetBrains Mono", fontSize: 13, lineHeight: 1.7 }}>
        {lines.map((line, i) => {
          let color = "#c8d3f5";
          if (line.trim().startsWith("#")) color = "#4c5680";
          else if (/^(import|from|def|class|with|for|if|return)/.test(line.trim())) color = "#c099ff";
          else if (line.includes("humanlayer.") || line.includes("wrap_tools")) color = "#82aaff";
          else if (/"[^"]*"|'[^']*'/.test(line)) color = "#c3e88d";
          else if (/\b(True|False|None)\b/.test(line)) color = "#ff966c";
          return <div key={i} style={{ color }}>{line || "\u00a0"}</div>;
        })}
      </pre>
    </div>
  );
}

// ── Main Landing ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  const features = [
    { icon: "⚡", color: "#6366f1", title: "Zero-code", desc: "init() patches LangChain globally. No changes to your agent code." },
    { icon: "🛡", color: "#0ea5e9", title: "HITL Gates", desc: "Wrap any tool. Agent pauses, human decides, agent resumes." },
    { icon: "📡", color: "#10b981", title: "Real-time feed", desc: "Every LLM call, tool use, and decision streamed to your dashboard." },
    { icon: "🔑", color: "#f59e0b", title: "Audit trail", desc: "Full chronological log of agent steps with approve/reject history." },
  ];

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", overflowX: "hidden" }}>
      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        padding: "14px 40px", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(2,4,10,0.85)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg,#6366f1,#0ea5e9)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2l7 4v5c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V6l7-4z"/>
            </svg>
          </div>
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 600, color: "#fff", fontSize: 15 }}>HumanLayer</span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)", fontFamily: "JetBrains Mono" }}>v0.1</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="https://github.com/netanmangal/pinelabs-hx-humanlayer" target="_blank" rel="noreferrer"
            style={{ color: "#64748b", fontSize: 13, textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={e=>e.target.style.color="#94a3b8"} onMouseLeave={e=>e.target.style.color="#64748b"}>
            GitHub
          </a>
          <Link to="/login" data-testid="nav-login-btn"
            style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none", padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", transition: "all 0.2s" }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="#fff";}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#94a3b8";}}>
            Sign in
          </Link>
          <Link to="/signup" data-testid="nav-signup-btn"
            style={{ background: "#6366f1", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", padding: "6px 18px", borderRadius: 6, boxShadow: "0 0 20px rgba(99,102,241,0.35)", transition: "all 0.2s" }}
            onMouseEnter={e=>{e.currentTarget.style.background="#4f46e5";e.currentTarget.style.boxShadow="0 0 35px rgba(99,102,241,0.55)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="#6366f1";e.currentTarget.style.boxShadow="0 0 20px rgba(99,102,241,0.35)";}}>
            Get started
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <ParticleCanvas />
        {/* Radial gradient spotlight */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 40% 50%, rgba(99,102,241,0.08), transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: "120px 24px 80px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 60, alignItems: "center", width: "100%" }}>
          {/* Left */}
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 20, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", marginBottom: 24 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 12, color: "#818cf8", fontFamily: "JetBrains Mono" }}>Open source · Built for PineLabs Agent Toolkit</span>
            </div>
            <h1 style={{ fontFamily: "Space Grotesk", fontSize: "clamp(38px,5vw,64px)", fontWeight: 800, lineHeight: 1.05, marginBottom: 20, letterSpacing: "-2px" }}>
              <span style={{ color: "#fff" }}>One line.</span>
              <br />
              <span style={{ background: "linear-gradient(135deg,#6366f1 0%,#0ea5e9 50%,#10b981 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Full visibility.
              </span>
            </h1>
            <p style={{ fontSize: 17, color: "#64748b", lineHeight: 1.7, marginBottom: 36, maxWidth: 420 }}>
              SDK that brings traceability, auditability, and human oversight to AI agents operating in commerce systems — built for frameworks supported by the PineLabs Agent Toolkit.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
              <Link to="/signup" data-testid="hero-cta-btn"
                style={{ background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", padding: "12px 28px", borderRadius: 8, boxShadow: "0 0 30px rgba(99,102,241,0.4)", transition: "all 0.2s" }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 0 50px rgba(99,102,241,0.65)";e.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 0 30px rgba(99,102,241,0.4)";e.currentTarget.style.transform="none";}}>
                Start for free
              </Link>
              <a href="https://github.com/netanmangal/pinelabs-hx-humanlayer" target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 14, textDecoration: "none", padding: "12px 24px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.25)";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";e.currentTarget.style.color="#94a3b8";}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                View on GitHub
              </a>
            </div>

            {/* Install command */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 8, background: "#0a0a12", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "#334155", fontFamily: "JetBrains Mono", fontSize: 13 }}>$</span>
              <span style={{ color: "#10b981", fontFamily: "JetBrains Mono", fontSize: 13 }}>npm install humanlayer-ai</span>
              <button data-testid="copy-install-btn" onClick={() => { navigator.clipboard.writeText("npm install humanlayer-ai"); toast.success("Copied!"); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#334155", padding: 0, marginLeft: 4, transition: "color 0.2s" }}
                onMouseEnter={e=>e.currentTarget.style.color="#64748b"} onMouseLeave={e=>e.currentTarget.style.color="#334155"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
          </motion.div>

          {/* Right — 3D Orb */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
            style={{ display: "flex", justifyContent: "center" }}>
            <OrbitOrb />
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div style={{ opacity: heroOpacity, position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono", letterSpacing: 2 }}>SCROLL</span>
          <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom,#334155,transparent)" }} />
        </motion.div>
      </section>

      {/* STATS BAR */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "24px 40px", background: "rgba(9,9,11,0.8)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 32, textAlign: "center" }}>
          {[
            { val: "3", label: "Lines to integrate" },
            { val: "~95%", label: "Event noise reduction" },
            { val: "< 2s", label: "HITL response loop" },
            { val: "19", label: "Agent tools supported" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <div style={{ fontFamily: "Space Grotesk", fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* INTEGRATION STEPS */}
      <section style={{ padding: "100px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <motion.div style={{ textAlign: "center", marginBottom: 70 }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <p style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "#6366f1", letterSpacing: 3, marginBottom: 12 }}>// INTEGRATION</p>
          <h2 style={{ fontFamily: "Space Grotesk", fontSize: "clamp(28px,4vw,48px)", fontWeight: 700, color: "#fff", marginBottom: 12 }}>
            Up and running in <span style={{ color: "#6366f1" }}>5 minutes</span>
          </h2>
          <p style={{ color: "#475569", fontSize: 15 }}>No wrappers. No refactors. Just init and go.</p>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          {[
            {
              n: "01", title: "Install",
              code: `# Install the SDK and PineLabs toolkit
npm install humanlayer-ai
npm install @plural_pinelabs/agent-toolkit`,
              lang: "bash",
            },
            {
              n: "02", title: "Initialize",
              code: `import humanlayer from "humanlayer-ai";

// Two required args:
humanlayer.init({
  apiKey: "adr_...",           // required
  projectId: "commerce-agent", // required
});

// All LangChain/LangGraph events
// captured automatically.`,
              lang: "javascript",
            },
            {
              n: "03", title: "Add HITL",
              code: `// Gate high-stakes commerce actions
tools = humanlayer.wrapTools(tools, {
  approvalRequired: [
    "createOrder",
    "cancelOrder",
  ]
});
// Agent pauses for human approval`,
              lang: "javascript",
            },
          ].map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}>
              <TiltCard>
                <div style={{
                  background: "#08080f", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "20px",
                  height: "100%", transition: "border-color 0.3s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.4)"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.15)"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <span style={{ fontFamily: "Space Grotesk", fontSize: 36, fontWeight: 800, color: "rgba(99,102,241,0.15)", lineHeight: 1 }}>{step.n}</span>
                    <h3 style={{ fontFamily: "Space Grotesk", fontSize: 16, fontWeight: 600, color: "#fff" }}>{step.title}</h3>
                  </div>
                  <Terminal code={step.code} lang={step.lang || "javascript"} title={step.lang === "bash" ? "terminal" : "agent.js"} />
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HITL CALLOUT */}
      <section style={{ padding: "60px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <motion.div style={{
          borderRadius: 20, padding: "60px",
          background: "linear-gradient(135deg, rgba(99,102,241,0.07), rgba(14,165,233,0.04))",
          border: "1px solid rgba(99,102,241,0.2)",
          position: "relative", overflow: "hidden",
        }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div style={{ position: "absolute", top: "-60px", right: "-40px", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.06), transparent 70%)", pointerEvents: "none" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)", fontFamily: "JetBrains Mono", display: "inline-block", marginBottom: 20 }}>Human-in-the-Loop</span>
              <h2 style={{ fontFamily: "Space Grotesk", fontSize: 36, fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 16 }}>
                See <em style={{ fontStyle: "italic", color: "#6366f1" }}>why</em> before<br />you decide
              </h2>
              <p style={{ color: "#64748b", lineHeight: 1.8, marginBottom: 28, fontSize: 15 }}>
                When an agent hits a HITL gate, you see the full chronological journey —
                every LLM thought, every tool call — so you can make an informed decision.
              </p>
              <Link to="/signup" data-testid="hitl-cta-btn"
                style={{ background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 14, textDecoration: "none", padding: "11px 24px", borderRadius: 8, display: "inline-block", transition: "all 0.2s", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}
                onMouseEnter={e=>e.currentTarget.style.background="#4f46e5"}
                onMouseLeave={e=>e.currentTarget.style.background="#6366f1"}>
                Open dashboard
              </Link>
            </div>
            <Terminal code={`# Agent's journey shown before every
# approval request:

# 09:27:18 [llm] GPT-4o reasoning...
# 09:27:19 [tool] calendar_get_event_types
# 09:27:21 [tool] check_availability
# 09:27:23 [HITL] calendar_create_booking
#              ↓
#   ┌─────────────────────────────┐
#   │  Book 30min with            │
#   │  user@example.com @ 3pm     │
#   │                             │
#   │  [✓ Approve]  [✗ Reject]   │
#   └─────────────────────────────┘`} title="hitl-review.py" />
          </div>
        </motion.div>
      </section>

      {/* FEATURES GRID */}
      <section style={{ padding: "80px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          {features.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <TiltCard>
                <div style={{ padding: "28px", borderRadius: 12, background: "#08080f", border: "1px solid rgba(255,255,255,0.06)", height: "100%", cursor: "default", transition: "border-color 0.3s" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.25)"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.06)"}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${f.color}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 20 }}>{f.icon}</div>
                  <h3 style={{ fontFamily: "Space Grotesk", fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7 }}>{f.desc}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "28px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#1e293b", fontFamily: "JetBrains Mono" }}>HumanLayer v0.1.0 — Open Source</span>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="https://github.com/netanmangal/pinelabs-hx-humanlayer" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1e293b", textDecoration: "none", transition: "color 0.2s" }} onMouseEnter={e=>e.target.style.color="#475569"} onMouseLeave={e=>e.target.style.color="#1e293b"}>GitHub</a>
          <Link to="/login" style={{ fontSize: 12, color: "#1e293b", textDecoration: "none", transition: "color 0.2s" }} onMouseEnter={e=>e.target.style.color="#475569"} onMouseLeave={e=>e.target.style.color="#1e293b"}>Dashboard</Link>
        </div>
      </footer>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
