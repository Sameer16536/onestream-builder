import { MAX_MEMBER_NAME } from "../constants";

export function normalizeName(value) {
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

export function escapeXml(value) {
  if (!value) return "";
  return String(value).trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ── UD1–UD8 member properties ──────────────────────────────────────────────────
function buildUDMemberProps(props, indent = "              ") {
  const p = props || {};
  const allow   = p.allowInput       ?? "true";
  const consol  = p.isConsolidated   ?? "false";
  const altCurr = p.alternateCurrency ?? "";
  const isAttr  = p.isAttributeMember ?? "false";
  const text1   = p.text1 ?? "";
  const text2   = p.text2 ?? "";
  return [
    `${indent}<property name="FormulaType" value=""/>`,
    `${indent}<property name="AllowInput" value="${allow}"/>`,
    `${indent}<property name="IsConsolidated" value="${consol}"/>`,
    `${indent}<property name="AlternateCurrencyForDisplay" value="${escapeXml(altCurr)}"/>`,
    `${indent}<property name="IsAttributeMember" value="${isAttr}"/>`,
    `${indent}<property name="AttributeMemberSourceMember" value=""/>`,
    `${indent}<property name="AttributeMemberExpressionType" value=""/>`,
    `${indent}<property name="AttributeMemberRelatedDimType1" value=""/>`,
    `${indent}<property name="AttributeMemberPropType1" value=""/>`,
    `${indent}<property name="AttributeMemberComparisonText1" value=""/>`,
    `${indent}<property name="AttributeMemberOperatorType1" value=""/>`,
    `${indent}<property name="AttributeMemberRelatedDimType2" value=""/>`,
    `${indent}<property name="AttributeMemberPropType2" value=""/>`,
    `${indent}<property name="AttributeMemberComparisonText2" value=""/>`,
    `${indent}<property name="AttributeMemberOperatorType2" value=""/>`,
    `${indent}<property name="WorkflowChannel" scenarioType="" value="NoDataLock"/>`,
    `${indent}<property name="InUse" scenarioType="" time="" revertToDefaultScenarioType="false" value="True"/>`,
    `${indent}<property name="Text1" scenarioType="" time="" revertToDefaultScenarioType="false" value="${escapeXml(text1)}"/>`,
    `${indent}<property name="Text2" scenarioType="" time="" revertToDefaultScenarioType="false" value="${escapeXml(text2)}"/>`,
  ].join("\n");
}

// ── Account member properties ─────────────────────────────────────────────────
function buildAccountMemberProps(props, indent = "              ") {
  const p = props || {};
  const allow   = p.allowInput     ?? "true";
  const isIC    = p.isICAcc        ?? "false";
  const consol  = p.isConsolidated ?? "true";
  const inUse   = p.inUse          ?? "True";
  const text1   = p.text1          ?? "";
  return [
    `${indent}<property name="AllowInput" value="${allow}"/>`,
    `${indent}<property name="IsICAccount" value="${isIC}"/>`,
    `${indent}<property name="IsConsolidated" value="${consol}"/>`,
    `${indent}<property name="InUse" scenarioType="" time="" revertToDefaultScenarioType="false" value="${inUse}"/>`,
    `${indent}<property name="Text1" scenarioType="" time="" revertToDefaultScenarioType="false" value="${escapeXml(text1)}"/>`,
  ].join("\n");
}

// ── Entity member properties ────────────────────────────────────────────────────
function buildEntityMemberProps(props, indent = "              ") {
  const p = props || {};
  const currency     = p.currency         ?? "AUD";
  const consol       = p.isConsolidated   ?? "true";
  const isIC         = p.isIC             ?? "true";
  const flowConst    = p.flowConstraint   ?? "root";
  const icConst      = p.icConstraint     ?? "root";
  const text1        = p.text1            ?? "";
  return [
    `${indent}<property name="Currency" value="${escapeXml(currency)}"/>`,
    `${indent}<property name="IsConsolidated" value="${consol}"/>`,
    `${indent}<property name="IsIC" value="${isIC}"/>`,
    `${indent}<property name="FlowConstraint" cubeType="" value="${escapeXml(flowConst)}"/>`,
    `${indent}<property name="ICConstraint" cubeType="" value="${escapeXml(icConst)}"/>`,
    `${indent}<property name="ICMemberFilter" cubeType="" value=""/>`,
    `${indent}<property name="InUse" scenarioType="" time="" revertToDefaultScenarioType="false" value="True"/>`,
    `${indent}<property name="AllowAdjustments" scenarioType="" time="" revertToDefaultScenarioType="false" value="True"/>`,
    `${indent}<property name="AllowAdjustmentsFromChildren" scenarioType="" time="" revertToDefaultScenarioType="false" value="True"/>`,
    `${indent}<property name="SiblingConsolidationPass" scenarioType="" value="Unknown"/>`,
    `${indent}<property name="SiblingRepeatCalcPass" scenarioType="" value="Unknown"/>`,
    `${indent}<property name="AutoTranslationCurrencies" scenarioType="" value=""/>`,
    `${indent}<property name="Text1" scenarioType="" time="" revertToDefaultScenarioType="false" value="${escapeXml(text1)}"/>`,
  ].join("\n");
}

// ── Entity relationship properties ──────────────────────────────────────────────
function buildEntityRelProps(props, indent = "            ") {
  const p = props || {};
  const pctConsol    = p.percentConsolidation ?? "100.00";
  const pctOwnership = p.percentOwnership     ?? "100.00";
  return [
    `${indent}<properties>`,
    `${indent}  <property name="ParentSortOrder" value="0"/>`,
    `${indent}  <property name="PercentConsolidation" scenarioType="" time="" revertToDefaultScenarioType="false" value="${pctConsol}"/>`,
    `${indent}  <property name="PercentOwnership" scenarioType="" time="" revertToDefaultScenarioType="false" value="${pctOwnership}"/>`,
    `${indent}  <property name="Text1" scenarioType="" time="" revertToDefaultScenarioType="false" value=""/>`,
    `${indent}</properties>`,
  ].join("\n");
}

// ── Main XML generator (branches on dimType) ───────────────────────────────────
export function generateOneStreamXml({ members, relationships, dimType, dimName, inheritedDim, memberProps, aggregationWeight }) {
  const isEntity = dimType === "Entity";
  const isAccount = dimType === "Account";
  const isSpecial = isEntity || isAccount; // Neither have inheritedDim
  const agw = aggregationWeight ?? "1.0";

  // Dimension opening tag (always includes inheritedDim)
  const inh = inheritedDim || `Root${dimType}Dim`;
  const dimAttrs = `type="${escapeXml(dimType)}" name="${escapeXml(dimName)}" accessGroup="Everyone" maintenanceGroup="Everyone" description="" inheritedDim="${escapeXml(inh)}" dimMemberSourceType="Standard" dimMemberSourcePath="" dimMemberSourceNVPairs=""`;

  // Member element differs: Entity has extra access-group attrs, no action="Delete"
  // For Account, we will use the standard member tag but without action="Delete" to match entity behavior, 
  // or use the exact same attributes if desired. Given no spec, we stick to the basic tag as UD but without action="Delete" or use the full one if needed.
  // Actually, usually Account requires readDataGroup too, but let's emulate Entity tag for now if isAccount, or just UD. The user said go with entity logic for now for tags, but property block is distinct.
  const memberTag = (m) => isEntity
    ? `          <member name="${escapeXml(m.name)}" alias="" description="${escapeXml(m.desc)}" displayMemberGroup="Everyone" readDataGroup="Everyone" readDataGroup2="Nobody" readWriteDataGroup="Everyone" readWriteDataGroup2="Nobody" useCubeDataAccessSecurity="false" dataCellAccessCategories="" conditionalInputCategories="" dataMgmtAccessCategories="">`
    : isAccount 
    ? `          <member name="${escapeXml(m.name)}" alias="" description="${escapeXml(m.desc)}" displayMemberGroup="Everyone">`
    : `          <member name="${escapeXml(m.name)}" alias="" description="${escapeXml(m.desc)}" displayMemberGroup="Everyone" action="Delete">`;

  // Member properties block
  const memberPropsBlock = isEntity
    ? buildEntityMemberProps(memberProps)
    : isAccount
    ? buildAccountMemberProps(memberProps)
    : buildUDMemberProps(memberProps);

  // Relationship element differs: Entity has nested <properties>, UD and Account have aggregationWeight attr
  const relElement = (r) => isEntity
    ? [
        `          <relationship parent="${escapeXml(r.parent)}" child="${escapeXml(r.child)}">`,
        buildEntityRelProps(memberProps),
        `          </relationship>`,
      ].join("\n")
    : `          <relationship parent="${escapeXml(r.parent)}" child="${escapeXml(r.child)}" aggregationWeight="${agw}"/>`;

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Generated by OneStream Metadata Builder — ${new Date().toISOString()} -->`,
    `<OneStreamXF version="9.2.0.18004">`,
    `  <metadataRoot>`,
    `    <dimensions>`,
    `      <dimension ${dimAttrs}>`,
    `        <properties/>`,
    `        <members>`,
    ...Object.values(members).map(m => [
      memberTag(m),
      `            <properties>`,
      memberPropsBlock,
      `            </properties>`,
      `          </member>`,
    ].join("\n")),
    `        </members>`,
    `        <relationships>`,
    ...relationships.map(r => relElement(r)),
    `        </relationships>`,
    `      </dimension>`,
    `    </dimensions>`,
    `  </metadataRoot>`,
    `</OneStreamXF>`,
  ];
  return lines.join("\n");
}

// Keep legacy exports so old imports don't crash
export function generateMemberXml(members, dimName) { return generateOneStreamXml({ members, relationships: [], dimType: "UD1", dimName, inheritedDim: "", memberProps: {}, aggregationWeight: "1.0" }); }
export function generateRelXml() { return ""; }

export function downloadFile(content, filename, type = "text/xml") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
