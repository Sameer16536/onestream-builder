import { useState } from "react";
import { C } from "./theme";
import { useWindowSize, BP } from "./hooks/useWindowSize";
import { buildHierarchyAsync } from "./core/buildHierarchy";
import { generateOneStreamXml } from "./core/utils";

import { TopBar, StepSidebar, MobileStepBar } from "./components/layout/TopBar";
import { ConfirmModal, ProcessingScreen } from "./components/layout/Modals";
import { StepUpload } from "./components/upload/StepUpload";
import { StepLevels, StepMapping, StepHierarchyOrder, StepConfig } from "./components/steps/Steps";
import { StepProperties } from "./components/steps/StepProperties";
import { ResultPanel } from "./components/results/ResultPanel";
import { ExcelPreview, ColumnLegend } from "./components/shared/ExcelPreview";
import { Alert } from "./components/shared/primitives";

export default function App() {
  // ── State ────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [excelData, setExcelData] = useState(null);  // { headers, rows, totalRows }
  const [wb, setWb] = useState(null);  // raw workbook — kept for re-use
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [maxLevels, setMaxLevels] = useState(null);
  const [mapping, setMapping] = useState({});
  const [hierarchyOrder, setHierarchyOrder] = useState(null);
  // Step 5 — Properties
  const [dimType, setDimType] = useState(null);
  const [memberProps, setMemberProps] = useState(null);
  // Step 6 — Config
  const [rootName, setRootName] = useState(null);
  const [dimName, setDimName] = useState(null);
  const [inheritedDim, setInheritedDim] = useState(null);
  const [collisionMode, setCollisionMode] = useState("collapse");

  const [showConfirm, setShowConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [buildError, setBuildError] = useState(null);

  // ── Responsive ───────────────────────────────────────────────────────────────
  const { width } = useWindowSize();
  const isMobile = width < BP.tablet;
  const isNarrow = width < BP.desktop;   // hide preview panel, show below
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const initMapping = n => {
    const m = {};
    for (let i = 1; i <= n; i++) m[`L${i}`] = "";
    setMapping(m);
  };

  const reset = () => {
    setStep(1); setExcelData(null); setWb(null);
    setFileName(""); setSheetName("");
    setMaxLevels(null); setMapping({}); setHierarchyOrder(null);
    setDimType(null); setMemberProps(null);
    setRootName(null); setDimName(null); setInheritedDim(null); setCollisionMode("collapse");
    setShowConfirm(false); setProcessing(false); setProgress(0);
    setResult(null); setBuildError(null); setShowPreviewDrawer(false);
  };

  // Navigate back to a previous step, clearing only downstream state
  const handleNavigate = (targetStep) => {
    if (targetStep >= step) return; // only go backwards
    setStep(targetStep);
    setShowConfirm(false);
    setResult(null);
    setBuildError(null);
    // Clear state that belongs to steps after the target
    if (targetStep <= 1) {
      setExcelData(null); setWb(null); setFileName(""); setSheetName("");
      setMaxLevels(null); setMapping({}); setHierarchyOrder(null);
      setDimType(null); setMemberProps(null);
      setRootName(null); setDimName(null); setInheritedDim(null); setCollisionMode("collapse");
    }
    if (targetStep <= 2) { setMapping({}); setHierarchyOrder(null); setDimType(null); setMemberProps(null); setRootName(null); setDimName(null); setInheritedDim(null); }
    if (targetStep <= 3) { setHierarchyOrder(null); setDimType(null); setMemberProps(null); setRootName(null); setDimName(null); setInheritedDim(null); }
    if (targetStep <= 4) { setDimType(null); setMemberProps(null); setRootName(null); setDimName(null); setInheritedDim(null); }
    if (targetStep <= 5) { setRootName(null); setDimName(null); setInheritedDim(null); setCollisionMode("collapse"); }
  };

  const handleUploadData = (data, workbook, name, sheet) => {
    setExcelData(data);
    setWb(workbook);
    setFileName(name);
    setSheetName(sheet);
    setMaxLevels(null);
    setMapping({});
    setHierarchyOrder(null);
    setDimType(null); setMemberProps(null);
    setRootName(null); setDimName(null); setInheritedDim(null); setCollisionMode("collapse");
    setResult(null);
    setBuildError(null);
    setProgress(0);
    setShowConfirm(false);
    setStep(2);
  };

  const handleGenerate = async () => {
    setShowConfirm(false); setProcessing(true); setProgress(0); setBuildError(null);
    try {
      const r = await buildHierarchyAsync(
        excelData.rows, mapping, hierarchyOrder, rootName, collisionMode, setProgress
      );
      setResult(r); setStep(7);
    } catch (e) { setBuildError(e.message); }
    finally { setProcessing(false); }
  };

  // ── Layout decisions ─────────────────────────────────────────────────────────
  const hasFile = !!excelData;
  const showSidebar = hasFile && !processing && !isMobile;
  const canShowPreview = hasFile && !result && !processing;
  const showRightPanel = canShowPreview && !isNarrow;

  // ── Grid template ────────────────────────────────────────────────────────────
  let gridCols = "1fr";
  if (showSidebar && showRightPanel) gridCols = "200px 1fr 1fr";
  else if (showSidebar) gridCols = "200px 1fr";

  const TOPBAR_H = 57;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { margin: 0; padding: 0; background: ${C.bg}; }
        select option { background: #0f1120; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2240; border-radius: 3px; }
      `}</style>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <TopBar
        fileName={fileName}
        sheetName={sheetName}
        processing={processing}
        onReset={reset}
      />

      {/* ── Mobile step dots ───────────────────────────────────────────────── */}
      {isMobile && hasFile && !processing && <MobileStepBar step={step} />}

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols }}>

        {/* Left sidebar — desktop only */}
        {showSidebar && (
          <div style={{
            borderRight: `1px solid ${C.border}`,
            padding: "24px 16px",
            background: C.surface,
            position: "sticky",
            top: TOPBAR_H,
            height: `calc(100vh - ${TOPBAR_H}px)`,
            overflowY: "auto",
            alignSelf: "start",
          }}>
            <StepSidebar step={step} sheetName={sheetName} onNavigate={handleNavigate} />
          </div>
        )}

        {/* ── Center: step content ─────────────────────────────────────────── */}
        <div style={{
          padding: isMobile ? "20px 16px" : "28px",
          overflowY: "auto",
          minHeight: `calc(100vh - ${TOPBAR_H}px)`,
          borderRight: showRightPanel ? `1px solid ${C.border}` : "none",
        }}>
          {processing && (
            <ProcessingScreen progress={progress} rowCount={excelData?.rows?.length || 0} />
          )}
          {buildError && !processing && (
            <Alert type="error">Build failed: {buildError}</Alert>
          )}

          {!processing && (
            <>
              {step === 1 && (
                <StepUpload onData={handleUploadData} />
              )}
              {step === 2 && (
                <StepLevels
                  initialN={maxLevels || 3}
                  onSet={n => { setMaxLevels(n); initMapping(n); setStep(3); }}
                />
              )}
              {step === 3 && excelData && (
                <StepMapping
                  headers={excelData.headers}
                  maxLevels={maxLevels}
                  mapping={mapping}
                  setMapping={setMapping}
                  onSet={m => { setMapping(m); setStep(4); }}
                />
              )}
              {step === 4 && excelData && (
                <StepHierarchyOrder
                  maxLevels={maxLevels}
                  mapping={mapping}
                  headers={excelData.headers}
                  initialOrder={hierarchyOrder}
                  onSet={o => { setHierarchyOrder(o); setStep(5); }}
                />
              )}
              {step === 5 && (
                <StepProperties
                  initialDimType={dimType}
                  initialProps={memberProps}
                  onSet={(type, props) => { setDimType(type); setMemberProps(props); setStep(6); }}
                />
              )}
              {step === 6 && (
                <StepConfig
                  initialRootName={rootName || "Region"}
                  initialDimName={dimName || "RegionHierarchy"}
                  initialCollisionMode={collisionMode || "collapse"}
                  dimType={dimType}
                  initialInheritedDim={inheritedDim}
                  onSet={(root, dim, mode, inh) => {
                    setRootName(root); setDimName(dim); setCollisionMode(mode); setInheritedDim(inh);
                    setShowConfirm(true);
                  }}
                />
              )}
              {step === 7 && result && (
                <ResultPanel
                  result={result}
                  dimName={dimName}
                  dimType={dimType}
                  inheritedDim={inheritedDim}
                  memberProps={memberProps}
                  collisionMode={collisionMode}
                  onReset={reset}
                />
              )}
            </>
          )}

          {/* ── Narrow screens: preview below step content ─────────────────── */}
          {canShowPreview && isNarrow && !processing && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.08em" }}>
                  EXCEL PREVIEW
                </div>
                <button
                  onClick={() => setShowPreviewDrawer(v => !v)}
                  style={{
                    background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
                    color: C.textMuted, fontSize: 11, cursor: "pointer", padding: "3px 10px",
                    fontFamily: "inherit",
                  }}
                >
                  {showPreviewDrawer ? "Hide ▲" : "Show ▼"}
                </button>
              </div>
              {showPreviewDrawer && (
                <>
                  <ExcelPreview
                    rows={excelData.rows}
                    headers={excelData.headers}
                    totalRows={excelData.totalRows}
                    mapping={step >= 3 ? mapping : null}
                  />
                  {step >= 3 && <ColumnLegend mapping={mapping} headers={excelData.headers} />}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: excel preview — wide screens only ──────────────── */}
        {showRightPanel && (
          <div style={{ padding: "28px 24px", overflowY: "auto", background: C.bg }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 12 }}>
              EXCEL PREVIEW
            </div>
            <ExcelPreview
              rows={excelData.rows}
              headers={excelData.headers}
              totalRows={excelData.totalRows}
              mapping={step >= 3 ? mapping : null}
            />
            {step >= 3 && <ColumnLegend mapping={mapping} headers={excelData.headers} />}
          </div>
        )}
      </div>

      {/* ── Confirm modal ───────────────────────────────────────────────────── */}
      {showConfirm && excelData && (
        <ConfirmModal
          headers={excelData.headers}
          mapping={mapping}
          hierarchyOrder={hierarchyOrder}
          rowCount={excelData.totalRows}
          sheetName={sheetName}
          rootName={rootName}
          dimName={dimName}
          collisionMode={collisionMode}
          onConfirm={handleGenerate}
          onEdit={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
