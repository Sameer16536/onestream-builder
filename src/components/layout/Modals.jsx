import { C, LV_COLORS } from "../../theme";
import { Btn, ProgressBar } from "../shared/primitives";

export function ConfirmModal({ headers, mapping, hierarchyOrder, rowCount, sheetName, rootName, dimName, collisionMode, onConfirm, onEdit }) {
  const levels = Object.keys(mapping).sort();
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(4,5,12,0.92)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 20, overflowY: "auto",
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.borderBright}`,
        borderRadius: 20, padding: 36, width: "100%", maxWidth: 520,
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        animation: "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        margin: "auto",
      }}>
        <style>{`@keyframes popIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Confirm Before Generating</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            ["Source rows", rowCount.toLocaleString()],
            ["Sheet", sheetName],
            ["Root member", rootName],
            ["Dimension", dimName],
            ["Levels", levels.length],
            ["Duplicate mode", collisionMode === "collapse" ? "⚡ Collapse" : "🏷 Rename"],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: "9px 12px", background: C.surfaceHigh, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{k}</div>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>MAPPING</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {levels.map((level, i) => {
            const color  = LV_COLORS[i];
            const colIdx = parseInt(mapping[level]);
            return (
              <span key={level} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: color + "22", border: `1px solid ${color}55`,
                borderRadius: 20, padding: "4px 10px", fontSize: 12,
              }}>
                <span style={{ fontWeight: 800, color }}>{level}</span>
                <span style={{ color: C.textDim }}>→</span>
                <span style={{ color, fontWeight: 600 }}>{headers[colIdx] || `Col ${colIdx + 1}`}</span>
              </span>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>FLOW</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 24 }}>
          <span style={{
            background: C.surfaceHigh, color: C.textMuted,
            border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "3px 10px", fontSize: 12, fontWeight: 700,
          }}>{rootName}</span>
          <span style={{ color: C.textDim }}>→</span>
          {hierarchyOrder.map((lv, idx) => {
            const color = LV_COLORS[levels.indexOf(lv)];
            return (
              <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  background: color + "22", color,
                  border: `1px solid ${color}44`, borderRadius: 6,
                  padding: "3px 10px", fontSize: 12, fontWeight: 700,
                }}>{lv}</span>
                {idx < hierarchyOrder.length - 1 && <span style={{ color: C.textDim }}>→</span>}
              </span>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="success" onClick={onConfirm} style={{ flex: 1 }}>✓ Generate XML Files</Btn>
          <Btn variant="ghost"   onClick={onEdit}    style={{ flex: 1 }}>← Edit</Btn>
        </div>
      </div>
    </div>
  );
}

export function ProcessingScreen({ progress, rowCount }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "80px 40px", textAlign: "center",
    }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>⚙️</div>
      <h2 style={{ color: C.text, fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Building Hierarchy…</h2>
      <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 32 }}>
        Processing {rowCount.toLocaleString()} rows — UI stays responsive via chunked processing
      </p>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <ProgressBar pct={progress} label="Processing rows" />
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
          {progress < 40
            ? "Pass 1 of 2: detecting cross-level collisions…"
            : "Pass 2 of 2: building members and relationships…"}
        </div>
      </div>
    </div>
  );
}
