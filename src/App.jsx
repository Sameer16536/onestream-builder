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

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 50;
const CHUNK_SIZE       = 5000;
const WARN_ROWS        = 50000;
const MAX_MEMBER_NAME  = 100;
const VALID_EXTENSIONS = [".xlsx", ".xls"];

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}
function normalizeName(value) {
  if (value === null || value === undefined) return null;
  let v = String(value).trim();
  if (!v) return null;
  v = v.replace(/[&/,\\-]/g, "_");
  v = v.replace(/\s+/g, "_");
  v = v.replace(/[^A-Za-z0-9_]/g, "");
  v = v.replace(/_+/g, "_");
  v = v.replace(/^_+|_+$/g, "");
  if (!v) return null;
  if (v.length > MAX_MEMBER_NAME) v = v.slice(0, MAX_MEMBER_NAME);
  return v;
}
function escapeXml(value) {
  if (!value) return "";
  return String(value).trim()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateFile(file) {
  const errors = [];
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext)) errors.push(`Invalid file type "${ext}". Only .xlsx and .xls are supported.`);
  if (file.size > MAX_FILE_SIZE_MB * 1048576) errors.push(`File is ${formatBytes(file.size)}, exceeding the ${MAX_FILE_SIZE_MB}MB browser limit.`);
  if (file.size === 0) errors.push("File is empty.");
  return errors;
}
function validateSheet(data, headerRow) {
  const errors = [], warnings = [];
  if (!data || data.length === 0) { errors.push("Sheet appears to be empty."); return { errors, warnings }; }
  if (headerRow >= data.length) { errors.push(`Header row ${headerRow+1} doesn't exist.`); return { errors, warnings }; }
  const headers = (data[headerRow] || []).map(h => String(h ?? "").trim());
  const emptyH = headers.filter(h => !h).length;
  if (emptyH > 0) warnings.push(`${emptyH} column(s) have blank headers.`);
  const dataRows = data.slice(headerRow+1).filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ""));
  if (dataRows.length === 0) errors.push("No data rows found after the header row.");
  if (dataRows.length > WARN_ROWS) warnings.push(`${dataRows.length.toLocaleString()} rows detected. Processing may take a few seconds.`);
  return { errors, warnings };
}
function validateMapping(mapping, headers, maxLevels) {
  const errors = [], warnings = [];
  const usedCols = new Set();
  for (let i = 1; i <= maxLevels; i++) {
    const level = `L${i}`;
    const colIdx = mapping[level];
    if (colIdx === "" || colIdx === undefined) { errors.push(`${level} has no column mapped.`); continue; }
    const idx = parseInt(colIdx);
    if (usedCols.has(idx)) warnings.push(`Column "${headers[idx]}" is mapped to multiple levels.`);
    usedCols.add(idx);
  }
  return { errors, warnings };
}

// ─── Core Build ───────────────────────────────────────────────────────────────
// collisionMode: "rename"  → North_America_L1 / North_America_L3
//                "collapse" → skip consecutive duplicate, attach child directly to last distinct parent
async function buildHierarchyAsync(rows, mapping, hierarchyOrder, rootName, collisionMode, onProgress) {
  return new Promise((resolve) => {
    const members      = {};
    const relationships = [];
    const relPairs     = new Set();
    const assignedParent = new Set();   // single-parent enforcement
    const warnings     = [];
    const collisions   = [];
    const dataQuality  = { emptyRows: 0, truncatedNames: [], partialRows: [], collapsedDupes: [] };
    const safeKey      = n => n ? n.toLowerCase() : null;

    // ── Pass 1: detect cross-level name collisions ────────────────────────
    const levelNamesMap = {};
    hierarchyOrder.forEach(l => { levelNamesMap[l] = new Set(); });
    for (const row of rows) {
      for (const level of hierarchyOrder) {
        const colIdx = mapping[level];
        if (colIdx === "" || colIdx === undefined) continue;
        const rawVal = row[parseInt(colIdx)];
        if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") continue;
        const norm = normalizeName(rawVal);
        if (norm) levelNamesMap[level].add(norm);
      }
    }
    const nameToLevels = {};
    for (const level of hierarchyOrder) {
      for (const name of levelNamesMap[level]) {
        if (!nameToLevels[name]) nameToLevels[name] = [];
        nameToLevels[name].push(level);
      }
    }
    const collisionSet = new Set();
    for (const [name, levels] of Object.entries(nameToLevels)) {
      if (levels.length > 1) { collisionSet.add(name); collisions.push({ name, levels }); }
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    const getMemberName = (rawVal, level) => {
      const norm = normalizeName(rawVal);
      if (!norm) return null;
      const original = rawVal ? String(rawVal).trim() : "";
      if (norm.length === MAX_MEMBER_NAME && original.length > MAX_MEMBER_NAME) {
        dataQuality.truncatedNames.push({ original, normalized: norm, level });
      }
      if (collisionSet.has(norm)) {
        // rename mode: always suffix with level
        // collapse mode: still suffix — collapse only affects hierarchy structure, not naming
        return `${norm}_${level}`;
      }
      return norm;
    };

    const addMember = (rawVal, level) => {
      const name = getMemberName(rawVal, level);
      if (!name) return null;
      if (!members[name]) {
        const rawStr = String(rawVal).trim();
        const desc = collisionSet.has(normalizeName(rawVal)) ? `${rawStr} (${level})` : rawStr;
        members[name] = { name, desc };
      }
      return name;
    };

    const addRel = (parent, child, ri, ancestors) => {
      if (!parent || !child) return;
      const pk = safeKey(parent), ck = safeKey(child);

      // Single-parent enforcement
      if (assignedParent.has(ck)) {
        warnings.push(`Row ${ri}: SKIPPED — "${child}" already has a parent, cannot also be child of "${parent}"`);
        return;
      }
      // Recursion protection
      if (ancestors.has(ck)) {
        warnings.push(`Row ${ri}: SKIPPED recursion — "${parent}" → "${child}"`);
        return;
      }
      // Reverse-recursion protection
      if (relPairs.has(`${ck}::${pk}`)) {
        warnings.push(`Row ${ri}: SKIPPED reverse-recursion — "${parent}" → "${child}"`);
        return;
      }
      const key = `${pk}::${ck}`;
      if (!relPairs.has(key)) {
        relPairs.add(key);
        assignedParent.add(ck);
        relationships.push({ parent, child });
      }
    };

    // Root
    const rootNorm = normalizeName(rootName) || rootName;
    members[rootNorm] = { name: rootNorm, desc: "Root Entity" };

    // ── Pass 2: chunked row processing ────────────────────────────────────
    let i = 0;
    const processChunk = () => {
      const end = Math.min(i + CHUNK_SIZE, rows.length);
      for (; i < end; i++) {
        const row = rows[i];

        // Skip fully empty rows
        const hasAnyValue = hierarchyOrder.some(level => {
          const colIdx = mapping[level];
          if (colIdx === "" || colIdx === undefined) return false;
          const v = row[parseInt(colIdx)];
          return v !== null && v !== undefined && String(v).trim() !== "";
        });
        if (!hasAnyValue) { dataQuality.emptyRows++; continue; }

        let previous = rootNorm;
        const ancestors = new Set([safeKey(rootNorm)]);

        // Collect the raw values for this row per level first
        // so we can apply collapse logic
        const levelValues = hierarchyOrder.map(level => {
          const colIdx = mapping[level];
          if (colIdx === "" || colIdx === undefined) return null;
          const rawVal = row[parseInt(colIdx)];
          if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") return null;
          return { level, rawVal };
        });

        // ── COLLAPSE MODE ──────────────────────────────────────────────────
        // Walk levels, skip any value that is identical (case-insensitive,
        // after normalization) to the PREVIOUS non-null value in the chain.
        // America → North_America → North_America → na123
        //                           ^^^^^^^^^^^^^ skipped → na123 attaches to North_America
        if (collisionMode === "collapse") {
          let lastDistinctNorm = safeKey(rootNorm);
          for (const entry of levelValues) {
            if (!entry) break;
            const { level, rawVal } = entry;
            const name = addMember(rawVal, level);
            if (!name) break;
            const normKey = safeKey(name);

            if (normKey === lastDistinctNorm) {
              // Consecutive duplicate — skip, don't advance `previous`
              dataQuality.collapsedDupes.push({ rowIndex: i+1, level, value: String(rawVal).trim() });
              continue;
            }

            addRel(previous, name, i+1, ancestors);
            ancestors.add(normKey);
            previous = name;
            lastDistinctNorm = normKey;
          }

        // ── RENAME MODE (default) ──────────────────────────────────────────
        // Same as before: all names get _Lx suffix when they collide across levels
        } else {
          let lastFilledLi = -1;
          for (let li = 0; li < levelValues.length; li++) {
            const entry = levelValues[li];
            if (!entry) {
              if (lastFilledLi > -1) {
                const nextFilled = levelValues.slice(li+1).find(e => e !== null);
                if (nextFilled) dataQuality.partialRows.push({ rowIndex: i+1, missingLevel: hierarchyOrder[li] });
              }
              break;
            }
            const { level, rawVal } = entry;
            const name = addMember(rawVal, level);
            if (!name) break;
            addRel(previous, name, i+1, ancestors);
            ancestors.add(safeKey(name));
            previous = name;
            lastFilledLi = li;
          }
        }
      }

      onProgress(Math.round((i / rows.length) * 100));
      if (i < rows.length) requestAnimationFrame(processChunk);
      else resolve({ members, relationships, warnings, collisions, dataQuality });
    };

    requestAnimationFrame(processChunk);
  });
}

// ─── XML Generation ───────────────────────────────────────────────────────────
function generateMemberXml(members, dimName) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Generated by OneStream Metadata Builder — ${new Date().toISOString()} -->`,
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
    `<!-- Generated by OneStream Metadata Builder — ${new Date().toISOString()} -->`,
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Excel Parser ─────────────────────────────────────────────────────────────
function parseWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try { resolve(XLSX.read(e.target.result, { type: "array" })); }
      catch (err) { reject(new Error(`Could not parse Excel file: ${err.message}`)); }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}
function parseSheet(wb, sheetName, headerRow = 0) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found.`);
  const allData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
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
function Alert({ type = "info", children }) {
  const s = { info: { bg: C.accentGlow, border: C.accentDim, color: C.accent, icon: "ℹ" }, warn: { bg: C.warn+"15", border: C.warn+"55", color: C.warn, icon: "⚠" }, error: { bg: C.danger+"15", border: C.danger+"55", color: C.danger, icon: "✕" }, success: { bg: C.success+"15", border: C.success+"55", color: C.success, icon: "✓" } }[type];
  return (
    <div style={{ padding: "10px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}`, fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
      <span style={{ flexShrink: 0, fontWeight: 800, color: s.color }}>{s.icon}</span>
      <span style={{ color: C.text, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}
function ProgressBar({ pct, label }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.textMuted }}>{label}</span>
        <span style={{ fontSize: 13, color: C.accent, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: C.surfaceHigh, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.success})`, borderRadius: 3, transition: "width 0.1s" }} />
      </div>
    </div>
  );
}
function SectionLabel({ n, label, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#fff", flexShrink: 0 }}>{n}</div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{label}</h2>
      </div>
      {sub && <p style={{ margin: "8px 0 0 38px", fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{sub}</p>}
    </div>
  );
}

// ─── Excel Preview ────────────────────────────────────────────────────────────
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
  const previewRows = excelData.rows.slice(0, 15);
  const visibleCols = Math.min(headers.length, 10);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Source Preview</span>
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>{excelData.rows.length.toLocaleString()} rows · {headers.length} cols</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {headers.slice(0, visibleCols).map((h, ci) => {
                const isMapped = colToLevel[ci] !== undefined;
                const color = colToColor[ci];
                return (
                  <th key={ci} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, background: isMapped ? color+"28" : C.surfaceHigh, color: isMapped ? color : C.textMuted, borderBottom: isMapped ? `2px solid ${color}` : `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    {isMapped && <span style={{ display: "inline-block", background: color, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 800, marginRight: 5 }}>{colToLevel[ci]}</span>}
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
                  const val = row[ci];
                  return (
                    <td key={ci} style={{ padding: "6px 12px", background: isMapped ? color+"0d" : "transparent", color: isMapped ? color : C.textMuted, fontWeight: isMapped ? 600 : 400, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", borderLeft: isMapped ? `2px solid ${color}44` : "none" }}>
                      {val !== null && val !== undefined && String(val).trim() !== "" ? String(val) : <span style={{ color: C.textDim }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {headers.length > visibleCols && <div style={{ padding: "6px 14px", background: C.surfaceHigh, fontSize: 10, color: C.textDim }}>+{headers.length - visibleCols} more columns</div>}
    </div>
  );
}

// ─── STEP 1: Upload ───────────────────────────────────────────────────────────
function StepUpload({ onData }) {
  const [dragging, setDragging]           = useState(false);
  const [fileErrors, setFileErrors]       = useState([]);
  const [sheetWarnings, setSheetWarnings] = useState([]);
  const [sheetErrors, setSheetErrors]     = useState([]);
  const [loading, setLoading]             = useState(false);
  const [wb, setWb]                       = useState(null);
  const [fileName, setFileName]           = useState("");
  const [fileSize, setFileSize]           = useState(0);
  const [sheetNames, setSheetNames]       = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow]         = useState(0);
  const [preview, setPreview]             = useState(null);
  const inputRef = useRef();

  const handleFile = async (f) => {
    if (!f) return;
    const errs = validateFile(f);
    if (errs.length) { setFileErrors(errs); return; }
    setFileErrors([]); setLoading(true);
    try {
      const workbook = await parseWorkbook(f);
      if (!workbook.SheetNames.length) throw new Error("Workbook contains no sheets.");
      setWb(workbook); setFileName(f.name); setFileSize(f.size);
      setSheetNames(workbook.SheetNames); setSelectedSheet(workbook.SheetNames[0]);
      const data = parseSheet(workbook, workbook.SheetNames[0], 0);
      setPreview(data.allData.slice(0, 8)); setHeaderRow(0);
      const { errors, warnings } = validateSheet(data.allData, 0);
      setSheetErrors(errors); setSheetWarnings(warnings);
    } catch (e) { setFileErrors([e.message]); }
    setLoading(false);
  };

  const handleSheetChange = (name) => {
    setSelectedSheet(name);
    try {
      const data = parseSheet(wb, name, headerRow);
      setPreview(data.allData.slice(0, 8));
      const { errors, warnings } = validateSheet(data.allData, headerRow);
      setSheetErrors(errors); setSheetWarnings(warnings);
    } catch (e) { setSheetErrors([e.message]); }
  };

  const handleHeaderRowChange = (i) => {
    setHeaderRow(i);
    try {
      const data = parseSheet(wb, selectedSheet, i);
      setPreview(data.allData.slice(0, 8));
      const { errors, warnings } = validateSheet(data.allData, i);
      setSheetErrors(errors); setSheetWarnings(warnings);
    } catch (e) { setSheetErrors([e.message]); }
  };

  const confirm = () => {
    if (sheetErrors.length) return;
    try {
      const result = parseSheet(wb, selectedSheet, headerRow);
      onData(result, fileName, selectedSheet, fileSize);
    } catch (e) { setSheetErrors([e.message]); }
  };

  return (
    <div>
      <SectionLabel n="1" label="Upload Excel File" sub="All sheets detected automatically. Pick the sheet and header row." />
      {!wb ? (
        <div onClick={() => inputRef.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }} style={{ border: `2px dashed ${dragging ? C.accent : C.borderBright}`, borderRadius: 14, padding: "52px 24px", textAlign: "center", cursor: "pointer", background: dragging ? C.accentGlow : C.surfaceHigh, transition: "all 0.2s" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>Drop your Excel file here</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 5 }}>or click to browse · .xlsx / .xls · max {MAX_FILE_SIZE_MB}MB</div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 18 }}>
            <span>📄</span>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{fileName}</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>{formatBytes(fileSize)} · {sheetNames.length} sheet{sheetNames.length > 1 ? "s" : ""}</span>
            <Btn variant="ghost" small onClick={() => { setWb(null); setPreview(null); setSheetNames([]); setFileErrors([]); setSheetErrors([]); setSheetWarnings([]); }} style={{ marginLeft: "auto" }}>Change</Btn>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700, letterSpacing: "0.06em" }}>SELECT SHEET</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sheetNames.map(name => (
                <div key={name} onClick={() => handleSheetChange(name)} title={name} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, background: selectedSheet === name ? C.accent : C.surfaceHigh, color: selectedSheet === name ? "#fff" : C.textMuted, border: `1px solid ${selectedSheet === name ? C.accent : C.border}`, transition: "all 0.15s", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700, letterSpacing: "0.06em" }}>HEADER ROW</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[0,1,2,3,4,5,6,7].map(i => (
                <div key={i} onClick={() => handleHeaderRowChange(i)} style={{ padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: headerRow === i ? C.accentDim : C.bg, color: headerRow === i ? C.accent : C.textMuted, border: `1px solid ${headerRow === i ? C.accent : C.border}`, transition: "all 0.15s" }}>Row {i+1}</div>
              ))}
            </div>
          </div>

          {preview && (
            <div style={{ overflowX: "auto", marginBottom: 18, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} style={{ background: ri === headerRow ? "rgba(79,124,255,0.14)" : ri%2===0 ? "transparent" : C.surfaceHigh+"55", borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 10px", color: ri === headerRow ? C.accent : C.textDim, fontFamily: "monospace", fontSize: 10, borderRight: `1px solid ${C.border}`, minWidth: 64, fontWeight: ri === headerRow ? 700 : 400 }}>{ri === headerRow ? "► HEADER" : `row ${ri+1}`}</td>
                      {(Array.isArray(row) ? row : []).slice(0, 9).map((cell, ci) => (
                        <td key={ci} style={{ padding: "6px 10px", color: ri === headerRow ? C.accent : C.text, fontWeight: ri === headerRow ? 700 : 400, whiteSpace: "nowrap" }}>{String(cell ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sheetWarnings.map((w, i) => <Alert key={i} type="warn">{w}</Alert>)}
          {sheetErrors.map((e, i) => <Alert key={i} type="error">{e}</Alert>)}
          <div style={{ marginTop: 14 }}>
            <Btn onClick={confirm} disabled={sheetErrors.length > 0}>Use "{selectedSheet}" · Row {headerRow+1} as Header →</Btn>
          </div>
        </div>
      )}
      {loading && <div style={{ color: C.accent, marginTop: 12, fontSize: 13 }}>⏳ Reading workbook…</div>}
      {fileErrors.map((e, i) => <Alert key={i} type="error">{e}</Alert>)}
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
          <div key={v} onClick={() => setN(v)} style={{ width: 62, height: 62, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: n===v ? C.accent : C.surfaceHigh, border: `2px solid ${n===v ? C.accent : C.border}`, boxShadow: n===v ? `0 0 18px ${C.accentGlow}` : "none", transition: "all 0.2s" }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: n===v ? "#fff" : C.textMuted }}>{v}</span>
            <span style={{ fontSize: 9, color: n===v ? "rgba(255,255,255,0.6)" : C.textDim }}>levels</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {Array.from({ length: n }, (_, i) => <span key={i} style={{ background: LV_COLORS[i]+"22", color: LV_COLORS[i], border: `1px solid ${LV_COLORS[i]}44`, borderRadius: 6, padding: "3px 12px", fontWeight: 700, fontSize: 13 }}>L{i+1}</span>)}
      </div>
      <Btn onClick={() => onSet(n)}>Continue →</Btn>
    </div>
  );
}

// ─── STEP 3: Column Mapping ───────────────────────────────────────────────────
function StepMapping({ headers, maxLevels, onSet, mapping, setMapping }) {
  const [submitted, setSubmitted] = useState(false);
  const levels = Array.from({ length: maxLevels }, (_, i) => `L${i+1}`);
  const allMapped = levels.every(l => mapping[l] !== "");
  const { errors: mapErrors, warnings: mapWarnings } = submitted ? validateMapping(mapping, headers, maxLevels) : { errors: [], warnings: [] };

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
          const color = LV_COLORS[i];
          const mapped = mapping[level] !== "";
          return (
            <div key={level} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: mapped ? color+"12" : C.surfaceHigh, border: `1.5px solid ${mapped ? color+"66" : C.border}`, transition: "all 0.2s" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: color+(mapped?"33":"18"), border: `2px solid ${color+(mapped?"88":"44")}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color, fontSize: 14 }}>{level}</div>
              <div style={{ flex: 1 }}>
                <select value={mapping[level]} onChange={e => { setSubmitted(false); setMapping(prev => ({ ...prev, [level]: e.target.value })); }} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14, background: mapped ? color+"18" : C.bg, border: `1.5px solid ${mapped ? color+"66" : C.borderBright}`, color: mapped ? color : C.textMuted, outline: "none", cursor: "pointer", fontWeight: mapped ? 700 : 400, fontFamily: "inherit" }}>
                  <option value="">— select a column —</option>
                  {headers.map((h, idx) => <option key={idx} value={idx}>{h || `Column ${idx+1}`}</option>)}
                </select>
              </div>
              {mapped && <span style={{ fontSize: 18, color: C.success, flexShrink: 0 }}>✓</span>}
            </div>
          );
        })}
      </div>
      {Object.values(mapping).some(v => v !== "") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, padding: 12, background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11, color: C.textMuted, alignSelf: "center", marginRight: 4 }}>Mapped:</span>
          {levels.map((level, i) => {
            if (mapping[level] === "") return null;
            const color = LV_COLORS[i];
            const colName = headers[parseInt(mapping[level])] || `Col ${parseInt(mapping[level])+1}`;
            return <span key={level} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: color+"22", border: `1px solid ${color}55`, borderRadius: 20, padding: "3px 10px", fontSize: 12 }}><span style={{ fontWeight: 800, color }}>{level}</span><span style={{ color: C.textDim }}>→</span><span style={{ color, fontWeight: 600 }}>{colName}</span></span>;
          })}
        </div>
      )}
      {mapWarnings.map((w, i) => <Alert key={i} type="warn">{w}</Alert>)}
      {mapErrors.map((e, i) => <Alert key={i} type="error">{e}</Alert>)}
      <Btn onClick={handleConfirm} disabled={!allMapped}>{allMapped ? "Confirm Mapping →" : `Map all ${maxLevels} levels to continue`}</Btn>
    </div>
  );
}

// ─── STEP 4: Hierarchy Order ──────────────────────────────────────────────────
function StepHierarchyOrder({ maxLevels, mapping, headers, onSet }) {
  const levels = Array.from({ length: maxLevels }, (_, i) => `L${i+1}`);
  const [order, setOrder] = useState([...levels]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const move = (from, to) => { const arr = [...order]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); setOrder(arr); };
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
              <div draggable onDragStart={() => setDragIdx(idx)} onDragOver={e => { e.preventDefault(); setOverIdx(idx); }} onDrop={() => { move(dragIdx, idx); setDragIdx(null); setOverIdx(null); }} onDragEnd={() => { setDragIdx(null); setOverIdx(null); }} style={{ padding: "10px 16px", borderRadius: 12, cursor: "grab", userSelect: "none", background: color+"22", border: `2px solid ${isOver ? color : color+"55"}`, boxShadow: isOver ? `0 0 22px ${color}55` : "none", transform: isOver ? "scale(1.07)" : "scale(1)", transition: "all 0.15s" }}>
                <div style={{ fontWeight: 800, color, fontSize: 14 }}>{level}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colName}</div>
              </div>
              {idx < order.length-1 && <div style={{ padding: "0 6px", color: C.textDim, fontSize: 20, flexShrink: 0 }}>→</div>}
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

// ─── STEP 5: Config + Collision Mode ─────────────────────────────────────────
function StepConfig({ onSet }) {
  const [rootName, setRootName]         = useState("Region");
  const [dimName, setDimName]           = useState("Region");
  const [collisionMode, setCollisionMode] = useState("collapse");

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 14, background: C.bg, border: `1px solid ${C.borderBright}`, color: C.text, outline: "none", fontFamily: "inherit" };

  const modes = [
    {
      key: "collapse",
      label: "Collapse duplicates",
      icon: "⚡",
      desc: "If the same name repeats in consecutive levels, skip it and attach the next unique value directly to the last distinct parent.",
      example: "America → North_America → [skip] → na123",
      exampleFull: "America → North_America → North_America → na123  becomes  America → North_America → na123",
    },
    {
      key: "rename",
      label: "Rename with level suffix",
      icon: "🏷",
      desc: "If the same name appears in multiple levels, rename each occurrence with a level suffix to keep them as distinct members.",
      example: "North_America_L2  and  North_America_L3  are separate members",
      exampleFull: "North_America appearing in L2 and L3 becomes North_America_L2 and North_America_L3",
    },
  ];

  return (
    <div>
      <SectionLabel n="5" label="Dimension, Root & Output Mode" />

      {/* Collision mode picker */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12 }}>DUPLICATE NAME HANDLING</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {modes.map(mode => {
            const active = collisionMode === mode.key;
            return (
              <div key={mode.key} onClick={() => setCollisionMode(mode.key)} style={{ padding: "16px 18px", borderRadius: 12, cursor: "pointer", background: active ? C.accent+"18" : C.surfaceHigh, border: `2px solid ${active ? C.accent : C.border}`, transition: "all 0.2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${active ? C.accent : C.borderBright}`, background: active ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: active ? C.accent : C.text }}>{mode.icon} {mode.label}</span>
                </div>
                <p style={{ margin: "0 0 8px 30px", fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{mode.desc}</p>
                <div style={{ margin: "0 0 0 30px", padding: "8px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "monospace", color: active ? C.accent : C.textDim }}>
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
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Output: <span style={{ color: C.accent }}>{dimName||"Dim"}MEM.xml</span> + <span style={{ color: C.accent }}>{dimName||"Dim"}REL.xml</span></div>
        </div>
      </div>

      <Btn onClick={() => onSet(rootName.trim()||"Root", dimName.trim()||"Dimension", collisionMode)} disabled={!rootName.trim()}>
        Review & Generate →
      </Btn>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ headers, mapping, hierarchyOrder, rowCount, sheetName, rootName, dimName, collisionMode, onConfirm, onEdit }) {
  const levels = Object.keys(mapping).sort();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,5,12,0.92)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderBright}`, borderRadius: 20, padding: 36, width: "100%", maxWidth: 520, boxShadow: "0 32px 80px rgba(0,0,0,0.8)", animation: "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <style>{`@keyframes popIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔍</div>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Confirm Before Generating</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["Source rows", rowCount.toLocaleString()], ["Sheet", sheetName], ["Root member", rootName], ["Dimension", dimName], ["Levels", levels.length], ["Duplicate mode", collisionMode === "collapse" ? "⚡ Collapse" : "🏷 Rename"]].map(([k,v]) => (
            <div key={k} style={{ padding: "9px 12px", background: C.surfaceHigh, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{k}</div>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>MAPPING</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {levels.map((level, i) => {
            const color = LV_COLORS[i]; const colIdx = parseInt(mapping[level]);
            return <span key={level} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: color+"22", border: `1px solid ${color}55`, borderRadius: 20, padding: "4px 10px", fontSize: 12 }}><span style={{ fontWeight: 800, color }}>{level}</span><span style={{ color: C.textDim }}>→</span><span style={{ color, fontWeight: 600 }}>{headers[colIdx]||`Col ${colIdx+1}`}</span></span>;
          })}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>FLOW</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 24 }}>
          <span style={{ background: C.surfaceHigh, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{rootName}</span>
          <span style={{ color: C.textDim }}>→</span>
          {hierarchyOrder.map((lv, idx) => {
            const color = LV_COLORS[levels.indexOf(lv)];
            return <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ background: color+"22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{lv}</span>{idx < hierarchyOrder.length-1 && <span style={{ color: C.textDim }}>→</span>}</span>;
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

// ─── Processing Screen ────────────────────────────────────────────────────────
function ProcessingScreen({ progress, rowCount }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>⚙️</div>
      <h2 style={{ color: C.text, fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Building Hierarchy…</h2>
      <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 32 }}>Processing {rowCount.toLocaleString()} rows in chunks to keep the browser responsive</p>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <ProgressBar pct={progress} label="Processing rows" />
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>{progress < 50 ? "Pass 1 of 2: detecting cross-level collisions…" : "Pass 2 of 2: building members and relationships…"}</div>
      </div>
    </div>
  );
}

// ─── Result Panel ─────────────────────────────────────────────────────────────
function ResultPanel({ result, dimName, collisionMode, onReset }) {
  const { members, relationships, warnings, collisions, dataQuality } = result;
  const memberList = Object.values(members);
  const memberXml  = generateMemberXml(members, dimName);
  const relXml     = generateRelXml(relationships, dimName);
  const hasIssues  = collisions.length > 0 || warnings.length > 0 || dataQuality.emptyRows > 0 || dataQuality.truncatedNames.length > 0 || dataQuality.collapsedDupes.length > 0;
  const [activeTab, setActiveTab] = useState(hasIssues ? "quality" : "members");

  const issueCount = collisions.length + warnings.length + (dataQuality.collapsedDupes.length > 0 ? 1 : 0);
  const tabs = [
    { key: "members",       label: `Members (${memberList.length})` },
    { key: "relationships", label: `Rels (${relationships.length})` },
    { key: "quality",       label: "Quality Report", badge: issueCount },
  ];

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.1em", marginBottom: 4 }}>COMPLETE</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.success }}>✓ XML Ready to Download</h2>
        <p style={{ margin: "5px 0 0", fontSize: 13, color: C.textMuted }}>
          {memberList.length.toLocaleString()} members · {relationships.length.toLocaleString()} relationships
          {collisionMode === "collapse" && dataQuality.collapsedDupes.length > 0 && <span style={{ color: C.warn }}> · {dataQuality.collapsedDupes.length} duplicate(s) collapsed</span>}
          {collisionMode === "rename" && collisions.length > 0 && <span style={{ color: C.warn }}> · {collisions.length} collision(s) renamed</span>}
          {warnings.length > 0 && <span style={{ color: C.danger }}> · {warnings.length} skipped</span>}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: "Members",       value: memberList.length,    color: C.accent },
          { label: "Relationships", value: relationships.length, color: C.success },
          { label: collisionMode === "collapse" ? "Collapsed" : "Renamed", value: collisionMode === "collapse" ? dataQuality.collapsedDupes.length : collisions.length, color: (collisionMode === "collapse" ? dataQuality.collapsedDupes.length : collisions.length) > 0 ? C.warn : C.textDim },
          { label: "Skipped",       value: warnings.length,      color: warnings.length > 0 ? C.danger : C.textDim },
          { label: "Empty Rows",    value: dataQuality.emptyRows, color: dataQuality.emptyRows > 0 ? C.textMuted : C.textDim },
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
        <Btn variant="ghost"   onClick={() => downloadFile([memberXml,"\n\n",relXml].join(""), `${dimName}_both.xml`)}>⬇ Combined XML</Btn>
      </div>

      <div>
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "8px 14px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, borderRadius: "8px 8px 0 0", background: activeTab === tab.key ? C.surfaceHigh : "transparent", color: activeTab === tab.key ? C.text : C.textMuted, borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : "2px solid transparent", display: "flex", alignItems: "center", gap: 6 }}>
              {tab.label}
              {tab.badge > 0 && <span style={{ background: C.warn, color: "#000", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        <div style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: "0 8px 8px 8px", padding: 14, maxHeight: 340, overflowY: "auto" }}>
          {activeTab === "members" && memberXml.split("\n").slice(0, 80).map((line, i) => (
            <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: line.includes("<member") ? C.text : C.textMuted, marginBottom: 1, whiteSpace: "pre" }}>{line}</div>
          ))}
          {activeTab === "relationships" && relXml.split("\n").slice(0, 80).map((line, i) => (
            <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: line.includes("<relationship") ? C.text : C.textMuted, marginBottom: 1, whiteSpace: "pre" }}>{line}</div>
          ))}
          {activeTab === "quality" && (
            <div>
              {!hasIssues && <Alert type="success">No data quality issues found. Clean hierarchy!</Alert>}

              {/* Collapse mode report */}
              {collisionMode === "collapse" && dataQuality.collapsedDupes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: C.warn, fontWeight: 700, marginBottom: 8 }}>⚡ Collapsed Consecutive Duplicates ({dataQuality.collapsedDupes.length})</div>
                  <Alert type="info">These values appeared identically in consecutive levels and were skipped — the next unique value was attached directly to the last distinct parent.</Alert>
                  {dataQuality.collapsedDupes.slice(0, 15).map((d, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: C.textMuted, marginBottom: 3, padding: "3px 10px", background: C.bg, borderRadius: 5 }}>
                      Row {d.rowIndex} · <span style={{ color: C.warn }}>{d.level}</span> · skipped "<span style={{ color: C.text }}>{d.value}</span>"
                    </div>
                  ))}
                  {dataQuality.collapsedDupes.length > 15 && <div style={{ fontSize: 11, color: C.textDim }}>…and {dataQuality.collapsedDupes.length - 15} more</div>}
                </div>
              )}

              {/* Rename mode report */}
              {collisionMode === "rename" && collisions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: C.warn, fontWeight: 700, marginBottom: 8 }}>🏷 Cross-Level Name Collisions Renamed ({collisions.length})</div>
                  <Alert type="warn">These names appeared in multiple levels and were renamed with a level suffix.</Alert>
                  {collisions.map((c, i) => (
                    <div key={i} style={{ marginBottom: 10, padding: "10px 14px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                        <span style={{ color: C.text, fontWeight: 700 }}>{c.name}</span> in: {c.levels.map(lv => { const color = LV_COLORS[parseInt(lv.replace("L",""))-1]; return <span key={lv} style={{ background: color+"22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700, marginLeft: 4 }}>{lv}</span>; })}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {c.levels.map(lv => { const color = LV_COLORS[parseInt(lv.replace("L",""))-1]; return <div key={lv} style={{ display: "flex", alignItems: "center", gap: 6, background: color+"15", border: `1px solid ${color}33`, borderRadius: 6, padding: "4px 10px" }}><span style={{ fontSize: 10, color: C.textDim }}>was</span><span style={{ color: C.text, fontWeight: 600, fontSize: 12 }}>{c.name}</span><span style={{ fontSize: 10, color: C.textDim }}>→</span><span style={{ color, fontWeight: 800, fontSize: 12, fontFamily: "monospace" }}>{c.name}_{lv}</span></div>; })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {dataQuality.truncatedNames.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: C.warn, fontWeight: 700, marginBottom: 8 }}>✂ Truncated Names ({dataQuality.truncatedNames.length})</div>
                  <Alert type="warn">Exceeded OneStream's {MAX_MEMBER_NAME}-character limit and were truncated.</Alert>
                  {dataQuality.truncatedNames.slice(0, 10).map((t, i) => <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: C.textMuted, marginBottom: 4, padding: "4px 10px", background: C.bg, borderRadius: 6 }}><span style={{ color: C.danger }}>{t.original}</span><span style={{ color: C.textDim }}> → </span><span style={{ color: C.gold }}>{t.normalized}</span> <span style={{ color: C.textDim }}>({t.level})</span></div>)}
                  {dataQuality.truncatedNames.length > 10 && <div style={{ fontSize: 11, color: C.textDim }}>…and {dataQuality.truncatedNames.length - 10} more</div>}
                </div>
              )}

              {dataQuality.emptyRows > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 700, marginBottom: 8 }}>Empty Rows Skipped: {dataQuality.emptyRows}</div>
                  <Alert type="info">Rows where all mapped columns were blank were skipped automatically.</Alert>
                </div>
              )}

              {warnings.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: C.danger, fontWeight: 700, marginBottom: 8 }}>🔄 Skipped Rows ({warnings.length})</div>
                  {warnings.slice(0, 20).map((w, i) => <div key={i} style={{ color: C.danger, fontSize: 11, marginBottom: 3, fontFamily: "monospace" }}>{w}</div>)}
                  {warnings.length > 20 && <div style={{ fontSize: 11, color: C.textDim }}>…and {warnings.length-20} more.</div>}
                  <div style={{ marginTop: 10 }}><Btn variant="ghost" small onClick={() => downloadFile(warnings.join("\n"), `${dimName}_warnings.txt`, "text/plain")}>⬇ Download Full Warnings Log</Btn></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18 }}><Btn variant="ghost" small onClick={onReset}>↺ Start Over</Btn></div>
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
        const n = i+1, done = step > n, active = step === n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: active ? C.accentGlow : "transparent", border: `1px solid ${active ? C.accent+"44" : "transparent"}` }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: done ? C.success : active ? C.accent : C.surfaceHigh, color: done||active ? "#fff" : C.textDim, border: `1.5px solid ${done ? C.success : active ? C.accent : C.border}` }}>{done ? "✓" : n}</div>
            <span style={{ fontSize: 13, color: active ? C.text : done ? C.success : C.textDim, fontWeight: active||done ? 700 : 400 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]                     = useState(1);
  const [excelData, setExcelData]           = useState(null);
  const [fileName, setFileName]             = useState("");
  const [sheetName, setSheetName]           = useState("");
  const [maxLevels, setMaxLevels]           = useState(null);
  const [mapping, setMapping]               = useState({});
  const [hierarchyOrder, setHierarchyOrder] = useState(null);
  const [rootName, setRootName]             = useState(null);
  const [dimName, setDimName]               = useState(null);
  const [collisionMode, setCollisionMode]   = useState("collapse");
  const [showConfirm, setShowConfirm]       = useState(false);
  const [processing, setProcessing]         = useState(false);
  const [progress, setProgress]             = useState(0);
  const [result, setResult]                 = useState(null);
  const [buildError, setBuildError]         = useState(null);

  const initMapping = (n) => { const m = {}; for (let i = 1; i <= n; i++) m[`L${i}`] = ""; setMapping(m); };

  const reset = () => {
    setStep(1); setExcelData(null); setFileName(""); setSheetName("");
    setMaxLevels(null); setMapping({}); setHierarchyOrder(null);
    setRootName(null); setDimName(null); setCollisionMode("collapse");
    setShowConfirm(false); setProcessing(false); setProgress(0); setResult(null); setBuildError(null);
  };

  const handleGenerate = async () => {
    setShowConfirm(false); setProcessing(true); setProgress(0); setBuildError(null);
    try {
      const r = await buildHierarchyAsync(excelData.rows, mapping, hierarchyOrder, rootName, collisionMode, setProgress);
      setResult(r); setStep(6);
    } catch (e) { setBuildError(e.message); }
    finally { setProcessing(false); }
  };

  const showSidebar = excelData && !processing;
  const showPreview = excelData && !result && !processing;

  return (
    <div style={{ minHeight: "100vh", minWidth: "100vw", height: "100vh", width: "100vw", margin: 0, padding: 0, background: C.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text, boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        html, body, #root {
          height: 100vh !important;
          width: 100vw !important;
          margin: 0 !important;
          padding: 0 !important;
          background: ${C.bg} !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
        * { box-sizing: border-box; }
        select option { background: #0f1120; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2240; border-radius: 3px; }
      `}</style>

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 28px", display: "flex", alignItems: "center", gap: 16, background: C.surface, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ background: C.accentGlow, border: `1px solid ${C.accentDim}`, borderRadius: 8, padding: "4px 12px" }}>
          <span style={{ fontSize: 12, color: C.accent, fontWeight: 800, letterSpacing: "0.12em" }}>ONESTREAM</span>
        </div>
        <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Metadata Builder</span>
        <span style={{ fontSize: 12, color: C.textMuted }}>Excel → MEM.xml + REL.xml</span>
        {fileName && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surfaceHigh, padding: "4px 12px", borderRadius: 20, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12 }}>📄</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{fileName}</span>
              {sheetName && <span style={{ fontSize: 11, color: C.accent, background: C.accentGlow, padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>{sheetName}</span>}
            </div>
            {!processing && <Btn variant="ghost" small onClick={reset}>↺ Reset</Btn>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showSidebar ? (showPreview ? "200px 1fr 1fr" : "200px 1fr") : "1fr", minHeight: "calc(100vh - 57px)" }}>
        {showSidebar && (
          <div style={{ borderRight: `1px solid ${C.border}`, padding: "24px 16px", background: C.surface, position: "sticky", top: 57, alignSelf: "start", height: "calc(100vh - 57px)", overflowY: "auto" }}>
            <StepSidebar step={step} sheetName={sheetName} />
          </div>
        )}

        <div style={{ padding: "28px", borderRight: showPreview ? `1px solid ${C.border}` : "none", overflowY: "auto" }}>
          {processing && <ProcessingScreen progress={progress} rowCount={excelData?.rows?.length || 0} />}
          {buildError && !processing && <Alert type="error">Build failed: {buildError}</Alert>}
          {!processing && (
            <>
              {step === 1 && <StepUpload onData={(data, name, sheet) => { setExcelData(data); setFileName(name); setSheetName(sheet); setStep(2); }} />}
              {step === 2 && <StepLevels onSet={(n) => { setMaxLevels(n); initMapping(n); setStep(3); }} />}
              {step === 3 && excelData && <StepMapping headers={excelData.headers} maxLevels={maxLevels} mapping={mapping} setMapping={setMapping} onSet={(m) => { setMapping(m); setStep(4); }} />}
              {step === 4 && excelData && <StepHierarchyOrder maxLevels={maxLevels} mapping={mapping} headers={excelData.headers} onSet={(o) => { setHierarchyOrder(o); setStep(5); }} />}
              {step === 5 && <StepConfig onSet={(root, dim, mode) => { setRootName(root); setDimName(dim); setCollisionMode(mode); setShowConfirm(true); }} />}
              {step === 6 && result && <ResultPanel result={result} dimName={dimName} collisionMode={collisionMode} onReset={reset} />}
            </>
          )}
        </div>

        {showPreview && (
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
          headers={excelData.headers} mapping={mapping} hierarchyOrder={hierarchyOrder}
          rowCount={excelData.rows.length} sheetName={sheetName}
          rootName={rootName} dimName={dimName} collisionMode={collisionMode}
          onConfirm={handleGenerate}
          onEdit={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
