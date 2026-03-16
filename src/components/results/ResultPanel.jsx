import { useCallback, useState } from "react";
import { C, LV_COLORS } from "../../theme";
import { MAX_MEMBER_NAME } from "../../constants";
import { generateOneStreamXml, downloadFile } from "../../core/utils";
import { Btn, Alert } from "../shared/primitives";

export function ResultPanel({ result, dimName, dimType, inheritedDim, memberProps, collisionMode, onReset }) {
  const { members, relationships, warnings, collisions, dataQuality } = result;
  const memberList = Object.values(members);

  // ── XML is generated LAZILY — only when the user clicks download ──────────
  // This avoids building a potentially huge string on every render.
  const buildXml = useCallback(() => generateOneStreamXml({
    members,
    relationships,
    dimType: dimType || "UD1",
    dimName: dimName || "Dimension",
    inheritedDim: inheritedDim || `Root${dimType || "UD1"}Dim`,
    memberProps: memberProps || {},
    aggregationWeight: memberProps?.aggregationWeight ?? "1.0",
  }), [members, relationships, dimType, dimName, inheritedDim, memberProps]);

  const handleDownload = () => downloadFile(buildXml(), `${dimName}.xml`);

  const hasIssues = collisions.length > 0 || warnings.length > 0 ||
    dataQuality.emptyRows > 0 || dataQuality.truncatedNames.length > 0 ||
    dataQuality.collapsedDupes.length > 0;

  const issueCount = collisions.length + warnings.length +
    (dataQuality.collapsedDupes.length > 0 ? 1 : 0);

  const [activeTab, setActiveTab] = useState(hasIssues ? "quality" : "members");

  const tabs = [
    { key: "members",       label: `Members (${memberList.length})` },
    { key: "relationships", label: `Rels (${relationships.length})` },
    { key: "quality",       label: "Quality Report", badge: issueCount },
  ];

  const collapsedCount = collisionMode === "collapse" ? dataQuality.collapsedDupes.length : collisions.length;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.1em", marginBottom: 4 }}>COMPLETE</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.success }}>✓ XML Ready to Download</h2>
        <p style={{ margin: "5px 0 0", fontSize: 13, color: C.textMuted }}>
          <span style={{ fontWeight: 700, color: C.accent }}>{dimType}</span> · {dimName} ·{" "}
          {memberList.length.toLocaleString()} members · {relationships.length.toLocaleString()} relationships
          {collisionMode === "collapse" && dataQuality.collapsedDupes.length > 0 && (
            <span style={{ color: C.warn }}> · {dataQuality.collapsedDupes.length} duplicate(s) collapsed</span>
          )}
          {collisionMode === "rename" && collisions.length > 0 && (
            <span style={{ color: C.warn }}> · {collisions.length} collision(s) renamed</span>
          )}
          {warnings.length > 0 && (
            <span style={{ color: C.danger }}> · {warnings.length} skipped</span>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: "Members",       value: memberList.length,    color: C.accent },
          { label: "Relationships", value: relationships.length, color: C.success },
          { label: collisionMode === "collapse" ? "Collapsed" : "Renamed", value: collapsedCount, color: collapsedCount > 0 ? C.warn : C.textDim },
          { label: "Skipped",       value: warnings.length,      color: warnings.length > 0 ? C.danger : C.textDim },
          { label: "Empty Rows",    value: dataQuality.emptyRows, color: dataQuality.emptyRows > 0 ? C.textMuted : C.textDim },
        ].map(s => (
          <div key={s.label} style={{ padding: "10px 16px", borderRadius: 10, background: s.color + "18", border: `1px solid ${s.color}44` }}>
            <div style={{ fontWeight: 800, color: s.color, fontSize: 20 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Single download button */}
      <div style={{ marginBottom: 18 }}>
        <Btn variant="gold" onClick={handleDownload}>
          ⬇ Download {dimName}.xml
        </Btn>
      </div>

      {/* Tabs — members, rels, quality only (no XML preview) */}
      <div>
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 14px", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                borderRadius: "8px 8px 0 0",
                background: activeTab === tab.key ? C.surfaceHigh : "transparent",
                color: activeTab === tab.key ? C.text : C.textMuted,
                borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : "2px solid transparent",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span style={{ background: C.warn, color: "#000", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{
          background: C.surfaceHigh, border: `1px solid ${C.border}`,
          borderRadius: "0 8px 8px 8px", padding: 14, maxHeight: 340, overflowY: "auto",
        }}>
          {/* Members — capped at 200 rows, text-only, no DOM bloat */}
          {activeTab === "members" && (
            <div>
              {memberList.slice(0, 200).map((m, i) => (
                <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted, marginBottom: 1 }}>
                  <span style={{ color: C.text }}>{m.name}</span>
                  {m.desc !== m.name && <span style={{ color: C.textDim }}> — {m.desc}</span>}
                </div>
              ))}
              {memberList.length > 200 && <More n={memberList.length - 200} />}
            </div>
          )}

          {/* Relationships — capped at 200 */}
          {activeTab === "relationships" && (
            <div>
              {relationships.slice(0, 200).map((r, i) => (
                <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted, marginBottom: 1 }}>
                  <span style={{ color: C.textDim }}>parent=</span><span style={{ color: C.text }}>{r.parent}</span>
                  <span style={{ color: C.textDim }}> → child=</span><span style={{ color: C.accent }}>{r.child}</span>
                </div>
              ))}
              {relationships.length > 200 && <More n={relationships.length - 200} />}
            </div>
          )}

          {activeTab === "quality" && <QualityReport result={result} dimName={dimName} collisionMode={collisionMode} />}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Btn variant="ghost" small onClick={onReset}>↺ Start Over</Btn>
      </div>
    </div>
  );
}

function QualityReport({ result, dimName, collisionMode }) {
  const { warnings, collisions, dataQuality } = result;
  const hasIssues = collisions.length > 0 || warnings.length > 0 ||
    dataQuality.emptyRows > 0 || dataQuality.truncatedNames.length > 0 ||
    dataQuality.collapsedDupes.length > 0;

  return (
    <div>
      {!hasIssues && <Alert type="success">No data quality issues found. Clean hierarchy!</Alert>}

      {collisionMode === "collapse" && dataQuality.collapsedDupes.length > 0 && (
        <Section title={`⚡ Collapsed Consecutive Duplicates (${dataQuality.collapsedDupes.length})`} color={C.warn}>
          <Alert type="info">These values appeared identically in consecutive levels and were skipped.</Alert>
          {dataQuality.collapsedDupes.slice(0, 15).map((d, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: C.textMuted, marginBottom: 3, padding: "3px 10px", background: C.bg, borderRadius: 5 }}>
              Row {d.rowIndex} · <span style={{ color: C.warn }}>{d.level}</span> · skipped "<span style={{ color: C.text }}>{d.value}</span>"
            </div>
          ))}
          {dataQuality.collapsedDupes.length > 15 && <More n={dataQuality.collapsedDupes.length - 15} />}
        </Section>
      )}

      {collisionMode === "rename" && collisions.length > 0 && (
        <Section title={`🏷 Cross-Level Name Collisions Renamed (${collisions.length})`} color={C.warn}>
          <Alert type="warn">These names appeared in multiple levels and were renamed with a level suffix.</Alert>
          {collisions.map((c, i) => (
            <div key={i} style={{ marginBottom: 10, padding: "10px 14px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{c.name}</span> in:{" "}
                {c.levels.map(lv => {
                  const color = LV_COLORS[parseInt(lv.replace("L", "")) - 1];
                  return <span key={lv} style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700, marginLeft: 4 }}>{lv}</span>;
                })}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.levels.map(lv => {
                  const color = LV_COLORS[parseInt(lv.replace("L", "")) - 1];
                  return (
                    <div key={lv} style={{ display: "flex", alignItems: "center", gap: 6, background: color + "15", border: `1px solid ${color}33`, borderRadius: 6, padding: "4px 10px" }}>
                      <span style={{ fontSize: 10, color: C.textDim }}>was</span>
                      <span style={{ color: C.text, fontWeight: 600, fontSize: 12 }}>{c.name}</span>
                      <span style={{ fontSize: 10, color: C.textDim }}>→</span>
                      <span style={{ color, fontWeight: 800, fontSize: 12, fontFamily: "monospace" }}>{c.name}_{lv}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </Section>
      )}

      {dataQuality.truncatedNames.length > 0 && (
        <Section title={`✂ Truncated Names (${dataQuality.truncatedNames.length})`} color={C.warn}>
          <Alert type="warn">Exceeded OneStream's {MAX_MEMBER_NAME}-character limit and were truncated.</Alert>
          {dataQuality.truncatedNames.slice(0, 10).map((t, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: C.textMuted, marginBottom: 4, padding: "4px 10px", background: C.bg, borderRadius: 6 }}>
              <span style={{ color: C.danger }}>{t.original}</span>
              <span style={{ color: C.textDim }}> → </span>
              <span style={{ color: C.gold }}>{t.normalized}</span>
              <span style={{ color: C.textDim }}> ({t.level})</span>
            </div>
          ))}
          {dataQuality.truncatedNames.length > 10 && <More n={dataQuality.truncatedNames.length - 10} />}
        </Section>
      )}

      {dataQuality.emptyRows > 0 && (
        <Section title={`Empty Rows Skipped: ${dataQuality.emptyRows}`} color={C.textMuted}>
          <Alert type="info">Rows where all mapped columns were blank were skipped automatically.</Alert>
        </Section>
      )}

      {warnings.length > 0 && (
        <Section title={`🔄 Skipped Rows (${warnings.length})`} color={C.danger}>
          {warnings.slice(0, 20).map((w, i) => (
            <div key={i} style={{ color: C.danger, fontSize: 11, marginBottom: 3, fontFamily: "monospace" }}>{w}</div>
          ))}
          {warnings.length > 20 && <More n={warnings.length - 20} />}
          <div style={{ marginTop: 10 }}>
            <Btn variant="ghost" small onClick={() => downloadFile(warnings.join("\n"), `${dimName}_warnings.txt`, "text/plain")}>
              ⬇ Download Full Warnings Log
            </Btn>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function More({ n }) {
  return <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>…and {n.toLocaleString()} more</div>;
}
