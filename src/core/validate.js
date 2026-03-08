import { MAX_FILE_SIZE_MB, VALID_EXTENSIONS, WARN_ROWS } from "../constants";
import { formatBytes } from "./utils";

export function validateFile(file) {
  const errors = [];
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext))
    errors.push(`Invalid file type "${ext}". Only .xlsx and .xls are supported.`);
  if (file.size > MAX_FILE_SIZE_MB * 1048576)
    errors.push(`File is ${formatBytes(file.size)}, exceeding the ${MAX_FILE_SIZE_MB}MB browser limit.`);
  if (file.size === 0)
    errors.push("File is empty.");
  return errors;
}

export function validateSheet(data, headerRow) {
  const errors = [], warnings = [];
  if (!data || data.length === 0) {
    errors.push("Sheet appears to be empty.");
    return { errors, warnings };
  }
  if (headerRow >= data.length) {
    errors.push(`Header row ${headerRow + 1} doesn't exist.`);
    return { errors, warnings };
  }
  const headers = (data[headerRow] || []).map(h => String(h ?? "").trim());
  const emptyH = headers.filter(h => !h).length;
  if (emptyH > 0) warnings.push(`${emptyH} column(s) have blank headers.`);
  const dataRows = data
    .slice(headerRow + 1)
    .filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ""));
  if (dataRows.length === 0) errors.push("No data rows found after the header row.");
  if (dataRows.length > WARN_ROWS)
    warnings.push(`${dataRows.length.toLocaleString()} rows detected. Processing may take a few seconds.`);
  return { errors, warnings };
}

export function validateMapping(mapping, headers, maxLevels) {
  const errors = [], warnings = [];
  const usedCols = new Set();
  for (let i = 1; i <= maxLevels; i++) {
    const level = `L${i}`;
    const colIdx = mapping[level];
    if (colIdx === "" || colIdx === undefined) {
      errors.push(`${level} has no column mapped.`);
      continue;
    }
    const idx = parseInt(colIdx);
    if (usedCols.has(idx))
      warnings.push(`Column "${headers[idx]}" is mapped to multiple levels.`);
    usedCols.add(idx);
  }
  return { errors, warnings };
}
