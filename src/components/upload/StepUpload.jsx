import { useState, useRef } from "react";
import { C } from "../../theme";
import { MAX_FILE_SIZE_MB } from "../../constants";
import { parseWorkbook, parseSheetPreview, parseSheetFull, getSheetDimensions } from "../../core/parseExcel";
import { validateFile, validateSheet } from "../../core/validate";
import { Btn, Alert, SectionLabel } from "../shared/primitives";

export function StepUpload({ onData }) {
  const [dragging, setDragging]           = useState(false);
  const [fileErrors, setFileErrors]       = useState([]);
  const [sheetWarnings, setSheetWarnings] = useState([]);
  const [sheetErrors, setSheetErrors]     = useState([]);
  const [loading, setLoading]             = useState(false);
  const [switching, setSwitching]         = useState(false); // sheet switch indicator
  const [wb, setWb]                       = useState(null);
  const [fileName, setFileName]           = useState("");
  const [fileSize, setFileSize]           = useState(0);
  const [sheetNames, setSheetNames]       = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow]         = useState(0);
  const [preview, setPreview]             = useState(null);   // { headers, allData }
  const [dims, setDims]                   = useState({});     // sheetName → { rows, cols }
  const inputRef = useRef();

  const handleFile = async (f) => {
    if (!f) return;
    const errs = validateFile(f);
    if (errs.length) { setFileErrors(errs); return; }
    setFileErrors([]); setLoading(true);
    try {
      const workbook = await parseWorkbook(f);
      if (!workbook.SheetNames.length) throw new Error("Workbook contains no sheets.");

      // Lazy: only parse preview rows of the first sheet
      const firstSheet = workbook.SheetNames[0];
      const prev = await parseSheetPreview(workbook, firstSheet, 0);
      const { errors, warnings } = validateSheet(prev.allData, 0);

      setWb(workbook);
      setFileName(f.name);
      setFileSize(f.size);
      setSheetNames(workbook.SheetNames);
      setSelectedSheet(firstSheet);
      setPreview(prev);
      setHeaderRow(0);
      setSheetErrors(errors);
      setSheetWarnings(warnings);

      // Get dimensions for all sheets (lightweight — reads !ref only)
      const d = {};
      workbook.SheetNames.forEach(name => { d[name] = getSheetDimensions(workbook, name); });
      setDims(d);
    } catch (e) { setFileErrors([e.message]); }
    setLoading(false);
  };

  // Sheet switch: ONLY parse preview rows — no full parse
  const handleSheetChange = async (name) => {
    if (name === selectedSheet) return;
    setSelectedSheet(name);
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

  const handleHeaderRowChange = async (i) => {
    setHeaderRow(i);
    try {
      const prev = await parseSheetPreview(wb, selectedSheet, i);
      const { errors, warnings } = validateSheet(prev.allData, i);
      setPreview(prev);
      setSheetErrors(errors);
      setSheetWarnings(warnings);
    } catch (e) { setSheetErrors([e.message]); }
  };

  // Confirm: do the FULL parse once here, then pass data up
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
    setFileName(""); setFileSize(0); setSelectedSheet(""); setHeaderRow(0);
  };

  return (
    <div>
      <SectionLabel
        n="1"
        label="Upload Excel File"
        sub="All sheets are detected automatically. Sheet switching is instant — full data loads only when you confirm."
      />

      {!wb ? (
        // ── Drop zone ──────────────────────────────────────────────────────
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
          <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>Drop your Excel file here</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 5 }}>
            or click to browse · .xlsx / .xls · max {MAX_FILE_SIZE_MB}MB
          </div>
          <input
            ref={inputRef} type="file" accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        // ── File loaded ────────────────────────────────────────────────────
        <div>
          {/* File badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            background: C.surfaceHigh, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 18,
          }}>
            <span>📄</span>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{fileName}</span>
            <span style={{ color: C.textMuted, fontSize: 12 }}>
              {(fileSize / 1048576).toFixed(1)} MB · {sheetNames.length} sheet{sheetNames.length > 1 ? "s" : ""}
            </span>
            <Btn variant="ghost" small onClick={reset} style={{ marginLeft: "auto" }}>Change</Btn>
          </div>

          {/* Sheet picker */}
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

          {/* Header row picker */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
              HEADER ROW
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                <div
                  key={i} onClick={() => handleHeaderRowChange(i)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                    fontWeight: 700, fontSize: 13,
                    background: headerRow === i ? C.accentDim : C.bg,
                    color: headerRow === i ? C.accent : C.textMuted,
                    border: `1px solid ${headerRow === i ? C.accent : C.border}`,
                    transition: "all 0.15s",
                  }}
                >
                  Row {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Preview table — only shows PREVIEW_ROWS */}
          {preview && (
            <div style={{ overflowX: "auto", marginBottom: 18, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {preview.allData.map((row, ri) => (
                    <tr key={ri} style={{
                      background: ri === headerRow
                        ? "rgba(79,124,255,0.14)"
                        : ri % 2 === 0 ? "transparent" : C.surfaceHigh + "55",
                      borderBottom: `1px solid ${C.border}`,
                    }}>
                      <td style={{
                        padding: "6px 10px",
                        color: ri === headerRow ? C.accent : C.textDim,
                        fontFamily: "monospace", fontSize: 10,
                        borderRight: `1px solid ${C.border}`, minWidth: 64,
                        fontWeight: ri === headerRow ? 700 : 400,
                      }}>
                        {ri === headerRow ? "► HEADER" : `row ${ri + 1}`}
                      </td>
                      {(Array.isArray(row) ? row : []).slice(0, 9).map((cell, ci) => (
                        <td key={ci} style={{
                          padding: "6px 10px",
                          color: ri === headerRow ? C.accent : C.text,
                          fontWeight: ri === headerRow ? 700 : 400,
                          whiteSpace: "nowrap",
                        }}>
                          {String(cell ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
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
        <div style={{ color: C.accent, marginTop: 12, fontSize: 13 }}>⏳ Reading workbook…</div>
      )}
      {fileErrors.map((e, i) => <Alert key={i} type="error">{e}</Alert>)}
    </div>
  );
}
