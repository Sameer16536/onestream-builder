import { useState } from "react";
import { C } from "../../theme";
import { Btn, SectionLabel } from "../shared/primitives";

const DIM_TYPES = ["Entity", "Account", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"];

// ── Dimension Type Picker Modal ────────────────────────────────────────────────
function DimTypeModal({ onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 18, padding: "32px 36px", maxWidth: 540, width: "90%",
        boxShadow: `0 0 60px rgba(0,0,0,0.6)`,
      }}>
        <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
          STEP 5 — PROPERTIES
        </div>
        <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.text }}>
          Select Dimension Type
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textMuted }}>
          Choose the OneStream dimension type. This sets the XML <code style={{ color: C.accent }}>type</code> attribute and determines which properties apply.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {DIM_TYPES.map(t => (
            <div
              key={t}
              onClick={() => onSelect(t)}
              onMouseEnter={() => setHovered(t)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: "14px 6px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                background: hovered === t ? C.accent + "28" : C.surfaceHigh,
                border: `2px solid ${hovered === t ? C.accent : C.border}`,
                boxShadow: hovered === t ? `0 0 18px ${C.accent}33` : "none",
                transition: "all 0.15s",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ fontSize: 20 }}>
                {t === "Entity" ? "🏢" : t === "Account" ? "📊" : "📦"}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: hovered === t ? C.accent : C.text }}>{t}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: "20px 0 0", fontSize: 11, color: C.textDim, textAlign: "center" }}>
          You can change this later by navigating back to this step.
        </p>
      </div>
    </div>
  );
}

// ── Shared toggles ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, width: "fit-content" }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
            background: value === opt.value ? (opt.color || C.accent) : C.surfaceHigh,
            color: value === opt.value ? "#fff" : C.textMuted,
            transition: "all 0.15s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, width = 180 }) {
  return (
    <input
      style={{
        padding: "8px 12px", borderRadius: 8, fontSize: 13,
        background: C.bg, border: `1px solid ${C.borderBright}`,
        color: C.text, outline: "none", fontFamily: "inherit", width,
      }}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function Row({ label, desc, children }) {
  const rowStyle = {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 16, padding: "14px 18px", borderRadius: 10,
    background: C.surfaceHigh, border: `1px solid ${C.border}`, marginBottom: 10,
  };
  return (
    <div style={rowStyle}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: C.textDim }}>{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── UD1–UD8 property form ─────────────────────────────────────────────────────
function UDPropsForm({ props, set }) {
  return (
    <>
      <Row label="Allow Input" desc="Whether members accept data input">
        <Toggle value={props.allowInput} onChange={v => set("allowInput", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="Is Consolidated" desc="How members roll up in consolidations">
        <Toggle value={props.isConsolidated} onChange={v => set("isConsolidated", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }, { value: "conditional", label: "Conditional", color: C.warn }]} />
      </Row>
      <Row label="Is Attribute Member" desc="Marks member as an attribute member">
        <Toggle value={props.isAttributeMember} onChange={v => set("isAttributeMember", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="Alternate Currency for Display" desc="Leave empty for none">
        <TextInput value={props.alternateCurrency} onChange={v => set("alternateCurrency", v)} placeholder="e.g. USD" />
      </Row>
      {Array.from({ length: 8 }).map((_, i) => (
        <Row key={i + 1} label={`Text${i + 1}`} desc={`Custom text attribute ${i + 1}`}>
          <TextInput value={props[`text${i + 1}`]} onChange={v => set(`text${i + 1}`, v)} placeholder="optional" />
        </Row>
      ))}
      <Row label="Aggregation Weight" desc="Applied to all relationships">
        <input
          type="number" step="0.1" min="0"
          value={props.aggregationWeight}
          onChange={e => set("aggregationWeight", e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 13, width: 100,
            background: C.bg, border: `1px solid ${C.borderBright}`,
            color: C.text, outline: "none", fontFamily: "inherit",
          }}
        />
      </Row>
    </>
  );
}

// ── Entity property form ──────────────────────────────────────────────────────
function EntityPropsForm({ props, set }) {
  return (
    <>
      <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>MEMBER PROPERTIES</div>
      <Row label="Currency" desc="Default currency for all members">
        <TextInput value={props.currency} onChange={v => set("currency", v)} placeholder="e.g. AUD, USD" />
      </Row>
      <Row label="Is Consolidated" desc="Whether members consolidate to parents">
        <Toggle value={props.isConsolidated} onChange={v => set("isConsolidated", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="Is IC (Intercompany)" desc="Mark as intercompany member">
        <Toggle value={props.isIC} onChange={v => set("isIC", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="Flow Constraint" desc="cubeType value for FlowConstraint">
        <TextInput value={props.flowConstraint} onChange={v => set("flowConstraint", v)} placeholder="root" />
      </Row>
      <Row label="IC Constraint" desc="cubeType value for ICConstraint">
        <TextInput value={props.icConstraint} onChange={v => set("icConstraint", v)} placeholder="Top" />
      </Row>
      {Array.from({ length: 8 }).map((_, i) => (
        <Row key={i + 1} label={`Text${i + 1}`} desc={`Custom text attribute ${i + 1}`}>
          <TextInput value={props[`text${i + 1}`]} onChange={v => set(`text${i + 1}`, v)} placeholder="optional" />
        </Row>
      ))}

      <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: "0.08em", marginTop: 18, marginBottom: 8 }}>RELATIONSHIP PROPERTIES</div>
      <Row label="% Consolidation" desc="PercentConsolidation on all relationships">
        <TextInput value={props.percentConsolidation} onChange={v => set("percentConsolidation", v)} placeholder="100.00" width={120} />
      </Row>
      <Row label="% Ownership" desc="PercentOwnership on all relationships">
        <TextInput value={props.percentOwnership} onChange={v => set("percentOwnership", v)} placeholder="100.00" width={120} />
      </Row>
    </>
  );
}

// ── Account property form ─────────────────────────────────────────────────────
function AccountPropsForm({ props, set }) {
  return (
    <>
      <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>MEMBER PROPERTIES</div>
      <Row label="Allow Input" desc="Whether members accept data input">
        <Toggle value={props.allowInput} onChange={v => set("allowInput", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="Is IC Account" desc="Mark as intercompany account">
        <Toggle value={props.isICAcc} onChange={v => set("isICAcc", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="Is Consolidated" desc="Whether members consolidate to parents">
        <Toggle value={props.isConsolidated} onChange={v => set("isConsolidated", v)}
          options={[{ value: "true", label: "True", color: C.success }, { value: "false", label: "False", color: C.danger }]} />
      </Row>
      <Row label="In Use" desc="Is this account actively in use?">
        <Toggle value={props.inUse} onChange={v => set("inUse", v)}
          options={[{ value: "True", label: "True", color: C.success }, { value: "False", label: "False", color: C.danger }]} />
      </Row>
      {Array.from({ length: 8 }).map((_, i) => (
        <Row key={i + 1} label={`Text${i + 1}`} desc={`Custom text attribute ${i + 1}`}>
          <TextInput value={props[`text${i + 1}`]} onChange={v => set(`text${i + 1}`, v)} placeholder="optional" />
        </Row>
      ))}

      <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: "0.08em", marginTop: 18, marginBottom: 8 }}>RELATIONSHIP PROPERTIES</div>
      <Row label="Aggregation Weight" desc="Applied to all relationships">
        <TextInput value={props.aggregationWeight} onChange={v => set("aggregationWeight", v)} placeholder="1.0" width={100} />
      </Row>
    </>
  );
}

// ── Default props per dim type ────────────────────────────────────────────────
const textDefaults = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`text${i + 1}`, ""]));

const DEFAULT_PROPS = {
  entity: {
    currency: "AUD", isConsolidated: "true", isIC: "true",
    flowConstraint: "root", icConstraint: "Top",
    percentConsolidation: "100.00", percentOwnership: "100.00",
    ...textDefaults
  },
  account: {
    allowInput: "true", isICAcc: "false", isConsolidated: "true",
    inUse: "True", aggregationWeight: "1.0",
    ...textDefaults
  },
  ud: {
    allowInput: "true", isConsolidated: "false", alternateCurrency: "",
    isAttributeMember: "false", aggregationWeight: "1.0",
    ...textDefaults
  },
};

// ── Main StepProperties component ─────────────────────────────────────────────
export function StepProperties({ onSet, initialDimType, initialProps }) {
  const [dimType, setDimType] = useState(initialDimType || null);

  const getDefaults = (type) => {
    if (!type) return {};
    if (type === "Entity") return { ...DEFAULT_PROPS.entity };
    if (type === "Account") return { ...DEFAULT_PROPS.account };
    return { ...DEFAULT_PROPS.ud };
  };

  const [props, setProps] = useState(initialProps || getDefaults(initialDimType));

  const handleSelectType = (type) => {
    setDimType(type);
    
    // Determine categories for resetting props
    const getCat = (t) => t === "Entity" ? "entity" : t === "Account" ? "account" : "ud";
    
    // Only reset props if switching to a different category
    if (!initialProps) {
      setProps(getDefaults(type));
    } else {
      const oldCat = getCat(initialDimType);
      const newCat = getCat(type);
      if (oldCat !== newCat) setProps(getDefaults(type));
    }
  };

  const set = (key, val) => setProps(p => ({ ...p, [key]: val }));

  if (!dimType) return <DimTypeModal onSelect={handleSelectType} />;

  const isEntity = dimType === "Entity";

  return (
    <div>
      <SectionLabel n="5" label="Member Properties"
        sub="Set default property values applied to every member in the output XML." />

      {/* Dim type chip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 22,
        padding: "10px 16px", borderRadius: 10,
        background: C.accentGlow, border: `1px solid ${C.accentDim}`,
      }}>
        <span style={{ fontSize: 18 }}>{isEntity ? "🏢" : dimType === "Account" ? "📊" : "📦"}</span>
        <div>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: "0.08em" }}>DIMENSION TYPE</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{dimType}</div>
        </div>
        <button
          onClick={() => setDimType(null)}
          style={{
            marginLeft: "auto", background: "none", border: `1px solid ${C.border}`,
            color: C.textMuted, fontSize: 11, cursor: "pointer", padding: "4px 12px",
            borderRadius: 6, fontFamily: "inherit",
          }}
        >Change ↩</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        {dimType === "Entity" ? (
          <EntityPropsForm props={props} set={set} />
        ) : dimType === "Account" ? (
          <AccountPropsForm props={props} set={set} />
        ) : (
          <UDPropsForm props={props} set={set} />
        )}
      </div>

      <Btn onClick={() => onSet(dimType, props)}>Continue →</Btn>
    </div>
  );
}
