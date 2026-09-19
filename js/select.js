"use strict";
// VLS editor - js/select.js: selection, deletion
// ================= SELECT =================
// Инструмент выбора выбирает только тот тип объекта,
// который соответствует последнему использованному инструменту:
// точка -> selectTarget="vertex", линия -> "line", сектор -> "sector".
function pickAt(wx, wy, target) {
  // Возвращает {kind, id} или null
  // Этажи лифтов всегда в приоритете — чтобы «первый этаж» можно было выделить с любым под-выбором
  for (const L of mapData.lifts || []) {
    const sL = getSector(L.sectorId);
    if (!sL) continue;
    const poly = sL.verts.map(id => getV(id)).filter(Boolean);
    for (let fi = 0; fi < (L.floors||[]).length; fi++) {
      const f = L.floors[fi];
      const dx = (f.x||0) - wx, dy = (f.y||0) - wy;
      if (dx*dx + dy*dy <= 12*12) return { kind: "floor", id: "L" + L.id + "@" + fi, liftId: L.id, floorIndex: fi };
      const fp = liftFloorPoly(L, fi, poly);
      if (fp && pointInPoly(wx, wy, fp)) return { kind: "floor", id: "L" + L.id + "@" + fi, liftId: L.id, floorIndex: fi };
    }
  }
  if (target === "vertex") {
    const v = findVertex(wx, wy) || findVertex(wx, wy, 4);
    if (v) return { kind: "vertex", id: v.id };
    const l = findLineNear(wx, wy);
    if (l) return { kind: "line", id: l.id };
  } else if (target === "line") {
    const l = findLineNear(wx, wy);
    if (l) return { kind: "line", id: l.id };
  } else if (target === "sector") {
    for (const s of mapData.sectors) {
      const poly = s.verts.map(id => getV(id)).filter(Boolean);
      if (poly.length >= 3 && pointInPoly(wx, wy, poly)) return { kind: "sector", id: s.id };
    }
  } else if (target === "thing") {
    let best = null, bd = 10;
    for (const t of mapData.things) {
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) return { kind: "thing", id: best.id };
  } else if (target === "trigger") {
    // углы-ромбы в приоритете: чтобы можно было менять размер
    for (const t of mapData.triggers) {
      const c1 = Math.hypot(wx - t.x1, wy - t.y1);
      const c2 = Math.hypot(wx - t.x2, wy - t.y2);
      if (c1 <= 12) return { kind: "trigger", id: t.id, corner: "tl" };
      if (c2 <= 12) return { kind: "trigger", id: t.id, corner: "br" };
    }
    // иначе — внутри/на границе прямоугольника (двигать целиком)
    for (const t of mapData.triggers) {
      const x1 = Math.min(t.x1, t.x2), x2 = Math.max(t.x1, t.x2);
      const y1 = Math.min(t.y1, t.y2), y2 = Math.max(t.y1, t.y2);
      const pad = 8;
      if (wx >= x1 - pad && wx <= x2 + pad && wy >= y1 - pad && wy <= y2 + pad) {
        return { kind: "trigger", id: t.id, corner: null };
      }
    }
  }
  return null;
}

// Поиск вложенного сектора: если под курсором внутри уже выбранного сектора
// есть меньший сектор (камень/хрупкая коробка или просто комната внутри комнаты),
// — вернуть самый мелкий из таких, целиком лежащих внутри внешнего.
// Вложенность проверяем по ЦЕНТРУ кандидата, а не по всем вершинам: бокс,
// приставленный вплотную к стене, имеет вершины на границе внешнего сектора.
function pickNestedSector(wx, wy, outerId) {
  const outer = getSector(outerId);
  if (!outer) return null;
  const outerPoly = outer.verts.map(id => getV(id)).filter(Boolean);
  if (outerPoly.length < 3) return null;
  const outerArea = Math.abs(polySignedArea(outerPoly)) / 2;
  let best = null, bestArea = Infinity;
  for (const s of mapData.sectors) {
    if (s.id === outerId) continue;
    const poly = s.verts.map(id => getV(id)).filter(Boolean);
    if (poly.length < 3) continue;
    // кандидат должен принимать точку клика
    if (!pointInPoly(wx, wy, poly)) continue;
    const area = Math.abs(polySignedArea(poly)) / 2;
    // должен быть меньше внешнего и его центр — внутри внешнего
    if (area >= outerArea) continue;
    const cx = poly.reduce((a, v) => a + v.x, 0) / poly.length;
    const cy = poly.reduce((a, v) => a + v.y, 0) / poly.length;
    if (!pointInPoly(cx, cy, outerPoly)) continue;
    if (area < bestArea) { bestArea = area; best = s.id; }
  }
  return best;
}

// Знаковая площадь полигона (формула шнурков)
function polySignedArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
function liftFloorByKey(key) {
  const m = /^L(\d+)@(\d+)$/.exec(key || "");
  if (!m) return null;
  const L = (mapData.lifts || []).find(x => x.id === Number(m[1]));
  if (!L || !((L.floors||[])[Number(m[2])])) return null;
  return { L, fi: Number(m[2]) };
}

// Пик этажа лифта под курсором (маркер или фантом-полигон) — для ПКМ-меню этажа
function pickFloorAt(wx, wy) {
  for (const L of mapData.lifts || []) {
    const sL = getSector(L.sectorId);
    if (!sL) continue;
    const poly = sL.verts.map(id => getV(id)).filter(Boolean);
    for (let fi = 0; fi < (L.floors||[]).length; fi++) {
      const f = L.floors[fi];
      const dx = (f.x||0) - wx, dy = (f.y||0) - wy;
      if (dx*dx + dy*dy <= 12*12) return { kind: "floor", id: "L" + L.id + "@" + fi, liftId: L.id, floorIndex: fi };
      const fp = liftFloorPoly(L, fi, poly);
      if (fp && pointInPoly(wx, wy, fp)) return { kind: "floor", id: "L" + L.id + "@" + fi, liftId: L.id, floorIndex: fi };
    }
  }
  return null;
}

function pickByTarget(wx, wy, target) {
  sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
  const hit = pickAt(wx, wy, target);
  if (hit) {
    if (hit.kind === "trigger") { sel.trigger = hit.id; sel.triggerCorner = hit.corner || null; }
    else sel[hit.kind === "line" ? "line" : hit.kind] = hit.id;
  }
}
// Входит ли объект (hit) в текущее выделение
function isInSelection(hit) {
  if (!hit) return false;
  if (multiSel.length) return multiSel.some(m => m.kind === hit.kind && m.id === hit.id);
  if (hit.kind === "vertex") return sel.vertex === hit.id;
  if (hit.kind === "line") return sel.line === hit.id;
  if (hit.kind === "sector") return sel.sector === hit.id;
  if (hit.kind === "thing") return sel.thing === hit.id;
  if (hit.kind === "trigger") return sel.trigger === hit.id;
  if (hit.kind === "floor") return sel.floor === hit.id;
  return false;
}

// Текущий список выделенного: multiSel либо одиночный sel (fallback)
function selItems() {
  if (multiSel.length) return multiSel;
  const out = [];
  if (sel.vertex != null) out.push({ kind: "vertex", id: sel.vertex });
  if (sel.line != null) out.push({ kind: "line", id: sel.line });
  if (sel.sector != null) out.push({ kind: "sector", id: sel.sector });
  if (sel.thing != null) out.push({ kind: "thing", id: sel.thing });
  if (sel.trigger != null) out.push({ kind: "trigger", id: sel.trigger });
  if (sel.floor != null) out.push({ kind: "floor", id: sel.floor });
  return out;
}

function deleteSelection() {
  const list = selItems();
  if (!list.length) return;
  let count = 0;
  for (const m of list) {
    if (m.kind === "line") {
      mapData.lines = mapData.lines.filter(l => l.id !== m.id);
      mapData.connects = mapData.connects.filter(c => c.lineId !== m.id && c.line2Id !== m.id);
      count++;
    } else if (m.kind === "vertex") {
      if (mapData.lines.some(l => l.a === m.id || l.b === m.id)) {
        hudText = "Точка V" + m.id + " используется линиями, сперва удали линии";
        continue;
      }
      mapData.vertices = mapData.vertices.filter(v => v.id !== m.id);
      count++;
    } else if (m.kind === "thing") {
      mapData.things = mapData.things.filter(t => t.id !== m.id);
      for (const L of (mapData.lifts || [])) {
        for (const f of L.floors) {
          if (f.entityId === m.id) { delete f.entityId; delete f.entityType; }
        }
        if (L.zeroEntityId === m.id) { delete L.zeroEntityId; delete L.zeroEntityType; }
      }
      count++;
    } else if (m.kind === "trigger") {
      mapData.triggers = mapData.triggers.filter(t2 => t2.id !== m.id);
      if (sel.trigger === m.id) { sel.trigger = null; sel.triggerCorner = null; }
      count++;
    } else if (m.kind === "sector") {
      mapData.sectors = mapData.sectors.filter(s => s.id !== m.id);
      mapData.things = mapData.things.filter(t => t.sectorId !== m.id);
      mapData.lifts = (mapData.lifts || []).filter(L => L.sectorId !== m.id);
      if (selLift === m.id) selLift = null;
      if (pendingFloorBind && pendingFloorBind.liftId === m.id) pendingFloorBind = null;
      count++;
    } else if (m.kind === "floor") {
      const lf = liftFloorByKey(m.id);
      if (lf) {
        lf.L.floors.splice(lf.fi, 1);
        if (pendingFloorBind && pendingFloorBind.liftId === lf.L.id && pendingFloorBind.floorIndex === lf.fi) pendingFloorBind = null;
        count++;
      }
    }
  }
  pruneOrphans();
  multisel_cleanup();
  hudText = "Удалено объектов: " + count;
  log("Удалено выделенных объектов: " + count);
  updateThingPanel();
  updateLiftPanel();
}
function multisel_cleanup() {
  // убираем из группы уже несуществующие объекты и синхронизируем sel
  const alive = [];
  for (const m of multiSel) {
    if (m.kind === "line" && getLineById(m.id)) alive.push(m);
    else if (m.kind === "vertex" && getV(m.id)) alive.push(m);
    else if (m.kind === "sector" && getSector(m.id)) alive.push(m);
    else if (m.kind === "thing" && mapData.things.some(t => t.id === m.id)) alive.push(m);
    else if (m.kind === "trigger" && mapData.triggers.some(t2 => t2.id === m.id)) alive.push(m);
    else if (m.kind === "floor" && liftFloorByKey(m.id)) alive.push(m);
  }
  multiSel = alive;
  sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
  if (multiSel.length) {
    const last = multiSel[multiSel.length - 1];
    sel[last.kind === "line" ? "line" : last.kind] = last.id;
  }
}
function pruneOrphans() {
  // remove vertices not used by any line
  const usedSet = new Set();
  for (const l of mapData.lines) { usedSet.add(l.a); usedSet.add(l.b); }
  mapData.vertices = mapData.vertices.filter(v => usedSet.has(v.id));
  // remove sectors referencing missing vertices
  mapData.sectors = mapData.sectors.filter(s => s.verts.every(id => usedSet.has(id)));
}

// Центрация при отпускании ЛКМ: одиночная точка садится ровно на узел сетки.
// Группы и связанные рёбра (линии/сектора) двигаются только квантованной дельтой — форма сохраняется.
// Shift в момент отпускания = точное движение без привязки.
function snapDrop() {
  if (!selDrag || shiftHeld) return;
  if (selDrag.kind === "floor") {
    const fl = selDrag.L.floors[selDrag.fi];
    if (fl) { fl.x = snapGrid(fl.x); fl.y = snapGrid(fl.y); }
  } else if (selDrag.kind === "trigger") {
    const tr = mapData.triggers.find(t2 => t2.id === selDrag.id);
    if (tr) {
      if (!selDrag.corner) {
        // целый триггер: сдвиг целиком с сохранением размера
        const dx = snapGrid(tr.x1) - tr.x1, dy = snapGrid(tr.y1) - tr.y1;
        tr.x1 += dx; tr.y1 += dy; tr.x2 += dx; tr.y2 += dy;
      }       else if (selDrag.corner === "tl") { tr.x1 = snapGrid(tr.x1); tr.y1 = snapGrid(tr.y1); }
      else if (selDrag.corner === "br") { tr.x2 = snapGrid(tr.x2); tr.y2 = snapGrid(tr.y2); }
      // страховка от вырождения (углы не должны схлопываться/инвертироваться)
      if (tr.x2 <= tr.x1) tr.x2 = tr.x1 + MOVE_STEP;
      if (tr.y2 <= tr.y1) tr.y2 = tr.y1 + MOVE_STEP;
    }
  } else if (selDrag.kind === "group") {
    const items = selItems();
    if (items.length === 1) {
      const m = items[0];
      if (m.kind === "vertex") { const v = getV(m.id); if (v) { v.x = snapGrid(v.x); v.y = snapGrid(v.y); } }
      else if (m.kind === "thing") { const t = mapData.things.find(x => x.id === m.id); if (t) { t.x = snapGrid(t.x); t.y = snapGrid(t.y); } }
    }
  }
}

// Двигать выделенные объекты: перемещает сами вершины,
// поэтому линии и сектора обновляются автоматически.
function moveSelection(dx, dy) {
  // Угол триггера: двигаем только его
  if (sel.trigger != null && sel.triggerCorner) {
    const tr = mapData.triggers.find(t => t.id === sel.trigger);
    if (tr) {
      if (sel.triggerCorner === "tl") { tr.x1 += dx; tr.y1 += dy; }
      else { tr.x2 += dx; tr.y2 += dy; }
    }
    return;
  }
  const list = selItems();
  // Вершины двигаются ровно один раз, даже если упоминаются несколько раз
  // (как vertex, как часть линии и как часть сектора) — иначе конструкция «складывается».
  const vset = new Set();
  for (const m of list) {
    if (m.kind === "vertex") vset.add(m.id);
    else if (m.kind === "line") {
      const l = getLineById(m.id);
      if (l) { vset.add(l.a); vset.add(l.b); }
    } else if (m.kind === "sector") {
      const s = getSector(m.id);
      if (s) for (const id of s.verts) vset.add(id);
    }
  }
  for (const id of vset) {
    const v = getV(id);
    if (v) { v.x += dx; v.y += dy; }
  }
  // Существа двигаются вместе со своими секторами (остаются на тех же местах внутри)
  const movedThingIds = new Set();
  for (const m of list) if (m.kind === "thing") movedThingIds.add(m.id);
  const movedFloorKeys = new Set();
  for (const m of list) if (m.kind === "floor") movedFloorKeys.add(m.id);
  for (const m of list) {
    if (m.kind === "sector") {
      for (const t of mapData.things) {
        if (t.sectorId === m.id && !movedThingIds.has(t.id)) {
          t.x += dx; t.y += dy;
          movedThingIds.add(t.id);
        }
      }
      // лифт передвигается вместе со своим сектором целиком; этажи, что уже в выделении, не двигаем повторно
      const liftMoved = (mapData.lifts || []).find(L => L.sectorId === m.id);
      if (liftMoved) {
        for (let fi = 0; fi < liftMoved.floors.length; fi++) {
          const key = "L" + liftMoved.id + "@" + fi;
          if (movedFloorKeys.has(key)) continue;
          liftMoved.floors[fi].x += dx; liftMoved.floors[fi].y += dy;
          movedFloorKeys.add(key);
        }
      }
    }
  }
  for (const m of list) {
    if (m.kind === "thing") {
      const t = mapData.things.find(x => x.id === m.id);
      if (t) { t.x += dx; t.y += dy; }
    } else if (m.kind === "trigger") {
      const t = mapData.triggers.find(x => x.id === m.id);
      if (t) { t.x1 += dx; t.y1 += dy; t.x2 += dx; t.y2 += dy; }
    } else if (m.kind === "floor") {
      const lf = liftFloorByKey(m.id);
      if (lf) { lf.L.floors[lf.fi].x += dx; lf.L.floors[lf.fi].y += dy; }
    }
  }
}

// ================= MARQUEE DELETE (ПКМ) =================
function rectContains(r, x, y) {
  const x1 = Math.min(r.sx,r.ex), x2 = Math.max(r.sx,r.ex);
  const y1 = Math.min(r.sy,r.ey), y2 = Math.max(r.sy,r.ey);
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}
function deleteInsideRect(r) {
  const thingsBefore = mapData.things.length, linesBefore = mapData.lines.length, sectorsBefore = mapData.sectors.length;
  // delete triggers with center inside
  mapData.triggers = mapData.triggers.filter(t => {
    const cx = (t.x1 + t.x2) / 2, cy = (t.y1 + t.y2) / 2;
    return !rectContains(r, cx, cy);
  });
  // collect vertices inside
  const insideVerts = new Set();
  for (const v of mapData.vertices) {
    if (rectContains(r, v.x, v.y)) insideVerts.add(v.id);
  }
  // delete lines where BOTH vertices are inside (fully enclosed)
  mapData.lines = mapData.lines.filter(l => !(insideVerts.has(l.a) && insideVerts.has(l.b)));
  // delete sectors whose ALL vertices are inside
  const deletedSectorIds = new Set();
  mapData.sectors = mapData.sectors.filter(s => {
    if (s.verts.length && s.verts.every(id => insideVerts.has(id))) { deletedSectorIds.add(s.id); return false; }
    return true;
  });
  // delete things inside OR belonging to deleted sectors
  mapData.things = mapData.things.filter(t => !rectContains(r, t.x, t.y) && !deletedSectorIds.has(t.sectorId));
  // delete lifts whose sector was deleted
  if (deletedSectorIds.size) {
    mapData.lifts = (mapData.lifts || []).filter(L => !deletedSectorIds.has(L.sectorId));
    if (selLift != null && deletedSectorIds.has(selLift)) { selLift = null; selLiftFloor = 0; }
    if (pendingFloorBind && deletedSectorIds.has(pendingFloorBind.liftId)) pendingFloorBind = null;
    updateLiftPanel();
  }
  // remove connects referencing deleted lines
  const lineIds = new Set(mapData.lines.map(l => l.id));
  mapData.connects = mapData.connects.filter(c => lineIds.has(c.lineId) && lineIds.has(c.line2Id));
  // now prune vertices that became orphaned
  pruneOrphans();
  hudText = "Удалено содержимое выделенной области";
  log("Удалено областью: существ " + (thingsBefore - mapData.things.length) +
      ", линий " + (linesBefore - mapData.lines.length) +
      ", секторов " + (sectorsBefore - mapData.sectors.length));
  saveMap();
}

// ПКМ-перетаскивание в режиме «Выбор»: выделить ВСЁ внутри прямоугольника
// (неважно, какой под-режим: точка/линия/сектор/существо/триггер)
function selectInsideRect(r) {
  const picked = [];
  const insideVerts = new Set();
  for (const v of mapData.vertices) {
    if (rectContains(r, v.x, v.y)) { insideVerts.add(v.id); picked.push({ kind: "vertex", id: v.id }); }
  }
  for (const t of mapData.things) if (rectContains(r, t.x, t.y)) picked.push({ kind: "thing", id: t.id });
  for (const t of mapData.triggers) {
    const cx = (t.x1 + t.x2) / 2, cy = (t.y1 + t.y2) / 2;
    if (rectContains(r, cx, cy)) picked.push({ kind: "trigger", id: t.id });
  }
  for (const l of mapData.lines) if (insideVerts.has(l.a) && insideVerts.has(l.b)) picked.push({ kind: "line", id: l.id });
  for (const s of mapData.sectors) if (s.verts.length && s.verts.every(id => insideVerts.has(id))) picked.push({ kind: "sector", id: s.id });
  // этажи лифтов: выделяются, если их точки-ориентиры внутри области
  for (const L of mapData.lifts || []) {
    for (let fi = 0; fi < (L.floors||[]).length; fi++) {
      const f = L.floors[fi];
      if (f && rectContains(r, f.x||0, f.y||0)) picked.push({ kind: "floor", id: "L" + L.id + "@" + fi });
    }
  }
  multiSel = picked;
  sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
  if (picked.length) {
    const last = picked[picked.length - 1];
    if (last.kind === "trigger") sel.trigger = last.id;
    else sel[last.kind === "line" ? "line" : last.kind] = last.id;
  }
  hudText = "Выделено областью: " + picked.length;
  log("Выделено прямоугольником объектов: " + picked.length);
  updateThingPanel();
  updateTriggerPanel();
}

