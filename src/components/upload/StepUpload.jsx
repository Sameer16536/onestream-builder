import { useState, useRef, useCallback } from "react";
import { C } from "../../theme";
import { MAX_FILE_SIZE_MB, PREVIEW_ROWS } from "../../constants";
import { parseWorkbook, parseSheetPreview, parseSheetFull, getSheetDimensions } from "../../core/parseExcel";
import { validateFile, validateSheet } from "../../core/validate";
import { Btn, Alert, SectionLabel } from "../shared/primitives";

export function StepUpload({ onData }) {
  const [dragging, setDragging]           = useState(false);
  const [fileErrors, setFileErrors]       = useState([]);
  const [sheetWarnings, setSheetWarnings] = useState([]);
  const [sheetErrors, setSheetErrors]     = useState([]);
  const [loading, setLoading]             = useState(false);
  const [switching, setSwitching]         = useState(false);
  const [wb, setWb]                       = useState(null);
  const [fileName, setFileName]           = useState("");
  const [fileSize, setFileSize]           = useState(0);
  const [isCsv, setIsCsv]                = useState(false);
  const [sheetNames, setSheetNames]       = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow]         = useState(0);
  const [inputVal, setInputVal]           = useState("1"); // controlled input (1-indexed display)
  const [preview, setPreview]             = useState(null);
  const [dims, setDims]                   = useState({});
  const [hoveredRow, setHoveredRow]       = useState(null);
  const inputRef  = useRef();
  const debounceRef = useRef(null);

  // ── File load ──────────────────────────────────────────────────────────────
  const handleFile = async (f) => {
    if (!f) return;
    const errs = validateFile(f);
    if (errs.length) { setFileErrors(errs); return; }
    setFileErrors([]); setLoading(true);
    try {
      const workbook = await parseWorkbook(f);
      if (!workbook.SheetNames.length) throw new Error("File contains no sheets.");

      const firstSheet = workbook.SheetNames[0];
      const prev = await parseSheetPreview(workbook, firstSheet, 0);
      const { errors, warnings } = validateSheet(prev.allData, 0);
      const csvFile = f.name.toLowerCase().endsWith(".csv");

      setWb(workbook);
      setFileName(f.name);
      setFileSize(f.size);
      setIsCsv(csvFile);
      setSheetNames(workbook.SheetNames);
      setSelectedSheet(firstSheet);
      setPreview(prev);
      setHeaderRow(0);
      setInputVal("1");
      setSheetErrors(errors);
      setSheetWarnings(warnings);

      const d = {};
      workbook.SheetNames.forEach(name => { d[name] = getSheetDimensions(workbook, name); });
      setDims(d);
    } catch (e) { setFileErrors([e.message]); }
    setLoading(false);
  };

  // ── Sheet switch ───────────────────────────────────────────────────────────
  const handleSheetChange = async (name) => {
    if (name === selectedSheet) return;
    setSelectedSheet(name);
    setPreview(null);          // clear immediately — prevents stale sheet data showing
    setSheetErrors([]);
    setSheetWarnings([]);
    setSwitching(true);
    try {
      const prev = await parseSheetPreview(wb, name, headerRow);
      const { errors, warnings } = validateSheet(prev.allData, headerRow);
      setPreview(prev);
      setSheetErrors(errors);
      setSheetWarnings(warnings);
    } catch (e) { setSheetErrors([e.message]); }
    setSwitching(false);
  };


  // ── Header row change ──────────────────────────────────────────────────────
  const handleHeaderRowChange = useCallback(async (i) => {
    setHeaderRow(i);
    setInputVal(String(i + 1));
    try {
      const prev = await parseSheetPreview(wb, selectedSheet, i);
      const { errors, warnings } = validateSheet(prev.allData, i);
      setPreview(prev);
      setSheetErrors(errors);
      setSheetWarnings(warnings);
    } catch (e) { setSheetErrors([e.message]); }
  }, [wb, selectedSheet]);

  // Number input handler — debounced 300 ms so preview doesn't flicker while typing
  const handleInputChange = (e) => {
    const raw = e.target.value;
    setInputVal(raw);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 1 && num <= PREVIEW_ROWS) {
        handleHeaderRowChange(num - 1);
      }
    }, 300);
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const confirm = async () => {
    if (sheetErrors.length) return;
    setLoading(true);
    try {
      const result = await parseSheetFull(wb, selectedSheet, headerRow);
      onData(result, wb, fileName, selectedSheet, fileSize);
    } catch (e) { setSheetErrors([e.message]); }
    setLoading(false);
  };

  const reset = () => {
    setWb(null); setPreview(null); setSheetNames([]);
    setFileErrors([]); setSheetErrors([]); setSheetWarnings([]);
    setFileName(""); setFileSize(0); setIsCsv(false);
    setSelectedSheet(""); setHeaderRow(0); setInputVal("1"); setHoveredRow(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionLabel
        n="1"
        label="Upload Excel / CSV File"
        sub="All sheets are detected automatically. Sheet switching is instant — full data loads only when you confirm."
      />

      {!wb ? (
        // ── Drop zone ───────────────────────────────────────────────────────
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? C.accent : C.borderBright}`,
            borderRadius: 14, padding: "52px 24px", textAlign: "center",
            cursor: "pointer",
            background: dragging ? C.accentGlow : C.surfaceHigh,
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>Drop your file here</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 5 }}>
            or click to browse · .xlsx / .xls / .csv · max {MAX_FILE_SIZE_MB}MB
          </div>
          <input
            ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        // ── File loaded ─────────────────────────────────────────────────────
        <div>
          {/* File badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 18,
          }}>
            <span>{isCsv ? "📝" : "📄"}</span>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{fileName}</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>
              {(fileSize / 1048576).toFixed(1)} MB
              {isCsv
                ? " · CSV"
                : ` · ${sheetNames.length} sheet${sheetNames.length > 1 ? "s" : ""}`}
            </span>
            <Btn variant="ghost" small onClick={reset} style={{ marginLeft: "auto" }}>Change</Btn>
          </div>

          {/* Sheet picker — hidden for CSV (single implicit sheet) */}
          {!isCsv && sheetNames.length > 1 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
                SELECT SHEET
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {sheetNames.map(name => {
                  const active = selectedSheet === name;
                  const d = dims[name];
                  return (
                    <div
                      key={name} onClick={() => handleSheetChange(name)} title={name}
                      style={{
                        padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                        fontWeight: 600, fontSize: 13,
                        background: active ? C.accent : C.surfaceHigh,
                        color: active ? "#fff" : C.textMuted,
                        border: `1px solid ${active ? C.accent : C.border}`,
                        transition: "all 0.15s",
                        opacity: switching && !active ? 0.5 : 1,
                      }}
                    >
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                        {name}
                      </div>
                      {d && (
                        <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.6)" : C.textDim, marginTop: 2 }}>
                          ~{typeof d.rows === "number" ? d.rows.toLocaleString() : d.rows} rows
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {switching && (
                <div style={{ fontSize: 12, color: C.accent, marginTop: 8 }}>⟳ Loading sheet preview…</div>
              )}
            </div>
          )}

          {/* ── Header Row Picker ────────────────────────────────────────── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
              HEADER ROW
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              padding: "10px 14px", borderRadius: 10,
              background: C.surfaceHigh, border: `1px solid ${C.border}`,
            }}>
              {/* Instruction */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                color: C.textMuted, fontSize: 12,
              }}>
                <span style={{ fontSize: 16 }}>👆</span>
                <span>Click any row in the preview below to set it as the header</span>
              </div>

              {/* Divider */}
              <div style={{ color: C.textDim, fontSize: 12, flexShrink: 0 }}>— or —</div>

              {/* Number input */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: "nowrap" }}>Row number:</span>
                <input
                  type="number"
                  min={1}
                  max={PREVIEW_ROWS}
                  value={inputVal}
                  onChange={handleInputChange}
                  style={{
                    width: 64, padding: "5px 8px",
                    background: C.bg, border: `1px solid ${C.accent}`,
                    borderRadius: 7, color: C.accent,
                    fontSize: 13, fontWeight: 700, outline: "none",
                    fontFamily: "inherit",
                  }}
                />

                {/* Active row badge */}
                <span style={{
                  background: C.accentDim, color: C.accent,
                  border: `1px solid ${C.accent}`, borderRadius: 6,
                  padding: "3px 10px", fontSize: 12, fontWeight: 700,
                  whiteSpace: "nowrap",
                }}>
                  ✓ Row {headerRow + 1} active
                </span>
              </div>
            </div>
          </div>

          {/* Preview table — rows are clickable */}
          {preview && (
            <div style={{ overflowX: "auto", marginBottom: 18, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {preview.allData.map((row, ri) => {
                    const isHeader = ri === headerRow;
                    const isHover  = hoveredRow === ri && !isHeader;
                    return (
                      <tr
                        key={ri}
                        onClick={() => handleHeaderRowChange(ri)}
                        onMouseEnter={() => setHoveredRow(ri)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          cursor: "pointer",
                          background: isHeader
                            ? "rgba(79,124,255,0.14)"
                            : isHover
                              ? "rgba(79,124,255,0.06)"
                              : ri % 2 === 0 ? "transparent" : C.surfaceHigh + "55",
                          borderBottom: `1px solid ${C.border}`,
                          transition: "background 0.1s",
                        }}
                      >
                        {/* Row label cell */}
                        <td style={{
                          padding: "6px 10px",
                          color: isHeader ? C.accent : isHover ? C.accent + "99" : C.textDim,
                          fontFamily: "monospace", fontSize: 10,
                          borderRight: `1px solid ${C.border}`, minWidth: 80,
                          fontWeight: isHeader ? 700 : 400,
                          userSelect: "none",
                        }}>
                          {isHeader
                            ? "► HEADER"
                            : isHover
                              ? `↑ set row ${ri + 1}`
                              : `row ${ri + 1}`}
                        </td>

                        {/* Data cells */}
                        {(Array.isArray(row) ? row : []).slice(0, 9).map((cell, ci) => (
                          <td key={ci} style={{
                            padding: "6px 10px",
                            color: isHeader ? C.accent : C.text,
                            fontWeight: isHeader ? 700 : 400,
                            whiteSpace: "nowrap",
                          }}>
                            {String(cell ?? "—")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sheetWarnings.map((w, i) => <Alert key={i} type="warn">{w}</Alert>)}
          {sheetErrors.map((e, i)   => <Alert key={i} type="error">{e}</Alert>)}

          <div style={{ marginTop: 16 }}>
            <Btn onClick={confirm} disabled={sheetErrors.length > 0 || loading}>
              {loading ? "⏳ Loading full data…" : `Use "${selectedSheet}" · Row ${headerRow + 1} as Header →`}
            </Btn>
          </div>
        </div>
      )}

      {loading && !wb && (
        <div style={{ color: C.accent, marginTop: 12, fontSize: 13 }}>⏳ Reading file…</div>
      )}
      {fileErrors.map((e, i) => <Alert key={i} type="error">{e}</Alert>)}
    </div>
  );
}
