"use strict";
// VLS editor - js/clipboard.js: clipboard Ctrl+C/V, select all Ctrl+A
// ================= CLIPBOARD (Ctrl+C / Ctrl+V) =================
// Копирует выделение вместе со всеми зависимостями (вершины линий, рёбра секторов).
function copySelection() {
  const items = selItems();
  if (!items.length) { toast("Нечего копировать — сначала выдели объекты"); return; }
  const cb = { verts: [], lines: [], sectors: [], things: [], triggers: [], lifts: [], minX: Infinity, minY: Infinity };
  const vset = new Set(), lset = new Set(), sset = new Set(), tset = new Set(), trset = new Set(), liftIds = new Set();
  for (const m of items) {
    if (m.kind === "vertex") vset.add(m.id);
    else if (m.kind === "line") { lset.add(m.id); const l = getLineById(m.id); if (l) { vset.add(l.a); vset.add(l.b); } }
    else if (m.kind === "sector") { sset.add(m.id); const s = getSector(m.id); if (s) s.verts.forEach(id => vset.add(id)); }
    else if (m.kind === "thing") tset.add(m.id);
    else if (m.kind === "trigger") trset.add(m.id);
    else if (m.kind === "floor") { const lf = liftFloorByKey(m.id); if (lf) liftIds.add(lf.L.sectorId); }
  }
  // рёбра секторов (линии между его вершинами) и лифты выбранных секторов
  for (const s of mapData.sectors) {
    if (!sset.has(s.id)) continue;
    for (const l of mapData.lines) {
      if (s.verts.includes(l.a) && s.verts.includes(l.b)) lset.add(l.id);
    }
  }
  for (const L of mapData.lifts || []) if (sset.has(L.sectorId)) liftIds.add(L.sectorId);
  // существа, лежащие внутри копируемых секторов, копируются вместе с сектором
  if (sset.size) for (const t of mapData.things) if (sset.has(t.sectorId)) tset.add(t.id);
  for (const id of vset) { const v = getV(id); if (v) { cb.verts.push(v); cb.minX = Math.min(cb.minX, v.x || 0); cb.minY = Math.min(cb.minY, v.y || 0); } }
  for (const id of lset) { const l = getLineById(id); if (l) cb.lines.push(l); }
  for (const id of sset) { const s = getSector(id); if (s) cb.sectors.push(s); }
  // якорь вставки — по всей геометрии буфера, а не только вершинам
  // (иначе существо/триггер вставлялись далеко от курсора или поверх оригинала)
  for (const id of tset) { const t = mapData.things.find(x => x.id === id); if (t) { cb.things.push(t); cb.minX = Math.min(cb.minX, t.x || 0); cb.minY = Math.min(cb.minY, t.y || 0); } }
  for (const id of trset) { const t = mapData.triggers.find(x => x.id === id); if (t) { cb.triggers.push(t); cb.minX = Math.min(cb.minX, t.x1 || 0, t.x2 || 0); cb.minY = Math.min(cb.minY, t.y1 || 0, t.y2 || 0); } }
  for (const sid of liftIds) { const L = (mapData.lifts || []).find(x => x.sectorId === sid); if (L) { cb.lifts.push(L); for (const f of L.floors) { cb.minX = Math.min(cb.minX, f.x || 0); cb.minY = Math.min(cb.minY, f.y || 0); } } }
  if (!isFinite(cb.minX)) cb.minX = 0;
  if (!isFinite(cb.minY)) cb.minY = 0;
  clipboard = cb;
  toast("Скопировано: точек " + cb.verts.length + ", линий " + cb.lines.length + ", секторов " + cb.sectors.length +
        ", существ " + cb.things.length + ", триггеров " + cb.triggers.length);
  log("Ctrl+C: скопировано объектов: вершин " + cb.verts.length + ", линий " + cb.lines.length + ", секторов " + cb.sectors.length + ", существ " + cb.things.length + ", триггеров " + cb.triggers.length);
}

// Вставка буфера со смещением на текущую позицию курсора (шаг GRID_SIZE).
function pasteSelection() {
  if (!clipboard) { toast("Буфер пуст — сначала Ctrl+C"); return; }
  const w = preview || { x: cam.x, y: cam.y };
  const sx = snap(w.x), sy = snap(w.y);
  const offX = sx - Math.round(clipboard.minX / GRID_SIZE) * GRID_SIZE;
  const offY = sy - Math.round(clipboard.minY / GRID_SIZE) * GRID_SIZE;
  histPush(); // вставка — один шаг отмены
  const idMap = {};
  const sidMap = {};
  const pasted = [];
  let skippedThings = 0;
  for (const v of clipboard.verts) {
    const nid = mapData._idc++;
    idMap[v.id] = nid;
    mapData.vertices.push({ id: nid, x: v.x + offX, y: v.y + offY });
    pasted.push({ kind: "vertex", id: nid });
  }
  for (const l of clipboard.lines) {
    const nid = mapData._idc++;
    mapData.lines.push({ id: nid, a: idMap[l.a] != null ? idMap[l.a] : l.a, b: idMap[l.b] != null ? idMap[l.b] : l.b, tex: l.tex || "wall_01", flags: l.flags || "0", free: !!l.free, step: !!l.step });
    pasted.push({ kind: "line", id: nid });
  }
  for (const s of clipboard.sectors) {
    const nid = mapData._idc++;
    sidMap[s.id] = nid;
    mapData.sectors.push({ id: nid, verts: s.verts.map(v => idMap[v] != null ? idMap[v] : v), floorTex: s.floorTex || "floor_01", wallTex: s.wallTex || "wall_01", height: s.height || 128, flags: s.flags || 0, stone: !!s.stone, fragile: !!s.fragile, neighbors: [], offset: { x: 0, y: 0 } });
    pasted.push({ kind: "sector", id: nid });
  }
  for (const th of clipboard.things) {
    const pc = parseThingCode(th.id);
    const nid = nextThingId(pc ? pc.letter : "A");
    // кодов не хватило — пропускаем, а не плодим дубликаты
    if (!nid) { skippedThings++; continue; }
    if (th.id != null) idMap[th.id] = nid;
    mapData.things.push({ id: nid, type: th.type || nid, name: th.name || nid, x: th.x + offX, y: th.y + offY, slot: th.slot || 1, sectorId: sidMap[th.sectorId] != null ? sidMap[th.sectorId] : (pickSectorAt(th.x + offX, th.y + offY) || { id: null }).id });
    pasted.push({ kind: "thing", id: nid });
  }
  for (const tr of clipboard.triggers) {
    const nid = mapData._idc++;
    mapData.triggers.push({ id: nid, tid: tr.tid || "trigger_" + nid, type: tr.type || "inner", ticks: tr.ticks || 5, x1: tr.x1 + offX, y1: tr.y1 + offY, x2: tr.x2 + offX, y2: tr.y2 + offY });
    pasted.push({ kind: "trigger", id: nid });
  }
  // лифты: привязываем к новосозданному скопированному сектору
  for (const L of clipboard.lifts) {
    const targetSid = sidMap[L.sectorId];
    if (targetSid == null) continue;
    const nid = mapData._idc++;
    const nl = { id: nid, sectorId: targetSid, curve: L.curve || "sin", sec: L.sec || 3, floors: L.floors.map(f => {
      const nf = { name: f.name, x: f.x + offX, y: f.y + offY };
      if (f.entityId != null) nf.entityId = idMap[f.entityId] != null ? idMap[f.entityId] : f.entityId;
      if (f.entityType != null) nf.entityType = f.entityType;
      return nf;
    }) };
    if (L.zeroEntityId != null) nl.zeroEntityId = idMap[L.zeroEntityId] != null ? idMap[L.zeroEntityId] : L.zeroEntityId;
    if (L.zeroEntityType != null) nl.zeroEntityType = L.zeroEntityType;
    mapData.lifts.push(nl);
  }
  multiSel = pasted;
  sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
  if (pasted.length) { const lb = pasted[pasted.length - 1]; sel[lb.kind === "line" ? "line" : lb.kind] = lb.id; }
  updateThingPanel(); updateLiftPanel(); updateChecks(); updateHud();
  draw(); saveMap();
  toast("Вставлено объектов: " + pasted.length + (skippedThings ? " (существа без свободных кодов пропущены: " + skippedThings + ")" : ""));
  log("Ctrl+V: вставлено объектов: " + pasted.length + " (смещение " + offX + ";" + offY + ")" + (skippedThings ? ", пропущено существ без кодов: " + skippedThings : ""));
}

// Выделить вообще всё: точки, линии, сектора, существа, триггеры, этажи лифтов
function selectAll() {
  multiSel = [];
  for (const v of mapData.vertices) multiSel.push({ kind: "vertex", id: v.id });
  for (const l of mapData.lines) multiSel.push({ kind: "line", id: l.id });
  for (const s of mapData.sectors) multiSel.push({ kind: "sector", id: s.id });
  for (const t of mapData.things) multiSel.push({ kind: "thing", id: t.id });
  for (const t of mapData.triggers) multiSel.push({ kind: "trigger", id: t.id });
  for (const L of (mapData.lifts || [])) for (let fi = 0; fi < L.floors.length; fi++) multiSel.push({ kind: "floor", id: "L" + L.id + "@" + fi });
  sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
  hudText = "Выбрано объектов: " + multiSel.length;
  updateThingPanel(); updateTriggerPanel(); updateLiftPanel(); updateHud(); updateChecks();
  draw(); saveMap();
  log("Ctrl+A: выбраны все объекты (" + multiSel.length + ")");
}

