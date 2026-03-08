import { CHUNK_SIZE, MAX_MEMBER_NAME } from "../constants";
import { normalizeName } from "./utils";

export async function buildHierarchyAsync(rows, mapping, hierarchyOrder, rootName, collisionMode, onProgress) {
  return new Promise((resolve) => {
    const members        = {};
    const relationships  = [];
    const relPairs       = new Set();
    const assignedParent = new Set();
    const warnings       = [];
    const collisions     = [];
    const dataQuality    = { emptyRows: 0, truncatedNames: [], partialRows: [], collapsedDupes: [] };
    const safeKey        = n => n ? n.toLowerCase() : null;

    // ── Pass 1: detect cross-level name collisions ──────────────────────────
    // NOTE: Pass 1 itself is chunked to avoid blocking on large files
    const levelNamesMap = {};
    hierarchyOrder.forEach(l => { levelNamesMap[l] = new Set(); });

    let pi = 0;
    const pass1Chunk = () => {
      const end = Math.min(pi + CHUNK_SIZE, rows.length);
      for (; pi < end; pi++) {
        const row = rows[pi];
        for (const level of hierarchyOrder) {
          const colIdx = mapping[level];
          if (colIdx === "" || colIdx === undefined) continue;
          const rawVal = row[parseInt(colIdx)];
          if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") continue;
          const norm = normalizeName(rawVal);
          if (norm) levelNamesMap[level].add(norm);
        }
      }
      // Report 0–40% for pass 1
      onProgress(Math.round((pi / rows.length) * 40));
      if (pi < rows.length) { requestAnimationFrame(pass1Chunk); return; }

      // Pass 1 done — build collision set
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

      // ── Helpers ────────────────────────────────────────────────────────────
      const getMemberName = (rawVal, level) => {
        const norm = normalizeName(rawVal);
        if (!norm) return null;
        const original = rawVal ? String(rawVal).trim() : "";
        if (norm.length === MAX_MEMBER_NAME && original.length > MAX_MEMBER_NAME) {
          dataQuality.truncatedNames.push({ original, normalized: norm, level });
        }
        return collisionSet.has(norm) ? `${norm}_${level}` : norm;
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
        if (assignedParent.has(ck)) {
          warnings.push(`Row ${ri}: SKIPPED — "${child}" already has a parent, cannot also be child of "${parent}"`);
          return;
        }
        if (ancestors.has(ck)) {
          warnings.push(`Row ${ri}: SKIPPED recursion — "${parent}" → "${child}"`);
          return;
        }
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

      // Root member
      const rootNorm = normalizeName(rootName) || rootName;
      members[rootNorm] = { name: rootNorm, desc: "Root Entity" };

      // ── Pass 2: chunked row processing ─────────────────────────────────────
      let i = 0;
      const pass2Chunk = () => {
        const end = Math.min(i + CHUNK_SIZE, rows.length);
        for (; i < end; i++) {
          const row = rows[i];

          const hasAnyValue = hierarchyOrder.some(level => {
            const colIdx = mapping[level];
            if (colIdx === "" || colIdx === undefined) return false;
            const v = row[parseInt(colIdx)];
            return v !== null && v !== undefined && String(v).trim() !== "";
          });
          if (!hasAnyValue) { dataQuality.emptyRows++; continue; }

          let previous = rootNorm;
          const ancestors = new Set([safeKey(rootNorm)]);
          const levelValues = hierarchyOrder.map(level => {
            const colIdx = mapping[level];
            if (colIdx === "" || colIdx === undefined) return null;
            const rawVal = row[parseInt(colIdx)];
            if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") return null;
            return { level, rawVal };
          });

          if (collisionMode === "collapse") {
            let lastDistinctNorm = safeKey(rootNorm);
            for (const entry of levelValues) {
              if (!entry) break;
              const { level, rawVal } = entry;
              const name = addMember(rawVal, level);
              if (!name) break;
              const normKey = safeKey(name);
              if (normKey === lastDistinctNorm) {
                dataQuality.collapsedDupes.push({ rowIndex: i + 1, level, value: String(rawVal).trim() });
                continue;
              }
              addRel(previous, name, i + 1, ancestors);
              ancestors.add(normKey);
              previous = name;
              lastDistinctNorm = normKey;
            }
          } else {
            let lastFilledLi = -1;
            for (let li = 0; li < levelValues.length; li++) {
              const entry = levelValues[li];
              if (!entry) {
                if (lastFilledLi > -1) {
                  const nextFilled = levelValues.slice(li + 1).find(e => e !== null);
                  if (nextFilled) dataQuality.partialRows.push({ rowIndex: i + 1, missingLevel: hierarchyOrder[li] });
                }
                break;
              }
              const { level, rawVal } = entry;
              const name = addMember(rawVal, level);
              if (!name) break;
              addRel(previous, name, i + 1, ancestors);
              ancestors.add(safeKey(name));
              previous = name;
              lastFilledLi = li;
            }
          }
        }

        // Report 40–100% for pass 2
        onProgress(40 + Math.round((i / rows.length) * 60));
        if (i < rows.length) requestAnimationFrame(pass2Chunk);
        else resolve({ members, relationships, warnings, collisions, dataQuality });
      };

      requestAnimationFrame(pass2Chunk);
    };

    requestAnimationFrame(pass1Chunk);
  });
}
