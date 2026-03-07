import { useState, useRef } from "react";
import * as XLSX from "xlsx";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#07090f", surface: "#0f1120", surfaceHigh: "#171a2e",
  border: "#1e2240", borderBright: "#2a2f55",
  accent: "#4f7cff", accentDim: "#1e2f6e", accentGlow: "rgba(79,124,255,0.15)",
  gold: "#f5c842", success: "#3ddc84", danger: "#ff5a5a", warn: "#f59e0b",
  text: "#e8eaff", textMuted: "#6b74a8", textDim: "#3a3f68",
};
const LV_COLORS = ["#4f7cff","#a855f7","#f5c842","#3ddc84","#ff7a45","#f472b6","#38bdf8","#fb923c"];

// ─── Normalization ────────────────────────────────────────────────────────────
function normalizeName(value) {
  if (value === null || value === undefined) return null;
  let v = String(value).trim();
  v = v.replace(/[&/,\\-]/g, "_");
  v = v.replace(/\s+/g, "_");
  v = v.replace(/[^A-Za-z0-9_]/g, "");
  v = v.replace(/_+/g, "_");
  v = v.replace(/^_+|_+$/g, "");
  return v || null;
}
function escapeXml(value) {
  if (!value) return "";
  return String(value).trim()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

// ─── Build Hierarchy (with cross-level collision resolution) ──────────────────
//
// COLLISION STRATEGY:
//   First pass: collect every raw value per level-slot.
//   Find names that appear in MORE than one level (after normalization).
//   For those collisions, rename to  <NormalizedName>_<LevelLabel>
//   e.g.  "Sales" in L2 → "Sales_L2",  "Sales" in L4 → "Sales_L4"
//   Within the same level, duplicates are just deduplicated (same member, same parent path).
//
function buildHierarchy(rows, mapping, hierarchyOrder, rootName) {
  const members     = {};
  const relationships = [];
  const relPairs    = new Set();
  const warnings    = [];
  const collisions  = []; // { rawName, levels: [L1, L3, ...] }
  const safeKey     = n => (n ? n.toLowerCase() : null);

  // ── Pass 1: figure out which normalized names appear in multiple levels ──
  // levelMembersMap[level] = Set of normalizedNames
  const levelNamesMap = {};
  for (const level of hierarchyOrder) {
    levelNamesMap[level] = new Set();
  }
  for (const row of rows) {
    for (const level of hierarchyOrder) {
      const colIdx = mapping[level];
      if (colIdx === undefined || colIdx === null || colIdx === "") continue;
      const rawVal = row[parseInt(colIdx)];
      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") continue;
      const norm = normalizeName(rawVal);
      if (norm) levelNamesMap[level].add(norm);
    }
  }

  // Find names that collide across levels
  const nameToLevels = {}; // normalizedName → [levels that contain it]
  for (const level of hierarchyOrder) {
    for (const name of levelNamesMap[level]) {
      if (!nameToLevels[name]) nameToLevels[name] = [];
      nameToLevels[name].push(level);
    }
  }
  const collisionSet = new Set(); // normalized names that need renaming
  for (const [name, levels] of Object.entries(nameToLevels)) {
    if (levels.length > 1) {
      collisionSet.add(name);
      collisions.push({ name, levels });
    }
  }

  // ── Helper: get the final member name for a raw value at a given level ──
  const getMemberName = (rawVal, level) => {
    const norm = normalizeName(rawVal);
    if (!norm) return null;
    if (collisionSet.has(norm)) return `${norm}_${level}`;
    return norm;
  };

  // ── Helper: add member ──
  const addMember = (rawVal, level) => {
    const name = getMemberName(rawVal, level);
    if (!name) return null;
    if (!members[name]) {
      const desc = collisionSet.has(normalizeName(rawVal))
        ? `${String(rawVal).trim()} (${level})`
        : String(rawVal).trim();
      members[name] = { name, desc };
    }
    return name;
  };

  // ── Helper: add relationship (with recursion protection) ──
  const addRel = (parent, child, ri, ancestors) => {
    if (!parent || !child) return;
    const pk = safeKey(parent), ck = safeKey(child);
    if (ancestors.has(ck)) {
      warnings.push(`Row ${ri}: SKIPPED recursion — ${parent} → ${child}`);
      return;
    }
    if (relPairs.has(`${ck}::${pk}`)) {
      warnings.push(`Row ${ri}: SKIPPED reverse-recursion — ${parent} → ${child}`);
      return;
    }
    const key = `${pk}::${ck}`;
    if (!relPairs.has(key)) {
      relPairs.add(key);
      relationships.push({ parent, child });
    }
  };

  // ── Add root ──
  const rootNorm = normalizeName(rootName) || rootName;
  members[rootNorm] = { name: rootNorm, desc: "Root Entity" };

  // ── Pass 2: build relationships ──
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    let previous = rootNorm;
    const ancestors = new Set([safeKey(rootNorm)]);

    for (const level of hierarchyOrder) {
      const colIdx = mapping[level];
      if (colIdx === undefined || colIdx === null || colIdx === "") break;
      const rawVal = row[parseInt(colIdx)];
      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") break;

      const name = addMember(rawVal, level);
      if (!name) break;

      addRel(previous, name, ri + 1, ancestors);
      ancestors.add(safeKey(name));
      previous = name;
    }
  }

  return { members, relationships, warnings, collisions };
}

// ─── XML Generation ───────────────────────────────────────────────────────────
function generateMemberXml(members, dimName) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<members dimension="${escapeXml(dimName)}">`,
    ...Object.values(members).map(m =>
      `  <member name="${escapeXml(m.name)}" description="${escapeXml(m.desc)}" displayMemberGroup="Everyone"></member>`
    ),
    `</members>`,
  ].join("\n");
}
function generateRelXml(relationships, dimName) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<relationships dimension="${escapeXml(dimName)}">`,
    ...relationships.map(r =>
      `  <relationship parent="${escapeXml(r.parent)}" child="${escapeXml(r.child)}"></relationship>`
    ),
    `</relationships>`,
  ].join("\n");
}
function downloadFile(content, filename, type = "text/xml") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Excel Parser ─────────────────────────────────────────────────────────────
function parseWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        resolve(wb);
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseSheet(wb, sheetName, headerRow = 0) {
  const ws = wb.Sheets[sheetName];
  const allData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const hdrs = (allData[headerRow] || []).map(h => String(h ?? "").trim());
  const rows = allData.slice(headerRow + 1);
  return { headers: hdrs, rows, allData };
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "primary", disabled, small, style }) {
  const vs = {
    primary: { background: C.accent, color: "#fff", boxShadow: `0 4px 20px ${C.accentGlow}` },
    ghost:   { background: C.surfaceHigh, color: C.text, border: `1px solid ${C.border}` },
    success: { background: C.success, color: "#000" },
    gold:    { background: C.gold, color: "#000" },
    danger:  { background: C.danger, color: "#fff" },
    warn:    { background: C.warn, color: "#000" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      padding: small ? "6px 14px" : "10px 22px", borderRadius: 9, fontWeight: 700,
      fontSize: small ? 12 : 14, cursor: disabled ? "not-allowed" : "pointer",
      border: "none", letterSpacing: "0.02em", transition: "all 0.2s",
      opacity: disabled ? 0.38 : 1, fontFamily: "inherit", ...vs[variant], ...style,
    }}>{children}</button>
  );
}

function SectionLabel({ n, label, sub }) {
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
      {sub && <p style={{ margin: "8px 0 0 38px", fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{sub}</p>}
    </div>
  );
}

// ─── Excel Preview (persistent right panel) ───────────────────────────────────
function ExcelPreview({ excelData, mapping, headers }) {
  if (!excelData) return null;
  const colToLevel = {}, colToColor = {};
  if (mapping) {
    Object.entries(mapping).forEach(([level, colIdx]) => {
      if (colIdx !== "" && colIdx !== undefined) {
        const idx = parseInt(colIdx);
        colToLevel[idx] = level;
        colToColor[idx] = LV_COLORS[parseInt(level.replace("L","")) - 1];
      }
    });
  }
  const previewRows = excelData.rows.slice(0, 12);
  const visibleCols = Math.min(headers.length, 10);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Source Preview</span>
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>
          {excelData.rows.length.toLocaleString()} rows · {headers.length} cols
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {headers.slice(0, visibleCols).map((h, ci) => {
                const isMapped = colToLevel[ci] !== undefined;
                const color = colToColor[ci];
                return (
                  <th key={ci} style={{
                    padding: "9px 12px", textAlign: "left", fontWeight: 700,
                    background: isMapped ? color + "28" : C.surfaceHigh,
                    color: isMapped ? color : C.textMuted,
                    borderBottom: isMapped ? `2px solid ${color}` : `1px solid ${C.border}`,
                    borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  }}>
                    {isMapped && (
                      <span style={{ display: "inline-block", background: color, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 800, marginRight: 5 }}>
                        {colToLevel[ci]}
                      </span>
                    )}
                    {h || `Col ${ci+1}`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: `1px solid ${C.border}` }}>
                {Array.from({ length: visibleCols }, (_, ci) => {
                  const isMapped = colToLevel[ci] !== undefined;
                  const color = colToColor[ci];
                  return (
                    <td key={ci} style={{
                      padding: "6px 12px",
                      background: isMapped ? color + "0d" : "transparent",
                      color: isMapped ? color : C.textMuted,
                      fontWeight: isMapped ? 600 : 400,
                      borderRight: `1px solid ${C.border}`,
                      whiteSpace: "nowrap",
                      borderLeft: isMapped ? `2px solid ${color}44` : "none",
                    }}>
                      {row[ci] !== null && row[ci] !== undefined ? String(row[ci]) : <span style={{ color: C.textDim }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {headers.length > visibleCols && (
        <div style={{ padding: "6px 14px", background: C.surfaceHigh, fontSize: 10, color: C.textDim }}>
          +{headers.length - visibleCols} more columns
        </div>
      )}
    </div>
  );
}

// ─── STEP 1: Upload + Sheet Picker ────────────────────────────────────────────
function StepUpload({ onData }) {
  const [dragging, setDragging]   = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [wb, setWb]               = useState(null);
  const [fileName, setFileName]   = useState("");
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [preview, setPreview]     = useState(null);
  const inputRef = useRef();

  const handleFile = async (f) => {
    if (!f) return;
    setLoading(true); setError("");
    try {
      const workbook = await parseWorkbook(f);
      setWb(workbook);
      setFileName(f.name);
      setSheetNames(workbook.SheetNames);
      setSelectedSheet(workbook.SheetNames[0]);
      // preview first sheet, row 0
      const data = parseSheet(workbook, workbook.SheetNames[0], 0);
      setPreview(data.allData.slice(0, 8));
      setHeaderRow(0);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleSheetChange = (name) => {
    setSelectedSheet(name);
    const data = parseSheet(wb, name, headerRow);
    setPreview(data.allData.slice(0, 8));
  };

  const handleHeaderRowChange = (i) => {
    setHeaderRow(i);
    const data = parseSheet(wb, selectedSheet, i);
    setPreview(data.allData.slice(0, 8));
  };

  const confirm = () => {
    try {
      const result = parseSheet(wb, selectedSheet, headerRow);
      if (!result.rows.length) throw new Error("No data rows found after the header.");
      onData(result, fileName, selectedSheet);
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <SectionLabel n="1" label="Upload Excel File" sub="All sheets are detected automatically — you'll pick which one to use." />

      {!wb ? (
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? C.accent : C.borderBright}`, borderRadius: 14,
            padding: "52px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? C.accentGlow : C.surfaceHigh, transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>Drop your Excel file here</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 5 }}>or click to browse · .xlsx / .xls</div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      ) : (
        <div>
          {/* File badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 18 }}>
            <span>📄</span>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{fileName}</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>· {sheetNames.length} sheet{sheetNames.length > 1 ? "s" : ""}</span>
            <Btn variant="ghost" small onClick={() => { setWb(null); setPreview(null); setSheetNames([]); }} style={{ marginLeft: "auto" }}>Change</Btn>
          </div>

          {/* Sheet picker */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700 }}>SELECT SHEET</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sheetNames.map(name => (
                <div key={name} onClick={() => handleSheetChange(name)} style={{
                  padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: selectedSheet === name ? C.accent : C.surfaceHigh,
                  color: selectedSheet === name ? "#fff" : C.textMuted,
                  border: `1px solid ${selectedSheet === name ? C.accent : C.border}`,
                  transition: "all 0.15s",
                  maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  title: name,
                }}>{name}</div>
              ))}
            </div>
          </div>

          {/* Header row picker */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700 }}>HEADER ROW</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[0,1,2,3,4,5,6,7].map(i => (
                <div key={i} onClick={() => handleHeaderRowChange(i)} style={{
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
                  background: headerRow === i ? C.accentDim : C.bg,
                  color: headerRow === i ? C.accent : C.textMuted,
                  border: `1px solid ${headerRow === i ? C.accent : C.border}`, transition: "all 0.15s",
                }}>Row {i+1}</div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          {preview && (
            <div style={{ overflowX: "auto", marginBottom: 18, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} style={{
                      background: ri === headerRow ? "rgba(79,124,255,0.14)" : ri % 2 === 0 ? "transparent" : C.surfaceHigh + "55",
                      borderBottom: `1px solid ${C.border}`
                    }}>
                      <td style={{ padding: "6px 10px", color: ri === headerRow ? C.accent : C.textDim, fontFamily: "monospace", fontSize: 10, borderRight: `1px solid ${C.border}`, minWidth: 60, fontWeight: ri === headerRow ? 700 : 400 }}>
                        {ri === headerRow ? "► HEADER" : `row ${ri+1}`}
                      </td>
                      {(Array.isArray(row) ? row : []).slice(0, 9).map((cell, ci) => (
                        <td key={ci} style={{ padding: "6px 10px", color: ri === headerRow ? C.accent : C.text, fontWeight: ri === headerRow ? 700 : 400, whiteSpace: "nowrap" }}>
                          {String(cell ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Btn onClick={confirm}>Use "{selectedSheet}" · Row {headerRow+1} as Header →</Btn>
        </div>
      )}

      {loading && <div style={{ color: C.accent, marginTop: 12, fontSize: 13 }}>⏳ Reading file…</div>}
      {error && <div style={{ color: C.danger, marginTop: 12, fontSize: 13 }}>⚠ {error}</div>}
    </div>
  );
}

// ─── STEP 2: Levels ───────────────────────────────────────────────────────────
function StepLevels({ onSet }) {
  const [n, setN] = useState(3);
  return (
    <div>
      <SectionLabel n="2" label="Hierarchy Depth" sub="How many levels does this dimension have?" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {[2,3,4,5,6,7,8].map(v => (
          <div key={v} onClick={() => setN(v)} style={{
            width: 62, height: 62, borderRadius: 12, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", cursor: "pointer",
            background: n === v ? C.accent : C.surfaceHigh,
            border: `2px solid ${n === v ? C.accent : C.border}`,
            boxShadow: n === v ? `0 0 18px ${C.accentGlow}` : "none", transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: n === v ? "#fff" : C.textMuted }}>{v}</span>
            <span style={{ fontSize: 9, color: n === v ? "rgba(255,255,255,0.6)" : C.textDim }}>levels</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} style={{ background: LV_COLORS[i]+"22", color: LV_COLORS[i], border: `1px solid ${LV_COLORS[i]}44`, borderRadius: 6, padding: "3px 12px", fontWeight: 700, fontSize: 13 }}>L{i+1}</span>
        ))}
      </div>
      <Btn onClick={() => onSet(n)}>Continue →</Btn>
    </div>
  );
}

// ─── STEP 3: Column Mapping ───────────────────────────────────────────────────
function StepMapping({ headers, maxLevels, onSet, mapping, setMapping }) {
  const allMapped = Array.from({ length: maxLevels }, (_, i) => `L${i+1}`).every(l => mapping[l] !== "");

  return (
    <div>
      <SectionLabel n="3" label="Map Columns to Levels" sub="Select which Excel column maps to each level. The preview panel highlights live." />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {Array.from({ length: maxLevels }, (_, i) => {
          const level = `L${i+1}`;
          const color = LV_COLORS[i];
          const mapped = mapping[level] !== "";
          return (
            <div key={level} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              borderRadius: 12, background: mapped ? color + "12" : C.surfaceHigh,
              border: `1.5px solid ${mapped ? color + "66" : C.border}`, transition: "all 0.2s",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: color + (mapped ? "33" : "18"), border: `2px solid ${color + (mapped ? "88" : "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, color, fontSize: 14,
              }}>{level}</div>
              <div style={{ flex: 1 }}>
                <select
                  value={mapping[level]}
                  onChange={e => setMapping(prev => ({ ...prev, [level]: e.target.value }))}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
                    background: mapped ? color + "18" : C.bg,
                    border: `1.5px solid ${mapped ? color + "66" : C.borderBright}`,
                    color: mapped ? color : C.textMuted, outline: "none",
                    cursor: "pointer", fontWeight: mapped ? 700 : 400, fontFamily: "inherit",
                  }}
                >
                  <option value="">— select a column —</option>
                  {headers.map((h, idx) => (
                    <option key={idx} value={idx}>{h || `Column ${idx+1}`}</option>
                  ))}
                </select>
              </div>
              {mapped && <span style={{ fontSize: 18, color: C.success, flexShrink: 0 }}>✓</span>}
            </div>
          );
        })}
      </div>

      {Object.values(mapping).some(v => v !== "") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18, padding: 12, background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11, color: C.textMuted, alignSelf: "center", marginRight: 4 }}>Mapped:</span>
          {Array.from({ length: maxLevels }, (_, i) => {
            const level = `L${i+1}`;
            if (mapping[level] === "") return null;
            const color = LV_COLORS[i];
            const colName = headers[parseInt(mapping[level])] || `Col ${parseInt(mapping[level])+1}`;
            return (
              <span key={level} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: color+"22", border: `1px solid ${color}55`, borderRadius: 20, padding: "3px 10px", fontSize: 12 }}>
                <span style={{ fontWeight: 800, color }}>{level}</span>
                <span style={{ color: C.textDim }}>→</span>
                <span style={{ color, fontWeight: 600 }}>{colName}</span>
              </span>
            );
          })}
        </div>
      )}

      <Btn onClick={() => onSet(mapping)} disabled={!allMapped}>
        {allMapped ? "Confirm Mapping →" : `Map all ${maxLevels} levels to continue`}
      </Btn>
    </div>
  );
}

// ─── STEP 4: Hierarchy Order ──────────────────────────────────────────────────
function StepHierarchyOrder({ maxLevels, mapping, headers, onSet }) {
  const levels = Array.from({ length: maxLevels }, (_, i) => `L${i+1}`);
  const [order, setOrder] = useState([...levels]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const move = (from, to) => {
    const arr = [...order]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); setOrder(arr);
  };
  return (
    <div>
      <SectionLabel n="4" label="Parent → Child Flow" sub="Drag to reorder. Leftmost = root. Each level's parent is the one to its left." />
      <div style={{ display: "flex", alignItems: "center", overflowX: "auto", padding: "16px 4px", marginBottom: 16 }}>
        {order.map((level, idx) => {
          const colIdx = parseInt(mapping[level]);
          const colName = headers[colIdx] || level;
          const color = LV_COLORS[levels.indexOf(level)];
          const isOver = overIdx === idx;
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
                  background: color+"22", border: `2px solid ${isOver ? color : color+"55"}`,
                  boxShadow: isOver ? `0 0 22px ${color}55` : "none",
                  transform: isOver ? "scale(1.07)" : "scale(1)", transition: "all 0.15s",
                }}
              >
                <div style={{ fontWeight: 800, color, fontSize: 14 }}>{level}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colName}</div>
              </div>
              {idx < order.length - 1 && <div style={{ padding: "0 6px", color: C.textDim, fontSize: 20, flexShrink: 0 }}>→</div>}
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom: 20, padding: 14, background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace", letterSpacing: "0.06em" }}>PARENT RELATIONSHIPS</div>
        {order.map((level, idx) => {
          const color = LV_COLORS[levels.indexOf(level)];
          const parentLevel = idx > 0 ? order[idx-1] : null;
          const parentColor = parentLevel ? LV_COLORS[levels.indexOf(parentLevel)] : null;
          const colName = headers[parseInt(mapping[level])] || level;
          return (
            <div key={level} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color, minWidth: 30, fontSize: 13 }}>{level}</span>
              <span style={{ color: C.textDim, fontSize: 11 }}>({colName})</span>
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

// ─── STEP 5: Config ───────────────────────────────────────────────────────────
function StepConfig({ onSet }) {
  const [rootName, setRootName] = useState("Region");
  const [dimName, setDimName]   = useState("Region");
  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 14,
    background: C.bg, border: `1px solid ${C.borderBright}`, color: C.text,
    outline: "none", fontFamily: "inherit",
  };
  return (
    <div>
      <SectionLabel n="5" label="Dimension & Root Config" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 22 }}>
        <div>
          <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Root Member Name</label>
          <input value={rootName} onChange={e => setRootName(e.target.value)} style={inputStyle} placeholder="e.g. Region, Entity, Total" />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Added automatically as the top-level parent</div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Dimension Name</label>
          <input value={dimName} onChange={e => setDimName(e.target.value)} style={inputStyle} placeholder="e.g. Region, Entity" />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
            Output: <span style={{ color: C.accent }}>{dimName||"Dim"}MEM.xml</span> + <span style={{ color: C.accent }}>{dimName||"Dim"}REL.xml</span>
          </div>
        </div>
      </div>
      <Btn onClick={() => onSet(rootName.trim()||"Root", dimName.trim()||"Dimension")} disabled={!rootName.trim()}>
        Review & Generate →
      </Btn>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ headers, mapping, hierarchyOrder, rowCount, sheetName, rootName, dimName, onConfirm, onEdit }) {
  const levels = Object.keys(mapping).sort();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,5,12,0.92)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.borderBright}`, borderRadius: 20,
        padding: 36, width: "100%", maxWidth: 520,
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        animation: "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <style>{`@keyframes popIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Confirm Before Generating</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["Source rows", rowCount.toLocaleString()], ["Sheet", sheetName], ["Root member", rootName], ["Dimension", dimName], ["Levels", levels.length]].map(([k,v]) => (
            <div key={k} style={{ padding: "9px 12px", background: C.surfaceHigh, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{k}</div>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>COLUMN MAPPING</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {levels.map((level, i) => {
            const colIdx = parseInt(mapping[level]);
            const color = LV_COLORS[i];
            return (
              <span key={level} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: color+"22", border: `1px solid ${color}55`, borderRadius: 20, padding: "4px 10px", fontSize: 12 }}>
                <span style={{ fontWeight: 800, color }}>{level}</span>
                <span style={{ color: C.textDim }}>→</span>
                <span style={{ color, fontWeight: 600 }}>{headers[colIdx]||`Col ${colIdx+1}`}</span>
              </span>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>HIERARCHY FLOW</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 24 }}>
          <span style={{ background: C.surfaceHigh, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{rootName}</span>
          <span style={{ color: C.textDim }}>→</span>
          {hierarchyOrder.map((lv, idx) => {
            const color = LV_COLORS[levels.indexOf(lv)];
            return (
              <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ background: color+"22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{lv}</span>
                {idx < hierarchyOrder.length - 1 && <span style={{ color: C.textDim }}>→</span>}
              </span>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="success" onClick={onConfirm} style={{ flex: 1 }}>✓ Generate XML Files</Btn>
          <Btn variant="ghost" onClick={onEdit} style={{ flex: 1 }}>← Edit</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Result Panel ─────────────────────────────────────────────────────────────
function ResultPanel({ result, dimName, onReset }) {
  const { members, relationships, warnings, collisions } = result;
  const memberList = Object.values(members);
  const memberXml  = generateMemberXml(members, dimName);
  const relXml     = generateRelXml(relationships, dimName);
  const [activeTab, setActiveTab] = useState(collisions.length > 0 ? "collisions" : "members");

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.1em", marginBottom: 4 }}>COMPLETE</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.success }}>✓ XML Ready to Download</h2>
        <p style={{ margin: "5px 0 0", fontSize: 13, color: C.textMuted }}>
          {memberList.length.toLocaleString()} members · {relationships.length.toLocaleString()} relationships · {warnings.length} skipped
          {collisions.length > 0 && <span style={{ color: C.warn }}> · {collisions.length} name collision{collisions.length>1?"s":""} resolved</span>}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: "Members",       value: memberList.length,    color: C.accent },
          { label: "Relationships", value: relationships.length, color: C.success },
          { label: "Collisions",    value: collisions.length,    color: collisions.length > 0 ? C.warn : C.textDim },
          { label: "Warnings",      value: warnings.length,      color: warnings.length > 0 ? C.danger : C.textDim },
        ].map(s => (
          <div key={s.label} style={{ padding: "10px 16px", borderRadius: 10, background: s.color+"18", border: `1px solid ${s.color}44` }}>
            <div style={{ fontWeight: 800, color: s.color, fontSize: 20 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <Btn variant="gold"    onClick={() => downloadFile(memberXml, `${dimName}MEM.xml`)}>⬇ {dimName}MEM.xml</Btn>
        <Btn variant="primary" onClick={() => downloadFile(relXml,    `${dimName}REL.xml`)}>⬇ {dimName}REL.xml</Btn>
        {warnings.length > 0 && (
          <Btn variant="ghost" onClick={() => downloadFile(warnings.join("\n"), `${dimName}_warnings.txt`, "text/plain")}>⬇ Warnings ({warnings.length})</Btn>
        )}
      </div>

      {/* Tabs */}
      <div>
        <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
          {[
            { key: "members",       label: `Members (${memberList.length})` },
            { key: "relationships", label: `Relationships (${relationships.length})` },
            { key: "collisions",    label: `Collisions (${collisions.length})` },
            { key: "warnings",      label: `Warnings (${warnings.length})` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "8px 14px", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 700, borderRadius: "8px 8px 0 0",
              background: activeTab === tab.key ? C.surfaceHigh : "transparent",
              color: activeTab === tab.key ? C.text : C.textMuted,
              borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : "2px solid transparent",
            }}>{tab.label}</button>
          ))}
        </div>

        <div style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: "0 8px 8px 8px", padding: 14, maxHeight: 280, overflowY: "auto" }}>

          {/* Collisions tab — most important new feature */}
          {activeTab === "collisions" && (
            collisions.length === 0
              ? <div style={{ color: C.success, fontSize: 13 }}>✓ No cross-level name collisions found</div>
              : (
                <div>
                  <div style={{ fontSize: 12, color: C.warn, marginBottom: 12, padding: "8px 12px", background: C.warn+"15", borderRadius: 8, border: `1px solid ${C.warn}44` }}>
                    ⚠ These member names appeared in multiple levels. They have been renamed to <code style={{ color: C.accent }}>Name_Lx</code> to avoid OneStream conflicts.
                  </div>
                  {collisions.map((c, i) => (
                    <div key={i} style={{ marginBottom: 12, padding: "10px 14px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                        Original name: <span style={{ color: C.text, fontWeight: 700 }}>{c.name}</span> appeared in levels: {c.levels.map((lv,li) => {
                          const color = LV_COLORS[parseInt(lv.replace("L",""))-1];
                          return <span key={lv} style={{ background: color+"22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700, marginLeft: 4 }}>{lv}</span>;
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {c.levels.map(lv => {
                          const color = LV_COLORS[parseInt(lv.replace("L",""))-1];
                          return (
                            <div key={lv} style={{ display: "flex", alignItems: "center", gap: 6, background: color+"15", border: `1px solid ${color}33`, borderRadius: 6, padding: "4px 10px" }}>
                              <span style={{ fontSize: 10, color: C.textDim }}>was</span>
                              <span style={{ color: C.text, fontWeight: 600, fontSize: 12 }}>{c.name}</span>
                              <span style={{ fontSize: 10, color: C.textDim }}>→ now</span>
                              <span style={{ color, fontWeight: 800, fontSize: 12, fontFamily: "monospace" }}>{c.name}_{lv}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}

          {activeTab === "members" && (
            memberXml.split("\n").slice(0, 80).map((line, i) => (
              <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: line.includes("<member") ? C.text : C.textMuted, marginBottom: 1, whiteSpace: "pre" }}>{line}</div>
            ))
          )}

          {activeTab === "relationships" && (
            relXml.split("\n").slice(0, 80).map((line, i) => (
              <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: line.includes("<relationship") ? C.text : C.textMuted, marginBottom: 1, whiteSpace: "pre" }}>{line}</div>
            ))
          )}

          {activeTab === "warnings" && (
            warnings.length === 0
              ? <div style={{ color: C.success, fontSize: 13 }}>✓ No warnings</div>
              : warnings.map((w, i) => <div key={i} style={{ color: C.danger, fontSize: 12, marginBottom: 4, fontFamily: "monospace" }}>{w}</div>)
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Btn variant="ghost" small onClick={onReset}>↺ Start Over</Btn>
      </div>
    </div>
  );
}

// ─── Step Sidebar ─────────────────────────────────────────────────────────────
function StepSidebar({ step, sheetName }) {
  const steps = ["Upload", "Levels", "Map Columns", "Order", "Config"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {sheetName && (
        <div style={{ padding: "8px 12px", marginBottom: 8, background: C.accentGlow, borderRadius: 8, border: `1px solid ${C.accentDim}` }}>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, marginBottom: 2 }}>ACTIVE SHEET</div>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sheetName}</div>
        </div>
      )}
      {steps.map((label, i) => {
        const n = i+1;
        const done = step > n, active = step === n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: active ? C.accentGlow : "transparent", border: `1px solid ${active ? C.accent+"44" : "transparent"}` }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800,
              background: done ? C.success : active ? C.accent : C.surfaceHigh,
              color: done || active ? "#fff" : C.textDim,
              border: `1.5px solid ${done ? C.success : active ? C.accent : C.border}`,
            }}>{done ? "✓" : n}</div>
            <span style={{ fontSize: 13, color: active ? C.text : done ? C.success : C.textDim, fontWeight: active || done ? 700 : 400 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]               = useState(1);
  const [excelData, setExcelData]     = useState(null);
  const [fileName, setFileName]       = useState("");
  const [sheetName, setSheetName]     = useState("");
  const [maxLevels, setMaxLevels]     = useState(null);
  const [mapping, setMapping]         = useState({});
  const [hierarchyOrder, setHierarchyOrder] = useState(null);
  const [rootName, setRootName]       = useState(null);
  const [dimName, setDimName]         = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult]           = useState(null);

  const initMapping = (n) => {
    const m = {};
    for (let i = 1; i <= n; i++) m[`L${i}`] = "";
    setMapping(m);
  };

  const reset = () => {
    setStep(1); setExcelData(null); setFileName(""); setSheetName("");
    setMaxLevels(null); setMapping({}); setHierarchyOrder(null);
    setRootName(null); setDimName(null); setShowConfirm(false); setResult(null);
  };

  return (
    <div style={{ minHeight: "100vh", minWidth: "100vw", width: "100vw", background: C.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text }}>
      <style>{`* { box-sizing: border-box; } select option { background: #0f1120; } ::-webkit-scrollbar { width: 5px; height: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1e2240; border-radius: 3px; }`}</style>

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 28px", display: "flex", alignItems: "center", gap: 16, background: C.surface, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ background: C.accentGlow, border: `1px solid ${C.accentDim}`, borderRadius: 8, padding: "4px 12px" }}>
          <span style={{ fontSize: 12, color: C.accent, fontWeight: 800, letterSpacing: "0.12em" }}>ONESTREAM</span>
        </div>
        <div>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Metadata Builder</span>
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 10 }}>Excel → MEM.xml + REL.xml</span>
        </div>
        {fileName && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surfaceHigh, padding: "4px 12px", borderRadius: 20, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12 }}>📄</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{fileName}</span>
              {sheetName && <span style={{ fontSize: 11, color: C.accent, background: C.accentGlow, padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>{sheetName}</span>}
            </div>
            <Btn variant="ghost" small onClick={reset}>↺ Reset</Btn>
          </div>
        )}
      </div>

      {/* Main 3-col layout */}
      <div style={{
        display: "grid",
        gridTemplateColumns: excelData && !result ? "200px 1fr 1fr" : excelData && result ? "200px 1fr 1fr" : "1fr",
        minHeight: "calc(100vh - 57px)",
        width: "100vw",
      }}>
        {excelData && (
          <div style={{ borderRight: `1px solid ${C.border}`, padding: "24px 16px", background: C.surface, position: "sticky", top: 57, alignSelf: "start", height: "calc(100vh - 57px)", overflowY: "auto" }}>
            <StepSidebar step={step} sheetName={sheetName} />
          </div>
        )}

        <div style={{ padding: "28px", borderRight: excelData && !result ? `1px solid ${C.border}` : "none", overflowY: "auto" }}>
          {step === 1 && (
            <StepUpload onData={(data, name, sheet) => { setExcelData(data); setFileName(name); setSheetName(sheet); setStep(2); }} />
          )}
          {step === 2 && <StepLevels onSet={(n) => { setMaxLevels(n); initMapping(n); setStep(3); }} />}
          {step === 3 && excelData && (
            <StepMapping headers={excelData.headers} maxLevels={maxLevels} mapping={mapping} setMapping={setMapping} onSet={(m) => { setMapping(m); setStep(4); }} />
          )}
          {step === 4 && excelData && (
            <StepHierarchyOrder maxLevels={maxLevels} mapping={mapping} headers={excelData.headers} onSet={(o) => { setHierarchyOrder(o); setStep(5); }} />
          )}
          {step === 5 && <StepConfig onSet={(root, dim) => { setRootName(root); setDimName(dim); setShowConfirm(true); }} />}
          {result && <ResultPanel result={result} dimName={dimName} onReset={reset} />}
        </div>

        {excelData && !result && (
          <div style={{ padding: "28px 24px", overflowY: "auto", background: C.bg }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 12 }}>EXCEL PREVIEW</div>
            <ExcelPreview excelData={excelData} mapping={step >= 3 ? mapping : null} headers={excelData.headers} />
            {step >= 3 && Object.values(mapping).some(v => v !== "") && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>COLUMN LEGEND</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(mapping).filter(([,v]) => v !== "").map(([level, colIdx]) => {
                    const color = LV_COLORS[parseInt(level.replace("L",""))-1];
                    const colName = excelData.headers[parseInt(colIdx)] || `Column ${parseInt(colIdx)+1}`;
                    return (
                      <div key={level} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: color+"15", borderRadius: 8, border: `1px solid ${color}33` }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 800, color, fontSize: 13 }}>{level}</span>
                        <span style={{ color: C.textMuted, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          headers={excelData.headers}
          mapping={mapping}
          hierarchyOrder={hierarchyOrder}
          rowCount={excelData.rows.length}
          sheetName={sheetName}
          rootName={rootName}
          dimName={dimName}
          onConfirm={() => {
            const r = buildHierarchy(excelData.rows, mapping, hierarchyOrder, rootName);
            setResult(r); setShowConfirm(false); setStep(6);
          }}
          onEdit={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
