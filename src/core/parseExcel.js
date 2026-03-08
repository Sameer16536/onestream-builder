import { PREVIEW_ROWS, PREVIEW_COLS } from "../constants";

// Dynamically import XLSX only when needed — keeps initial bundle tiny
// and avoids blocking the main thread on page load.
let _XLSX = null;
async function getXLSX() {
  if (!_XLSX) _XLSX = await import("xlsx");
  return _XLSX;
}

// Read the raw file into an XLSX workbook object.
// Supports .xlsx / .xls (binary) and .csv (plaintext).
// The workbook is kept in state — we never store the full parsed data unless needed.
export async function parseWorkbook(file) {
  const XLSX = await getXLSX();
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        if (isCsv) {
          // XLSX can parse CSV from a string — produces the same wb.Sheets structure
          const wb = XLSX.read(e.target.result, { type: "string", raw: false });
          resolve(wb);
        } else {
          resolve(XLSX.read(e.target.result, { type: "array" }));
        }
      } catch (err) {
        reject(new Error(`Could not parse file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    if (isCsv) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

// LAZY preview parse — only reads first PREVIEW_ROWS×PREVIEW_COLS cells.
// Used for sheet switching and header row selection. Fast even on huge sheets.
export async function parseSheetPreview(wb, sheetName, headerRow = 0) {
  const XLSX = await getXLSX();
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found.`);

  const previewData = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    range: { s: { r: 0, c: 0 }, e: { r: PREVIEW_ROWS, c: PREVIEW_COLS } },
  });

  const hdrs = (previewData[headerRow] || []).map(h => String(h ?? "").trim());
  return { headers: hdrs, allData: previewData };
}

// FULL parse — reads entire sheet. Only called once when user confirms.
// Returns headers + all data rows for processing.
export async function parseSheetFull(wb, sheetName, headerRow = 0) {
  const XLSX = await getXLSX();
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found.`);

  const allData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const hdrs = (allData[headerRow] || []).map(h => String(h ?? "").trim());
  const rows = allData.slice(headerRow + 1);
  return { headers: hdrs, rows, totalRows: rows.length };
}

// Get just the sheet dimensions without parsing data — for row count display.
export function getSheetDimensions(wb, sheetName) {
  try {
    const ws = wb.Sheets[sheetName];
    const ref = ws["!ref"];
    if (!ref) return { rows: 0, cols: 0 };
    const XLSX_sync = _XLSX; // use cached if available
    if (!XLSX_sync) return { rows: "?", cols: "?" };
    const range = XLSX_sync.utils.decode_range(ref);
    return {
      rows: range.e.r - range.s.r, // approximate, excludes header
      cols: range.e.c - range.s.c + 1,
    };
  } catch {
    return { rows: "?", cols: "?" };
  }
}
