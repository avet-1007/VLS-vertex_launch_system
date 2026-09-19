"use strict";
// VLS editor - js/render.js: drawing: grid, sectors, lines, preview
// ================= DRAWING =================
// Размер глифа на экране: растёт при приближении (мин. 1px, макс. 4× базу),
// чтобы точки/линии не сжимались, когда пользователь наезжает камерой.
function gs(base) {
  const s = base * cam.zoom;
  return Math.max(1, Math.min(s, base * 4));
}

function draw() {
  ctx.clearRect(0,0,W,H);
  drawGrid();
  drawSectors();
  drawLines();
  drawPoints();
  drawConnects();
  drawThings();
  drawTriggers();
  drawLifts();
  drawBindPreview();
  drawPreview();
  drawSelection();
  drawRectSel();
  drawBox();
  drawTriggerRect();
}

function drawGrid() {
  const vw = W / cam.zoom, vh = H / cam.zoom;
  const x0 = cam.x - vw/2, y0 = cam.y - vh/2;
  const x1 = cam.x + vw/2, y1 = cam.y + vh/2;

  // minor grid: 1 unit (only when zoomed enough)
  // major grid: 40 units
  ctx.lineWidth = gs(1);
  // major
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  for (let x = Math.floor(x0/GRID_SIZE)*GRID_SIZE; x <= x1; x += GRID_SIZE) {
    const sx = worldToScreen(x,0).x;
    ctx.moveTo(sx,0); ctx.lineTo(sx,H);
  }
  for (let y = Math.floor(y0/GRID_SIZE)*GRID_SIZE; y <= y1; y += GRID_SIZE) {
    const sy = worldToScreen(0,y).y;
    ctx.moveTo(0,sy); ctx.lineTo(W,sy);
  }
  ctx.stroke();

  // minor 1-unit grid when zoom large enough
  if (cam.zoom >= 3) {
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (let x = Math.floor(x0); x <= x1; x += 1) {
      const sx = worldToScreen(x,0).x;
      ctx.moveTo(sx,0); ctx.lineTo(sx,H);
    }
    for (let y = Math.floor(y0); y <= y1; y += 1) {
      const sy = worldToScreen(0,y).y;
      ctx.moveTo(0,sy); ctx.lineTo(W,sy);
    }
    ctx.stroke();
  }

  // axes
  ctx.strokeStyle = "rgba(200,120,60,0.5)";
  ctx.lineWidth = gs(2);
  ctx.beginPath();
  const ox = worldToScreen(0,0).x, oy = worldToScreen(0,0).y;
  if (ox >= 0 && ox <= W) { ctx.moveTo(ox,0); ctx.lineTo(ox,H); }
  if (oy >= 0 && oy <= H) { ctx.moveTo(0,oy); ctx.lineTo(W,oy); }
  ctx.stroke();
}

function drawSectors() {
  for (const s of mapData.sectors) {
    const poly = s.verts.map(id => getV(id)).filter(Boolean);
    if (poly.length < 3) continue;
    const sc = poly.map(v => worldToScreen(v.x + (s.offset? s.offset.x:0), v.y + (s.offset? s.offset.y:0)));
    ctx.beginPath();
    ctx.moveTo(sc[0].x, sc[0].y);
    for (let i=1;i<sc.length;i++) ctx.lineTo(sc[i].x, sc[i].y);
    ctx.closePath();
    if (s.stone) {
      hatchSector(ctx, sc, "rgba(60,64,80,0.45)", "rgba(255,255,255,0.4)", gs(14), gs(5));
    } else if (s.fragile) {
      // хрупкая коробка (деревянный ящик): деревянная заливка и широкие линии-перекладины
      hatchSector(ctx, sc, "rgba(96,62,28,0.5)", "rgba(222,176,112,0.55)", gs(16), gs(8));
    } else {
      ctx.fillStyle = "rgba(120,124,150,0.14)";   // blue-grey sector tint
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(122,126,150,0.8)";
    ctx.lineWidth = gs(2);
    ctx.stroke();
  }
}

function hatchSector(ctx, sc, fillColor, lineColor, step, lw) {
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const xs = sc.map(p => p.x), ys = sc.map(p => p.y);
  const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  const L = Math.hypot(maxX - minX, maxY - minY) + step * 2;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let ox = minX - L; ox <= maxX + step; ox += step) {
    ctx.moveTo(ox, minY - L);
    ctx.lineTo(ox + L, minY + L);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(sc[0].x, sc[0].y);
  for (let i=1;i<sc.length;i++) ctx.lineTo(sc[i].x, sc[i].y);
  ctx.closePath();
}

function drawLineWithPerp(a, b, flags) {
  const sa = worldToScreen(a.x, a.y), sb = worldToScreen(b.x, b.y);
  let color = "#ffffff";
  if (flags === "2") color = "#7ad9a0";      // portal/connected (green)
  else if (flags === "ST") color = "#b8ffd8"; // стык лифта (зеленоватый)
  else color = "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = gs(4);
  ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();

  // perpendicular marker (like Godot)
  const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
  const dx = b.x-a.x, dy = b.y-a.y;
  const len = Math.hypot(dx,dy) || 1;
  const px = -dy/len, py = dx/len;
  const size = gs(6);
  let markerColor = "#a55d0e";   // brown for open lines
  if (flags === "1") markerColor = "#7ab07a";  // green closed
  if (flags === "2") markerColor = "#7ad9a0";  // portal
  if (flags === "F") markerColor = "#d9b34c";  // free passage (barrier, закрывает сектор)
  if (flags === "ST") markerColor = "#7affc0"; // step (шов лифта)
  const sm = worldToScreen(mid.x, mid.y);
  ctx.strokeStyle = markerColor;
  ctx.lineWidth = gs(2);
  ctx.beginPath();
  ctx.moveTo(sm.x - px*size, sm.y - py*size);
  ctx.lineTo(sm.x + px*size, sm.y + py*size);
  ctx.stroke();
}

function drawLines() {
  for (const l of mapData.lines) {
    const a = getV(l.a), b = getV(l.b);
    if (!a || !b) continue;
    const flags = l.flags || "0";
    // determine if closed member
    let f = flags;
    if (f === "2") { /* portal — не перекрашиваем */ }
    else {
      const poly = isLineInSectorPoly(l);
      if (poly) f = "1";
    }
    if (l.step) f = "ST";
    else if (l.free) f = "F";
    drawLineWithPerp(a, b, f);
    if (f === "F") drawFreeGhost(l);
  }
}
function isLineInSectorPoly(line) {
  for (const s of mapData.sectors) {
    for (let i=0;i<s.verts.length;i++) {
      const a = s.verts[i], b = s.verts[(i+1)%s.verts.length];
      if ((a===line.a&&b===line.b)||(a===line.b&&b===line.a)) return true;
    }
  }
  return false;
}

function drawPoints() {
  for (const v of mapData.vertices) {
    const s = worldToScreen(v.x, v.y);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(s.x,s.y, gs(3.5), 0, 6.283); ctx.fill();
  }
}

function drawConnects() {
  for (const c of mapData.connects) {
    const l1 = getLineById(c.lineId);
    const l2 = getLineById(c.line2Id);
    const stepL = (l1 && l1.step) || (l2 && l2.step);
    // в середине первой линии рисуем ОДИН маркер на пару
    const l = l1 || l2;
    if (!l) continue;
    const a = getV(l.a), b = getV(l.b);
    if (!a || !b) continue;
    const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
    const s = worldToScreen(mid.x, mid.y);

    if (stepL) {
      // стык для лифта: яркий зелёный кружок (как у обычного соединения)
      const r = gs(10);
      ctx.strokeStyle = "#7affc0";
      ctx.lineWidth = gs(3.5);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.stroke();
    } else {
      // обычное соединение: один простой зелёный кружок, внутри ничего
      const r = gs(11);
      ctx.strokeStyle = "#3fae7f";
      ctx.lineWidth = gs(4);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.stroke();
    }
  }
}

// призрачный кружок на свободной линии (пунктир: штрих 2° через зазор)
function drawFreeGhost(l) {
  const a = getV(l.a), b = getV(l.b);
  if (!a || !b) return;
  const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
  const s = worldToScreen(mid.x, mid.y);
  const r = gs(11);
  ctx.strokeStyle = "rgba(122,217,160,0.5)";
  ctx.lineWidth = gs(2.5);
  const seg = 2 * Math.PI / 90;      // 4° шага
  const arcL = (4/360) * 6.283;       // штрих 4°
  const gapL = (2/360) * 6.283;       // зазор 2°
  ctx.beginPath();
  for (let a0 = 0; a0 < 6.283; a0 += arcL + gapL) {
    ctx.arc(s.x, s.y, r, a0, Math.min(a0 + arcL, 6.283));
  }
  ctx.stroke();
}

function drawThings() {
  for (const t of mapData.things) {
    const s = worldToScreen(t.x, t.y);
    // маленькое существо (ромбик)
    ctx.fillStyle = "#d9b34c";
    const r = gs(3);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r);
    ctx.lineTo(s.x + r, s.y);
    ctx.lineTo(s.x, s.y + r);
    ctx.lineTo(s.x - r, s.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(217,179,76,0.7)";
    ctx.lineWidth = gs(1);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = (gs(8)) + "px Consolas";
    ctx.fillText(t.name || t.type, s.x + r + 2, s.y - r + 6);
  }
}

// Триггеры: прямоугольник + два ярких ромба по крайним углам (это и есть «два угла триггера»)
function drawTriggerDiamond(x, y, chosen) {
  const s = worldToScreen(x, y);
  const r = gs(chosen ? 6 : 5);
  ctx.fillStyle = chosen ? "#66e0ff" : "#4de1ff";
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = gs(1.5);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
function drawTriggers() {
  for (const t of mapData.triggers) {
    const x1 = Math.min(t.x1, t.x2), x2 = Math.max(t.x1, t.x2);
    const y1 = Math.min(t.y1, t.y2), y2 = Math.max(t.y1, t.y2);
    const s1 = worldToScreen(x1, y1), s2 = worldToScreen(x2, y2);
    ctx.fillStyle = "rgba(77,225,255,0.10)";
    ctx.fillRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
    ctx.strokeStyle = "rgba(77,225,255,0.55)";
    ctx.lineWidth = gs(1.5);
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
    ctx.setLineDash([]);
    const selT = (sel.trigger === t.id);
    drawTriggerDiamond(t.x1, t.y1, selT && sel.triggerCorner === "tl");
    drawTriggerDiamond(t.x2, t.y2, selT && sel.triggerCorner === "br");
  }
}

// превью растущего триггера (инструмент «Триггер»: зажал ЛКМ — растягиваешь прямоугольник)
function drawTriggerRect() {
  if (tool !== "trigger" || !trigAnchor || !preview) return;
  const cur = { x: preview.x, y: preview.y };
  const x1 = Math.min(trigAnchor.x, cur.x), x2 = Math.max(trigAnchor.x, cur.x);
  const y1 = Math.min(trigAnchor.y, cur.y), y2 = Math.max(trigAnchor.y, cur.y);
  const s1 = worldToScreen(x1, y1), s2 = worldToScreen(x2, y2);
  ctx.fillStyle = "rgba(77,225,255,0.12)";
  ctx.fillRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
  ctx.strokeStyle = "rgba(77,225,255,0.9)";
  ctx.lineWidth = gs(2);
  ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
  drawTriggerDiamond(x1, y1, false);
  drawTriggerDiamond(x2, y2, false);
}

function drawPreview() {
  if (!preview) return;
  const p = preview;

  // --- подсветка линии/точки под курсором ---
  if (hoverLine !== null) {
    const hl = getLineById(hoverLine);
    if (hl) {
      const a = getV(hl.a), b = getV(hl.b);
      if (a && b) {
        const sa = worldToScreen(a.x,a.y), sb = worldToScreen(b.x,b.y);
        ctx.strokeStyle = "rgba(122,217,160,0.9)";
        ctx.lineWidth = gs(9);
        ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();
      }
    }
  }
  if (hoverVertex !== null) {
    const hv = getV(hoverVertex);
    if (hv) {
      const sh = worldToScreen(hv.x, hv.y);
      ctx.strokeStyle = "rgba(76,125,217,0.9)";
      ctx.lineWidth = gs(2);
      ctx.beginPath(); ctx.arc(sh.x, sh.y, gs(7), 0, 6.283); ctx.stroke();
      ctx.fillStyle = "rgba(76,125,217,0.25)";
      ctx.fill();
    }
  }

  // --- подсветка выбранной первой линии при соединении ---
  if (tool === "connect" && pendingConnect !== null) {
    const pl = getLineById(pendingConnect);
    if (pl) {
      const a = getV(pl.a), b = getV(pl.b);
      if (a && b) {
        const sa = worldToScreen(a.x,a.y), sb = worldToScreen(b.x,b.y);
        ctx.strokeStyle = "#4c7dd9";                     // яркий синий
        ctx.lineWidth = gs(9);
        ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();
        ctx.fillStyle = "rgba(76,125,217,0.9)";
        ctx.font = (gs(10)) + "px Consolas";
        const sm = worldToScreen((a.x+b.x)/2, (a.y+b.y)/2);
        ctx.fillText("1", sm.x + gs(6), sm.y - gs(4));
      }
    }
  }
  // подсветка второй линии при наведении (пока выбираешь вторую)
  // ЗЕЛЁНАЯ — если линия накладывается на первую (кликай, соединение сработает).
  // КРАСНАЯ — если не накладывается (клик даст ошибку).
  if (tool === "connect" && pendingConnect !== null && hoverLine !== null && hoverLine !== pendingConnect) {
    const hl = getLineById(hoverLine);
    const pl = getLineById(pendingConnect);
    if (hl && pl) {
      const a = getV(hl.a), b = getV(hl.b);
      if (a && b) {
        const sa = worldToScreen(a.x,a.y), sb = worldToScreen(b.x,b.y);
        const ok = fullUncertainOverlap(pl, hl);
        if (ok) {
          ctx.strokeStyle = "rgba(122,217,160,0.95)";
          ctx.lineWidth = gs(9);
          ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();
          ctx.fillStyle = "#7ad9a0";
          ctx.font = (gs(9)) + "px Consolas";
          const sm = worldToScreen((a.x+b.x)/2,(a.y+b.y)/2);
          ctx.fillText("✓ накладывается", sm.x + gs(8), sm.y - gs(6));
        } else {
          ctx.strokeStyle = "rgba(255,120,120,0.85)";
          ctx.lineWidth = gs(7);
          ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();
          ctx.fillStyle = "#ff7878";
          ctx.font = (gs(9)) + "px Consolas";
          const sm = worldToScreen((a.x+b.x)/2,(a.y+b.y)/2);
          ctx.fillText("✗ не накладывается", sm.x + gs(8), sm.y - gs(6));
        }
      }
    }
  }

  if (tool === "point") {
    const s = worldToScreen(p.x, p.y);
    ctx.strokeStyle = "#7ad9a0";
    ctx.lineWidth = gs(2);
    ctx.beginPath(); ctx.arc(s.x,s.y, gs(6), 0, 6.283); ctx.stroke();
  }
  // Курсор-призрак «как у точки» для инструментов-создателей:
  // показывает, куда именно применится следующее действие по наведению
  if ((tool === "line" || tool === "sector" || tool === "box" || tool === "boxsmooth" || tool === "trigger") &&
      !boxAnchor && !trigAnchor) {
    const s = worldToScreen(p.x, p.y);
    const rr = gs(5);
    ctx.strokeStyle = "rgba(122,217,160,0.9)";
    ctx.lineWidth = gs(2);
    ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, 6.283); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - rr - gs(3), s.y); ctx.lineTo(s.x + rr + gs(3), s.y);
    ctx.moveTo(s.x, s.y - rr - gs(3)); ctx.lineTo(s.x, s.y + rr + gs(3));
    ctx.stroke();
  }
  if (tool === "line" && selVertices.length === 1) {
    const a = getV(selVertices[0]);
    const sa = worldToScreen(a.x,a.y), sb = worldToScreen(p.x,p.y);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = gs(4);
    ctx.beginPath(); ctx.moveTo(sa.x,sa.y); ctx.lineTo(sb.x,sb.y); ctx.stroke();
  }
  if (tool === "sector") {
    // preview of current polygon being built
    if (selVertices.length > 0) {
      ctx.strokeStyle = "rgba(122,217,160,0.5)";
      ctx.lineWidth = gs(2);
      ctx.beginPath();
      for (let i=0;i<selVertices.length;i++) {
        const v = getV(selVertices[i]);
        const s = worldToScreen(v.x,v.y);
        if (i===0) ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y);
      }
      const pv = worldToScreen(p.x,p.y);
      ctx.lineTo(pv.x,pv.y);
      ctx.stroke();
    }
  }
  if (tool === "thing") {
    const s = worldToScreen(p.x,p.y);
    ctx.strokeStyle = "rgba(217,179,76,0.7)";
    ctx.lineWidth = gs(2);
    const r = gs(6);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y); ctx.closePath();
    ctx.stroke();
  }
  if (tool === "lift") {
    const sec = pickSectorAt(p.x, p.y);
    if (sec) {
      const poly = sec.verts.map(id => getV(id)).filter(Boolean);
      const sc = poly.map(v => worldToScreen(v.x, v.y));
      ctx.strokeStyle = "rgba(76,125,217,0.8)";
      ctx.setLineDash([6,4]);
      ctx.lineWidth = gs(3);
      ctx.beginPath(); ctx.moveTo(sc[0].x, sc[0].y);
      for (let i=1;i<sc.length;i++) ctx.lineTo(sc[i].x, sc[i].y);
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(76,125,217,0.9)";
      ctx.font = (gs(9)) + "px Consolas";
      ctx.fillText("Лифт", worldToScreen(p.x,p.y).x, worldToScreen(p.x,p.y).y);
    }
  }
}

// ПКМ-выделение прямоугольником: тильда — удаление, режим «Выбор» — выделение
function drawRectSel() {
  if (!rightDrag || !rectSel) return;
  const isDel = tildeHeld;
  const isSel = tool === "select";
  if (!isDel && !isSel) return;
  const x1 = Math.min(rectSel.sx, rectSel.ex), x2 = Math.max(rectSel.sx, rectSel.ex);
  const y1 = Math.min(rectSel.sy, rectSel.ey), y2 = Math.max(rectSel.sy, rectSel.ey);
  const s1 = worldToScreen(x1, y1), s2 = worldToScreen(x2, y2);
  ctx.fillStyle = isSel ? "rgba(122,217,160,0.16)" : "rgba(76,125,217,0.15)";
  ctx.fillRect(s1.x, s1.y, s2.x-s1.x, s2.y-s1.y);
  ctx.strokeStyle = isSel ? "#7ad9a0" : "#4c7dd9";
  ctx.lineWidth = gs(1.5);
  ctx.strokeRect(s1.x, s1.y, s2.x-s1.x, s2.y-s1.y);
}

// Предпросмотр растущего сектора (прямоугольник/гладкий)
function drawBox() {
  if (!(tool === "box" || tool === "boxsmooth") || !boxAnchor || !preview) return;
  const cur = { x: preview.x, y: preview.y };
  const x1 = Math.min(boxAnchor.x, cur.x), x2 = Math.max(boxAnchor.x, cur.x);
  const y1 = Math.min(boxAnchor.y, cur.y), y2 = Math.max(boxAnchor.y, cur.y);
  const s1 = worldToScreen(x1, y1), s2 = worldToScreen(x2, y2);
  ctx.fillStyle = "rgba(122,217,160,0.15)";
  ctx.fillRect(s1.x, s1.y, s2.x-s1.x, s2.y-s1.y);
  ctx.strokeStyle = "rgba(122,217,160,0.9)";
  ctx.lineWidth = gs(2);
  ctx.strokeRect(s1.x, s1.y, s2.x-s1.x, s2.y-s1.y);
  // preview chamfer lines for smooth corner
  if (tool === "boxsmooth") {
    const g = GRID_SIZE;
    ctx.strokeStyle = "rgba(122,217,160,0.5)";
    ctx.lineWidth = gs(1);
    const tl1 = worldToScreen(x1+g,y1), tl2 = worldToScreen(x1,y1+g);
    const tr1 = worldToScreen(x2-g,y1), tr2 = worldToScreen(x2,y1+g);
    const br1 = worldToScreen(x2,y2-g), br2 = worldToScreen(x2-g,y2);
    const bl1 = worldToScreen(x1+g,y2), bl2 = worldToScreen(x1,y2-g);
    [[tl1,tl2],[tr1,tr2],[br2,br1],[bl1,bl2]].forEach(p => {
      ctx.beginPath(); ctx.moveTo(p[0].x,p[0].y); ctx.lineTo(p[1].x,p[1].y); ctx.stroke();
    });
  }
}

function drawSelection() {
  const items = selItems();
  for (const m of items) {
    if (m.kind === "vertex") {
      const v = getV(m.id);
      if (v) {
        const s = worldToScreen(v.x, v.y);
        ctx.strokeStyle = "#4c7dd9";
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.arc(s.x, s.y, gs(8), 0, 6.283); ctx.stroke();
      }
    } else if (m.kind === "line") {
      const l = getLineById(m.id);
      if (l) {
        const a = getV(l.a), b = getV(l.b);
        if (a && b) {
          const sa = worldToScreen(a.x, a.y), sb = worldToScreen(b.x, b.y);
          ctx.strokeStyle = "#4c7dd9";
          ctx.lineWidth = gs(7);
          ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
        }
      }
    } else if (m.kind === "sector") {
      const s = getSector(m.id);
      if (s) {
        const poly = s.verts.map(id => getV(id)).filter(Boolean);
        const sc = poly.map(v => worldToScreen(v.x + (s.offset && s.offset.x || 0), v.y + (s.offset && s.offset.y || 0)));
        ctx.strokeStyle = "#4c7dd9";
        ctx.lineWidth = gs(3);
        ctx.beginPath(); ctx.moveTo(sc[0].x, sc[0].y);
        for (let i = 1; i < sc.length; i++) ctx.lineTo(sc[i].x, sc[i].y);
        ctx.closePath(); ctx.stroke();
      }
    } else if (m.kind === "thing") {
      const t = mapData.things.find(x => x.id === m.id);
      if (t) {
        const s = worldToScreen(t.x, t.y);
        const r = gs(5);
        ctx.strokeStyle = "#4c7dd9";
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.stroke();
      }
    } else if (m.kind === "trigger") {
      const t = mapData.triggers.find(x => x.id === m.id);
      if (t) {
        const x1 = Math.min(t.x1, t.x2), x2 = Math.max(t.x1, t.x2);
        const y1 = Math.min(t.y1, t.y2), y2 = Math.max(t.y1, t.y2);
        const s1 = worldToScreen(x1, y1), s2 = worldToScreen(x2, y2);
        ctx.strokeStyle = "#4c7dd9";
        ctx.lineWidth = gs(2.5);
        ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
        drawTriggerDiamond(t.x1, t.y1, sel.triggerCorner === "tl");
        drawTriggerDiamond(t.x2, t.y2, sel.triggerCorner === "br");
      }
    } else if (m.kind === "floor") {
      const lf = liftFloorByKey(m.id);
      if (lf) {
        const sL = getSector(lf.L.sectorId);
        if (sL) {
          const poly = sL.verts.map(id => getV(id)).filter(Boolean);
          const fp = liftFloorPoly(lf.L, lf.fi, poly);
          if (fp) {
            const sc = fp.map(v => worldToScreen(v.x, v.y));
            ctx.strokeStyle = "#7ad9a0";
            ctx.lineWidth = gs(3);
            ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.moveTo(sc[0].x, sc[0].y);
            for (let i = 1; i < sc.length; i++) ctx.lineTo(sc[i].x, sc[i].y);
            ctx.closePath(); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        const f = lf.L.floors[lf.fi];
        if (f) {
          const a = worldToScreen(f.x || 0, f.y || 0);
          ctx.fillStyle = "#7ad9a0";
          ctx.beginPath(); ctx.arc(a.x, a.y, gs(5), 0, 6.283); ctx.fill();
        }
      }
    }
  }
}

function updateHud() {
  const t = { point:"Точка", line:"Линия", sector:"Сектор", connect:"Связь", thing:"Существо", select:"Выбор", box:"Квадрат", boxsmooth:"Квадрат (гладкий)", lift:"Лифт", trigger:"Триггер" }[tool];
  let extra = "";
  if (tool === "sector" && selVertices.length) extra = ` · точек выбрано: ${selVertices.length}`;
  if (tool === "line" && selVertices.length === 1) extra = " · кликни вторую точку";
  if (pendingConnect) extra = " · выбери вторую линию";
  if (tool === "box" || tool === "boxsmooth") extra = " · зажми ЛКМ и растяни размер комнаты";
  if (shiftHeld) extra = " · точная установка (1 юнит)";
  if (tool === "select") extra = " · выбор: " + ({vertex:"точки",line:"линии",sector:"сектора",thing:"существа",trigger:"триггера"}[selectTarget]) + " · Shift+клик = группа";
  const hud = document.getElementById("hud");
  const base = `Инструмент: ${t}${extra}`;
  hud.textContent = hudText ? hudText + "   ·   " + base : base;
}

