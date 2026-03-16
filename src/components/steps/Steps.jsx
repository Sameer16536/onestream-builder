import { useState } from "react";
import { C, LV_COLORS } from "../../theme";
import { validateMapping } from "../../core/validate";
import { Btn, Alert, SectionLabel } from "../shared/primitives";

// ─── Step 2: Levels ────────────────────────────────────────────────────────────
export function StepLevels({ onSet, initialN = 3 }) {
  const [n, setN] = useState(initialN);
  return (
    <div>
      <SectionLabel n="2" label="Hierarchy Depth" sub="How many levels does this dimension have?" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
          <div
            key={v} onClick={() => setN(v)}
            style={{
              width: 62, height: 62, borderRadius: 12,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              background: n === v ? C.accent : C.surfaceHigh,
              border: `2px solid ${n === v ? C.accent : C.border}`,
              boxShadow: n === v ? `0 0 18px ${C.accentGlow}` : "none",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 800, color: n === v ? "#fff" : C.textMuted }}>{v}</span>
            <span style={{ fontSize: 9, color: n === v ? "rgba(255,255,255,0.6)" : C.textDim }}>levels</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} style={{
            background: LV_COLORS[i] + "22", color: LV_COLORS[i],
            border: `1px solid ${LV_COLORS[i]}44`, borderRadius: 6,
            padding: "3px 12px", fontWeight: 700, fontSize: 13,
          }}>L{i + 1}</span>
        ))}
      </div>
      <Btn onClick={() => onSet(n)}>Continue →</Btn>
    </div>
  );
}

// ─── Step 3: Column Mapping ────────────────────────────────────────────────────
export function StepMapping({ headers, maxLevels, onSet, mapping, setMapping }) {
  const [submitted, setSubmitted] = useState(false);
  const levels    = Array.from({ length: maxLevels }, (_, i) => `L${i + 1}`);
  const allMapped = levels.every(l => mapping[l] !== "");
  const { errors: mapErrors, warnings: mapWarnings } = submitted
    ? validateMapping(mapping, headers, maxLevels)
    : { errors: [], warnings: [] };

  const handleConfirm = () => {
    setSubmitted(true);
    const { errors } = validateMapping(mapping, headers, maxLevels);
    if (!errors.length) onSet(mapping);
  };

  return (
    <div>
      <SectionLabel n="3" label="Map Columns to Levels" sub="Select which Excel column maps to each level." />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {levels.map((level, i) => {
          const color  = LV_COLORS[i];
          const mapped = mapping[level] !== "";
          return (
            <div key={level} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              borderRadius: 12,
              background: mapped ? color + "12" : C.surfaceHigh,
              border: `1.5px solid ${mapped ? color + "66" : C.border}`,
              transition: "all 0.2s",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: color + (mapped ? "33" : "18"),
                border: `2px solid ${color + (mapped ? "88" : "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, color, fontSize: 14,
              }}>{level}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <select
                  value={mapping[level]}
                  onChange={e => { setSubmitted(false); setMapping(prev => ({ ...prev, [level]: e.target.value })); }}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
                    background: mapped ? color + "18" : C.bg,
                    border: `1.5px solid ${mapped ? color + "66" : C.borderBright}`,
                    color: mapped ? color : C.textMuted,
                    outline: "none", cursor: "pointer",
                    fontWeight: mapped ? 700 : 400, fontFamily: "inherit",
                  }}
                >
                  <option value="">— select a column —</option>
                  {headers.map((h, idx) => (
                    <option key={idx} value={idx}>{h || `Column ${idx + 1}`}</option>
                  ))}
                </select>
              </div>
              {mapped && <span style={{ fontSize: 18, color: C.success, flexShrink: 0 }}>✓</span>}
            </div>
          );
        })}
      </div>

      {/* Mapping summary chips */}
      {Object.values(mapping).some(v => v !== "") && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, padding: 12,
          background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 11, color: C.textMuted, alignSelf: "center", marginRight: 4 }}>Mapped:</span>
          {levels.map((level, i) => {
            if (mapping[level] === "") return null;
            const color   = LV_COLORS[i];
            const colName = headers[parseInt(mapping[level])] || `Col ${parseInt(mapping[level]) + 1}`;
            return (
              <span key={level} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: color + "22", border: `1px solid ${color}55`,
                borderRadius: 20, padding: "3px 10px", fontSize: 12,
              }}>
                <span style={{ fontWeight: 800, color }}>{level}</span>
                <span style={{ color: C.textDim }}>→</span>
                <span style={{ color, fontWeight: 600 }}>{colName}</span>
              </span>
            );
          })}
        </div>
      )}

      {mapWarnings.map((w, i) => <Alert key={i} type="warn">{w}</Alert>)}
      {mapErrors.map((e, i)   => <Alert key={i} type="error">{e}</Alert>)}
      <Btn onClick={handleConfirm} disabled={!allMapped}>
        {allMapped ? "Confirm Mapping →" : `Map all ${maxLevels} levels to continue`}
      </Btn>
    </div>
  );
}

// ─── Step 4: Hierarchy Order ───────────────────────────────────────────────────
export function StepHierarchyOrder({ maxLevels, mapping, headers, onSet, initialOrder }) {
  const levels = Array.from({ length: maxLevels }, (_, i) => `L${i + 1}`);
  const [order, setOrder]   = useState(initialOrder && initialOrder.length === maxLevels ? [...initialOrder] : [...levels]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const move = (from, to) => {
    const arr = [...order];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setOrder(arr);
  };

  return (
    <div>
      <SectionLabel n="4" label="Parent → Child Flow" sub="Drag to reorder. Leftmost = root. Each level's parent is the one to its left." />

      <div style={{ display: "flex", alignItems: "center", overflowX: "auto", padding: "16px 4px", marginBottom: 16 }}>
        {order.map((level, idx) => {
          const colIdx  = parseInt(mapping[level]);
          const colName = headers[colIdx] || level;
          const color   = LV_COLORS[levels.indexOf(level)];
          const isOver  = overIdx === idx;
          return (
            <div key={level} style={{ display: "flex", alignItems: "center" }}>
              <div
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); setOverIdx(idx); }}
                onDrop={() => { move(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                style={{
                  padding: "10px 16px", borderRadius: 12, cursor: "grab", userSelect: "none",
                  background: color + "22",
                  border: `2px solid ${isOver ? color : color + "55"}`,
                  boxShadow: isOver ? `0 0 22px ${color}55` : "none",
                  transform: isOver ? "scale(1.07)" : "scale(1)",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontWeight: 800, color, fontSize: 14 }}>{level}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {colName}
                </div>
              </div>
              {idx < order.length - 1 && (
                <div style={{ padding: "0 6px", color: C.textDim, fontSize: 20, flexShrink: 0 }}>→</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 20, padding: 14, background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace", letterSpacing: "0.06em" }}>
          PARENT RELATIONSHIPS
        </div>
        {order.map((level, idx) => {
          const color       = LV_COLORS[levels.indexOf(level)];
          const parentLevel = idx > 0 ? order[idx - 1] : null;
          const parentColor = parentLevel ? LV_COLORS[levels.indexOf(parentLevel)] : null;
          return (
            <div key={level} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color, minWidth: 30, fontSize: 13 }}>{level}</span>
              <span style={{ color: C.textDim, fontSize: 11 }}>({headers[parseInt(mapping[level])] || level})</span>
              <span style={{ color: C.textDim, fontSize: 13 }}>{idx === 0 ? "← Root" : "parent:"}</span>
              {parentLevel && <span style={{ fontWeight: 800, color: parentColor, fontSize: 13 }}>{parentLevel}</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={() => onSet(order)}>Confirm Order →</Btn>
        <Btn variant="ghost" onClick={() => setOrder([...levels])}>Reset</Btn>
      </div>
    </div>
  );
}

// ─── Step 6: Config + Collision Mode ──────────────────────────────────────────
export function StepConfig({ onSet, initialRootName = "Region", initialDimName = "Region", initialCollisionMode = "collapse", dimType, initialInheritedDim }) {
  const defaultInherited = initialInheritedDim || (dimType ? `Root${dimType}Dim` : "RootUD1Dim");
  const [rootName,      setRootName]      = useState(initialRootName);
  const [dimName,       setDimName]       = useState(initialDimName);
  const [collisionMode, setCollisionMode] = useState(initialCollisionMode);
  const [inheritedDim,  setInheritedDim]  = useState(defaultInherited);

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 14,
    background: C.bg, border: `1px solid ${C.borderBright}`,
    color: C.text, outline: "none", fontFamily: "inherit",
  };

  const modes = [
    {
      key: "collapse",
      icon: "⚡",
      label: "Collapse duplicates",
      desc: "If the same name repeats in consecutive levels, skip it and attach the next unique value directly to the last distinct parent.",
      exampleFull: "America → North_America → North_America → na123  becomes  America → North_America → na123",
    },
    {
      key: "rename",
      icon: "🏷",
      label: "Rename with level suffix",
      desc: "If the same name appears in multiple levels, rename each occurrence with a level suffix to keep them as distinct members.",
      exampleFull: "North_America in L2 and L3 becomes North_America_L2 and North_America_L3",
    },
  ];

  return (
    <div>
      <SectionLabel n="6" label="Dimension, Root & Output Mode" />

      {/* Mode picker */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12 }}>
          DUPLICATE NAME HANDLING
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {modes.map(mode => {
            const active = collisionMode === mode.key;
            return (
              <div
                key={mode.key} onClick={() => setCollisionMode(mode.key)}
                style={{
                  padding: "16px 18px", borderRadius: 12, cursor: "pointer",
                  background: active ? C.accent + "18" : C.surfaceHigh,
                  border: `2px solid ${active ? C.accent : C.border}`,
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    border: `2px solid ${active ? C.accent : C.borderBright}`,
                    background: active ? C.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: active ? C.accent : C.text }}>
                    {mode.icon} {mode.label}
                  </span>
                </div>
                <p style={{ margin: "0 0 8px 30px", fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
                  {mode.desc}
                </p>
                <div style={{
                  margin: "0 0 0 30px", padding: "8px 12px", background: C.bg,
                  borderRadius: 8, border: `1px solid ${C.border}`,
                  fontSize: 12, fontFamily: "monospace",
                  color: active ? C.accent : C.textDim,
                  overflowX: "auto", whiteSpace: "nowrap",
                }}>
                  {mode.exampleFull}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 22 }}>
        <div>
          <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Root Member Name</label>
          <input value={rootName} onChange={e => setRootName(e.target.value)} style={inputStyle} placeholder="e.g. Region, Entity, Total" />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Added as the top-level parent with no parent of its own</div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Dimension Name</label>
          <input value={dimName} onChange={e => setDimName(e.target.value)} style={inputStyle} placeholder="e.g. Region, Entity" />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
            Output:{" "}
            <span style={{ color: C.accent }}>{dimName || "Dim"}.xml</span>
          </div>
        </div>
        {dimType !== "Entity" && (
          <div>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Inherited Dimension</label>
            <input value={inheritedDim} onChange={e => setInheritedDim(e.target.value)} style={inputStyle} placeholder={`Root${dimType || "UD1"}Dim`} />
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>The base dimension this one inherits from</div>
          </div>
        )}
      </div>

      <Btn
        onClick={() => onSet(rootName.trim() || "Root", dimName.trim() || "Dimension", collisionMode, inheritedDim.trim())}
        disabled={!rootName.trim()}
      >
        Review & Generate →
      </Btn>
    </div>
  );
}
