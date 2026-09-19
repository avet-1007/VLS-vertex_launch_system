"use strict";
// VLS editor - js/textures.js: texture previews
// ================= TEXTURES (spans) =================
function applyTexToSelection() {
  const floorTex = document.getElementById("floorTex").value || "floor_01";
  const wallTex = document.getElementById("wallTex").value || "wall_01";
  const height = parseFloat(document.getElementById("sectorHeight").value) || 128;
  const items = selItems();
  for (const m of items) {
    if (m.kind === "sector") {
      const s = getSector(m.id);
      if (s) { s.floorTex = floorTex; s.wallTex = wallTex; s.height = height; }
    } else if (m.kind === "line") {
      const l = getLineById(m.id);
      if (l) l.tex = wallTex;
    }
  }
  if (!items.length && sel.sector != null) {
    const s = getSector(sel.sector);
    if (s) { s.floorTex = floorTex; s.wallTex = wallTex; s.height = height; }
  } else if (!items.length && sel.line != null) {
    const l = getLineById(sel.line);
    if (l) l.tex = wallTex;
  }
}
function getSector(id) { return mapData.sectors.find(s => s.id === id); }

// Триггер (не пересекается с секторами): внутри/на границе прямоугольника
function pickTriggerAt(wx, wy) {
  for (const t of mapData.triggers) {
    const x1 = Math.min(t.x1, t.x2), x2 = Math.max(t.x1, t.x2);
    const y1 = Math.min(t.y1, t.y2), y2 = Math.max(t.y1, t.y2);
    const pad = 8;
    if (wx >= x1 - pad && wx <= x2 + pad && wy >= y1 - pad && wy <= y2 + pad) return t;
  }
  return null;
}

