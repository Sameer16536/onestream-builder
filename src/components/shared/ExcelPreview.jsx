import { useState } from "react";
import { C, LV_COLORS } from "../../theme";
import { PAGE_SIZE } from "../../constants";
import { Btn } from "./primitives";

export function ExcelPreview({ rows, headers, totalRows, mapping }) {
  const [page, setPage] = useState(0);

  const colToLevel = {}, colToColor = {};
  if (mapping) {
    Object.entries(mapping).forEach(([level, colIdx]) => {
      if (colIdx !== "" && colIdx !== undefined) {
        const idx = parseInt(colIdx);
        colToLevel[idx] = level;
        colToColor[idx] = LV_COLORS[parseInt(level.replace("L", "")) - 1];
      }
    });
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows   = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      {/* Header bar */}
      <div style={{
        padding: "11px 16px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        <span>📊</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Source Preview</span>
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>
          {(totalRows ?? rows.length).toLocaleString()} rows · {headers.length} cols
        </span>
      </div>

      {/* Table — overflowX allows scrolling all columns */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {headers.map((h, ci) => {
                const isMapped = colToLevel[ci] !== undefined;
                const color    = colToColor[ci];
                return (
                  <th key={ci} style={{
                    padding: "9px 12px", textAlign: "left", fontWeight: 700,
                    background: isMapped ? color + "28" : C.surfaceHigh,
                    color: isMapped ? color : C.textMuted,
                    borderBottom: isMapped ? `2px solid ${color}` : `1px solid ${C.border}`,
                    borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  }}>
                    {isMapped && (
                      <span style={{
                        display: "inline-block", background: color, color: "#000",
                        borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 800, marginRight: 5,
                      }}>{colToLevel[ci]}</span>
                    )}
                    {h || `Col ${ci + 1}`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: `1px solid ${C.border}` }}>
                {headers.map((_, ci) => {
                  const isMapped = colToLevel[ci] !== undefined;
                  const color    = colToColor[ci];
                  const val      = row[ci];
                  const isEmpty  = val === null || val === undefined || String(val).trim() === "";
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
                      {isEmpty ? <span style={{ color: C.textDim }}>—</span> : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: pagination + overflow notice */}
      <div style={{
        padding: "8px 14px", background: C.surfaceHigh,
        borderTop: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        {totalPages > 1 && (
          <>
            <Btn small variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</Btn>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Page {page + 1} / {totalPages}
              {" "}· rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)}
            </span>
            <Btn small variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</Btn>
          </>
        )}
      </div>
    </div>
  );
}

export function ColumnLegend({ mapping, headers }) {
  const mapped = Object.entries(mapping).filter(([, v]) => v !== "");
  if (!mapped.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>
        COLUMN LEGEND
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mapped.map(([level, colIdx]) => {
          const color   = LV_COLORS[parseInt(level.replace("L", "")) - 1];
          const colName = headers[parseInt(colIdx)] || `Column ${parseInt(colIdx) + 1}`;
          return (
            <div key={level} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", background: color + "15",
              borderRadius: 8, border: `1px solid ${color}33`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: 800, color, fontSize: 13 }}>{level}</span>
              <span style={{ color: C.textMuted, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {colName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
