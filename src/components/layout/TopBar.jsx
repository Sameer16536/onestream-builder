import { C } from "../../theme";
import { Btn } from "../shared/primitives";

export function TopBar({ fileName, sheetName, processing, onReset }) {
  return (
    <div style={{
      borderBottom: `1px solid ${C.border}`,
      padding: "12px 20px",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      background: C.surface,
      position: "sticky", top: 0, zIndex: 50,
      minHeight: 57,
    }}>
      <div style={{
        background: C.accentGlow, border: `1px solid ${C.accentDim}`,
        borderRadius: 8, padding: "4px 12px", flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: C.accent, fontWeight: 800, letterSpacing: "0.12em" }}>
          ONESTREAM
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: C.text, lineHeight: 1 }}>
          Metadata Builder
        </span>
        <span style={{ fontSize: 11, color: C.textMuted }}>Excel → MEM.xml + REL.xml</span>
      </div>

      {fileName && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.surfaceHigh, padding: "4px 12px",
            borderRadius: 20, border: `1px solid ${C.border}`,
            maxWidth: 260, overflow: "hidden",
          }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>📄</span>
            <span style={{
              fontSize: 12, color: C.textMuted,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{fileName}</span>
            {sheetName && (
              <span style={{
                fontSize: 11, color: C.accent, background: C.accentGlow,
                padding: "1px 8px", borderRadius: 10, fontWeight: 700, flexShrink: 0,
              }}>{sheetName}</span>
            )}
          </div>
          {!processing && (
            <Btn variant="ghost" small onClick={onReset}>↺ Reset</Btn>
          )}
        </div>
      )}
    </div>
  );
}

export function StepSidebar({ step, sheetName, onNavigate }) {
  const steps = ["Upload", "Levels", "Map Columns", "Order", "Config"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {sheetName && (
        <div style={{
          padding: "8px 12px", marginBottom: 8,
          background: C.accentGlow, borderRadius: 8, border: `1px solid ${C.accentDim}`,
        }}>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, marginBottom: 2 }}>ACTIVE SHEET</div>
          <div style={{
            fontSize: 12, color: C.text, fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{sheetName}</div>
        </div>
      )}
      {steps.map((label, i) => {
        const n = i + 1, done = step > n, active = step === n;
        const clickable = done && onNavigate;
        return (
          <div
            key={n}
            onClick={clickable ? () => onNavigate(n) : undefined}
            title={clickable ? `Go back to ${label}` : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              borderRadius: 8,
              background: active ? C.accentGlow : "transparent",
              border: `1px solid ${active ? C.accent + "44" : "transparent"}`,
              cursor: clickable ? "pointer" : "default",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={clickable ? (e) => {
              e.currentTarget.style.background = C.surfaceHigh;
              e.currentTarget.style.borderColor = C.accent + "33";
            } : undefined}
            onMouseLeave={clickable ? (e) => {
              e.currentTarget.style.background = active ? C.accentGlow : "transparent";
              e.currentTarget.style.borderColor = active ? C.accent + "44" : "transparent";
            } : undefined}
          >
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800,
              background: done ? C.success : active ? C.accent : C.surfaceHigh,
              color: done || active ? "#fff" : C.textDim,
              border: `1.5px solid ${done ? C.success : active ? C.accent : C.border}`,
            }}>
              {done ? "✓" : n}
            </div>
            <span style={{
              fontSize: 13,
              color: active ? C.text : done ? C.success : C.textDim,
              fontWeight: active || done ? 700 : 400,
            }}>{label}</span>
            {clickable && (
              <span style={{
                marginLeft: "auto", fontSize: 10, color: C.textDim, opacity: 0.6,
              }}>↩</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Mobile step indicator — compact horizontal dots
export function MobileStepBar({ step }) {
  const steps = ["Upload", "Levels", "Columns", "Order", "Config"];
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 6, padding: "10px 16px",
      borderBottom: `1px solid ${C.border}`, background: C.surface,
    }}>
      {steps.map((label, i) => {
        const n = i + 1, done = step > n, active = step === n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: active ? "auto" : 8, height: active ? "auto" : 8,
              padding: active ? "3px 10px" : 0,
              borderRadius: active ? 12 : "50%",
              background: done ? C.success : active ? C.accent : C.surfaceHigh,
              border: `1.5px solid ${done ? C.success : active ? C.accent : C.border}`,
              fontSize: 11, fontWeight: 800,
              color: done || active ? "#fff" : C.textDim,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}>
              {active ? label : done ? "✓" : ""}
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 16, height: 1,
                background: done ? C.success : C.border,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
