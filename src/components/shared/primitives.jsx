import { C } from "../../theme";

export function Btn({ children, onClick, variant = "primary", disabled, small, style }) {
  const vs = {
    primary: { background: C.accent, color: "#fff", boxShadow: `0 4px 20px ${C.accentGlow}` },
    ghost:   { background: C.surfaceHigh, color: C.text, border: `1px solid ${C.border}` },
    success: { background: C.success, color: "#000" },
    gold:    { background: C.gold, color: "#000" },
    danger:  { background: C.danger, color: "#fff" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        padding: small ? "6px 14px" : "10px 22px",
        borderRadius: 9, fontWeight: 700,
        fontSize: small ? 12 : 14,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "none", letterSpacing: "0.02em",
        transition: "all 0.2s",
        opacity: disabled ? 0.38 : 1,
        fontFamily: "inherit",
        ...vs[variant], ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Alert({ type = "info", children }) {
  const s = {
    info:    { bg: C.accentGlow,   border: C.accentDim,    color: C.accent,  icon: "ℹ" },
    warn:    { bg: C.warn+"15",    border: C.warn+"55",    color: C.warn,    icon: "⚠" },
    error:   { bg: C.danger+"15", border: C.danger+"55",  color: C.danger,  icon: "✕" },
    success: { bg: C.success+"15",border: C.success+"55", color: C.success, icon: "✓" },
  }[type];
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 9, background: s.bg,
      border: `1px solid ${s.border}`, fontSize: 13,
      display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8,
    }}>
      <span style={{ flexShrink: 0, fontWeight: 800, color: s.color }}>{s.icon}</span>
      <span style={{ color: C.text, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

export function ProgressBar({ pct, label }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.textMuted }}>{label}</span>
        <span style={{ fontSize: 13, color: C.accent, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: C.surfaceHigh, borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${C.accent}, ${C.success})`,
          borderRadius: 3, transition: "width 0.1s",
        }} />
      </div>
    </div>
  );
}

export function SectionLabel({ n, label, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", background: C.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 12, color: "#fff", flexShrink: 0,
        }}>{n}</div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{label}</h2>
      </div>
      {sub && (
        <p style={{ margin: "8px 0 0 38px", fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
          {sub}
        </p>
      )}
    </div>
  );
}
