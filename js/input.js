"use strict";
// VLS editor - js/input.js: mouse, clicks, context menu
// ================= INPUT =================
// Подавляем системное меню ПКМ везде, кроме полей ввода (чтобы не было двух меню сразу)
document.addEventListener("contextmenu", e => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  e.preventDefault();
});
canvas.addEventListener("contextmenu", e => e.preventDefault());

canvas.addEventListener("mousedown", e => {
  const rect = canvas.getBoundingClientRect();
  lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const w = screenToWorld(lastMouse.x, lastMouse.y);

  if (e.button === 1) { dragging = true; return; } // middle pan

  if (e.button === 0) {
    leftBtnDown = true;
    histBegin(); // снапшот состояния до жеста (один жест = один шаг отмены)
    if (tool === "box" || tool === "boxsmooth") {
      // start dragging a box sector
      const p = snapPoint(w);
      boxAnchor = { x: p.x, y: p.y };
      leftBoxDrag = true;
    } else if (tool === "trigger") {
      // start dragging a trigger rectangle
      const p = snapPoint(w);
      trigAnchor = { x: p.x, y: p.y };
      leftTrigDrag = true;
    } else if (tool === "select" && selectTarget === "trigger") {
      // drag-move: цельный триггер или один из угловых ромбов
      const hit = pickAt(w.x, w.y, "trigger");
      if (hit) {
        const tr0 = mapData.triggers.find(t2 => t2.id === hit.id);
        selDrag = { kind: "trigger", id: hit.id, corner: hit.corner || null, sx: w.x, sy: w.y,
          x1: tr0 ? tr0.x1 : 0, y1: tr0 ? tr0.y1 : 0, x2: tr0 ? tr0.x2 : 0, y2: tr0 ? tr0.y2 : 0 };
      }
      onLeftClick(snapPoint(w), e);
} else if (tool === "select") {
      // ЛКМ-перетаскивание выделения и этажей лифта
      const hit = pickAt(w.x, w.y, selectTarget);
      if (hit && !shiftHeld && isInSelection(hit)) {
        // клик по уже выделенному объекту: сначала даём шанс «провалиться» внутрь —
        // на тот же клик может быть выбран меньший сектор под курсором (drill),
        // и только если выделение подтвердилось (не изменилось) — тащим группу
        onLeftClick(snapPoint(w), e);
        const hitA = pickAt(w.x, w.y, selectTarget);
        if (hitA && !shiftHeld && isInSelection(hitA)) {
          selDrag = { kind: "group", sx: w.x, sy: w.y, ox: 0, oy: 0 };
        }
      } else if (hit && hit.kind === "floor") {
        // фантом-этаж: перетаскивание
        const lf = liftFloorByKey(hit.id);
        if (lf) {
          const fl = lf.L.floors[lf.fi];
          selDrag = { kind: "floor", L: lf.L, fi: lf.fi, fx: fl.x, fy: fl.y, sx: w.x, sy: w.y };
        }
        onLeftClick(snapPoint(w), e);
      } else {
        onLeftClick(snapPoint(w), e);
        // после клика выделенный объект тоже можно сразу перетаскивать
        const hit2 = pickAt(w.x, w.y, selectTarget);
        if (hit2 && !shiftHeld && isInSelection(hit2)) {
          selDrag = { kind: "group", sx: w.x, sy: w.y, ox: 0, oy: 0 };
        }
      }
    } else {
      onLeftClick(snapPoint(w), e);
    }
  }

  if (e.button === 2) {
    // raw (no snap) marquee for tilde-delete / context menu
    rightDrag = true;
    rectSel = { sx: w.x, sy: w.y, ex: w.x, ey: w.y };
    e.preventDefault();
  }
});

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const w = screenToWorld(mx, my);
  const p = snapPoint(w);
  preview = { x: p.x, y: p.y };

  document.getElementById("cx").textContent = Math.round(w.x);
  document.getElementById("cy").textContent = Math.round(w.y);
  const cu = Math.round(w.x/GRID_SIZE) + "," + Math.round(w.y/GRID_SIZE);
  document.getElementById("cu").textContent = cu;

  // подсветка линии/точки под курсором для текущего инструмента
  if (tool === "connect" || (tool === "select" && selectTarget === "line")) {
    const hl = findLineNear(w.x, w.y);
    hoverLine = hl ? hl.id : null;
  } else {
    hoverLine = null;
  }
  if (tool === "line" || tool === "sector" || tool === "point" || tool === "select") {
    const hv = findVertex(w.x, w.y);
    hoverVertex = hv ? hv.id : null;
  }

  // режим привязки этажа ⇢ существо: цель под курсором и курсор-«прицел»
  if (pendingFloorBind) {
    const t = pickBindThing(w.x, w.y);
    bindTargetThing = t ? t.id : null;
  } else {
    bindTargetThing = null;
  }
  updateCursor();

  if (rightDrag && rectSel) {
    rectSel.ex = w.x;
    rectSel.ey = w.y;
  }

  if (selDrag && leftBtnDown) {
    if (selDrag.kind === "trigger") {
      const tr = mapData.triggers.find(t2 => t2.id === selDrag.id);
      if (tr) {
        // движение квантуется к сетке (Shift — по 1 юниту)
        const dx = snapDelta(w.x, selDrag.sx), dy = snapDelta(w.y, selDrag.sy);
        if (selDrag.corner === "tl") { tr.x1 = selDrag.x1 + dx; tr.y1 = selDrag.y1 + dy; }
        else if (selDrag.corner === "br") { tr.x2 = selDrag.x2 + dx; tr.y2 = selDrag.y2 + dy; }
        else { tr.x1 = selDrag.x1 + dx; tr.y1 = selDrag.y1 + dy; tr.x2 = selDrag.x2 + dx; tr.y2 = selDrag.y2 + dy; }
      }
    } else if (selDrag.kind === "floor") {
      const fl = selDrag.L.floors[selDrag.fi];
      if (fl) {
        fl.x = selDrag.fx + snapDelta(w.x, selDrag.sx);
        fl.y = selDrag.fy + snapDelta(w.y, selDrag.sy);
      }
    } else if (selDrag.kind === "group") {
      // перетаскивание всего выделения шагом MOVE_STEP (или 1 при зажатом Shift)
      const step = dragStep();
      const nx = Math.round((w.x - selDrag.sx) / step) * step;
      const ny = Math.round((w.y - selDrag.sy) / step) * step;
      const dx = nx - selDrag.ox, dy = ny - selDrag.oy;
      if (dx || dy) {
        moveSelection(dx, dy);
        selDrag.ox = nx; selDrag.oy = ny;
        draw();
        saveMap();
      }
    }
  }

  if (dragging) {
    const dx = mx-lastMouse.x, dy = my-lastMouse.y;
    cam.x -= dx/cam.zoom;
    cam.y -= dy/cam.zoom;
    lastMouse = { x: mx, y: my };
  }
  draw();
});

canvas.addEventListener("mouseup", e => {
  if (e.button === 1) dragging = false;

  if (e.button === 0) {
    if (leftBoxDrag && boxAnchor) {
      const cur = preview ? { x: preview.x, y: preview.y } : { x: boxAnchor.x, y: boxAnchor.y };
      const moved = Math.abs(cur.x - boxAnchor.x) + Math.abs(cur.y - boxAnchor.y) > 1;
      if (!moved) {
        // клик без перетаскивания по сектору — выделяем его сразу
        pickByTarget(boxAnchor.x, boxAnchor.y, "sector");
        selLift = null;
        updateThingPanel();
        updateHud();
      } else {
        createBoxSector(boxAnchor, cur, tool === "boxsmooth");
      }
      boxAnchor = null;
      leftBoxDrag = false;
      // бокс/гладкие — разовые: после использования возврат к прошлому инструменту
      if (tool === "box" || tool === "boxsmooth") setTool(prevBoxTool || "point");
    } else if (leftTrigDrag && trigAnchor) {
      const cur = preview ? { x: preview.x, y: preview.y } : { x: trigAnchor.x, y: trigAnchor.y };
      const moved = Math.abs(cur.x - trigAnchor.x) + Math.abs(cur.y - trigAnchor.y) > 1;
      if (moved) {
        createTrigger(trigAnchor, cur);
      } else {
        pickByTarget(trigAnchor.x, trigAnchor.y, "trigger");
        updateTriggerPanel();
      }
      trigAnchor = null;
      leftTrigDrag = false;
    }
    snapDrop();
    leftBtnDown = false;
    histCommit(); // завершение жеста: если что-то изменилось — шаг добавлен
  }

  if (selDrag) {
    selDrag = null;
    leftBtnDown = false;
  }

  if (e.button === 2) {
    if (rightDrag && rectSel) {
      const dx = rectSel.ex - rectSel.sx, dy = rectSel.ey - rectSel.sy;
      const isDrag = (dx*dx + dy*dy) > 6;
      const rect = canvas.getBoundingClientRect();
      const wc = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (tildeHeld && isDrag) {
        // тильда + ПКМ-перетаскивание — удаление (как раньше)
        histPush();
        deleteInsideRect(rectSel);
      } else if (tool === "select" && isDrag) {
        // ПКМ-перетаскивание в режиме «Выбор» — выделить всё внутри
        selectInsideRect(rectSel);
      } else if (tool === "lift" && !isDrag) {
        // ПКМ в режиме «Лифт»: по пустому месту или чужому сектору — добавить этаж в эту точку
        const lift2 = mapData.lifts.find(L => L.sectorId === selLift);
        const hitSec = pickSectorAt(wc.x, wc.y);
        if (lift2 && (!hitSec || hitSec.id !== selLift)) {
          histPush();
          const nm = String(lift2.floors.length + 1);
          lift2.floors.push({ name: nm, x: snapGrid(wc.x), y: snapGrid(wc.y) });
          selLiftFloor = lift2.floors.length - 1;
          hudText = "Добавлен этаж " + nm + " (ПКМ по пустому месту — ещё этаж)";
          log("Лифт LIF" + lift2.id + ": добавлен этаж " + nm + " в точку (" + snapGrid(wc.x) + ";" + snapGrid(wc.y) + ")");
          updateLiftPanel();
          draw(); saveMap();
        } else {
          openCtxMenu(e.clientX, e.clientY, wc);
        }
      } else if (!isDrag) {
        // ПКМ-клик — свойства объекта
        openCtxMenu(e.clientX, e.clientY, wc);
      }
    }
    rightDrag = false;
    rectSel = null;
  }

  updateHud();
  updateChecks();
  draw();
  saveMap();
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  // world point under cursor before zoom
  const px = (mx - W/2) / cam.zoom + cam.x;
  const py = (my - H/2) / cam.zoom + cam.y;
  const factor = e.deltaY > 0 ? 1/1.1 : 1.1;
  const nz = clamp(cam.zoom*factor, 0.2, 10);
  cam.zoom = nz;
  // keep that world point fixed under cursor
  cam.x = px - (mx - W/2) / nz;
  cam.y = py - (my - H/2) / nz;
  draw();
});

// ---------- LEFT CLICK ----------
function onLeftClick(w) {
  const wx = snap(w.x), wy = snap(w.y);

  // Режим «привязать этаж к существу»: ждём клик по существу
  if (pendingFloorBind) {
    const lift = (mapData.lifts || []).find(x => x.id === pendingFloorBind.liftId);
    const isZero = pendingFloorBind.floorIndex === -1;
    const floor = isZero ? null : (lift && lift.floors[pendingFloorBind.floorIndex]);
    let bestT = null, bd = bindPickRadius();
    for (const t of mapData.things) {
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bd) { bd = d; bestT = t; }
    }
    if (lift && (isZero || floor) && bestT) {
      histPush();
      if (isZero) { lift.zeroEntityId = bestT.id; lift.zeroEntityType = bestT.type; }
      else { floor.entityId = bestT.id; floor.entityType = bestT.type; }
      log((isZero ? "Нулевой этаж" : "Этаж " + (floor.name || (pendingFloorBind.floorIndex + 1))) + " LIF" + lift.id + " привязан" + (isZero ? " к ключику «" : " к вызывалке «") + thingLabelById(bestT.id) + "»");
      hudText = "Привязано: " + (isZero ? "нулевой этаж сектора «" + lift.sectorId + "»" : "этаж «" + (floor.name || (pendingFloorBind.floorIndex + 1)) + "»") + " → " + (isZero ? "ключик «" : "вызывалка «") + thingLabelById(bestT.id) + "»";
    } else {
      hudText = "Привязка отменена — клик мимо существа";
    }
    pendingFloorBind = null;
    bindTargetThing = null;
    selDrag = null;
    updateCursor();
    updateHud();
    updateLiftPanel();
    draw();
    saveMap();
    return;
  }

  switch (tool) {
    case "point":
      // клик по линии сектора — разрезать её на две (в точке клика),
      // иначе — поставить свободную точку
      if (!splitLineAt(wx, wy) && !findVertex(wx, wy)) addVertex(wx, wy);
      break;

    case "line": {
      const v = findVertex(wx, wy);
      if (!v) break;
      if (selVertices.length === 0) selVertices.push(v.id);
      else {
        const a = getV(selVertices[0]);
        if (a.id === v.id) { selVertices = []; break; }
        // avoid duplicate line
        const dup = mapData.lines.some(l => (l.a===a.id&&l.b===v.id)||(l.a===v.id&&l.b===a.id));
        if (!dup) {
          const L = { id:mapData._idc++, a:a.id, b:v.id, tex:"wall_01", flags:"0" };
          mapData.lines.push(L);
          log("Линия L" + L.id + " создана: V" + a.id + "→V" + v.id);
        }
        selVertices = [];
      }
      break;
    }

    case "sector": {
      const v = findVertex(wx, wy);
      if (!v) break;
      // Clicking back on the first vertex closes the polygon
      if (selVertices.length >= 3 && v.id === selVertices[0]) {
        makeSectorFromSel();
        break;
      }
      const idx = selVertices.indexOf(v.id);
      if (idx >= 0 && idx !== 0) selVertices.splice(idx, 1);  // toggle off a middle vertex
      else if (idx === -1) selVertices.push(v.id);
      break;
    }

    case "connect": {
      const l = findLineNear(wx, wy);
      if (l) tryConnect(l.id);
      break;
    }

    case "thing": {
      const nt = tryPlaceThing(wx, wy);
      if (nt) {
        // сразу выбрать поставленное — панель кода видна без лишних кликов
        multiSel = [{ kind: "thing", id: nt.id }];
        sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = nt.id; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
        updateThingPanel();
      }
      break;
    }

    case "lift": {
      // клик по сектору -> создать/выбрать лифт (фантом-сектор как зеркало)
      const sec = pickSectorAt(wx, wy);
      if (sec) {
        selLift = sec.id;
        if (!mapData.lifts.some(L => L.sectorId === sec.id)) {
          const newL = LiftNew(sec.id);
          (mapData.lifts = mapData.lifts || []).push(newL);
          log("Лифт LIF" + newL.id + " создан для сектора S" + sec.id);
        }
        selLiftFloor = 0;
        updateLiftPanel();
        hudText = "Лифт: клик по пустому месту — добавить этаж (нулевой этаж — это сам сектор, стрелки — двигать выбранный)";
        break;
      }
      // клик по пустому месту -> добавить этаж сюда (нулевой этаж всегда остаётся на секторе)
      const lift = mapData.lifts.find(L => L.sectorId === selLift);
      if (lift) {
        histPush();
        const nm = String(lift.floors.length + 1);
        lift.floors.push({ name: nm, x: snapGrid(wx), y: snapGrid(wy) });
        selLiftFloor = lift.floors.length - 1;
        hudText = "Добавлен этаж " + nm + " (клик — ещё этаж, стрелки — двигать выбранный)";
        log("Лифт LIF" + lift.id + ": добавлен этаж " + nm + " в точку (" + Math.round(wx) + ";" + Math.round(wy) + ")");
        updateLiftPanel(); draw(); saveMap();
      }
      break;
    }

    case "select": {
      let hit = pickAt(wx, wy, selectTarget);
      if (hit) {
        if (hit.kind === "trigger" && hit.corner && !shiftHeld) {
          // одиночный выбор углового ромба (менять размер триггера)
          multiSel = [];
          sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = hit.id; sel.triggerCorner = hit.corner; sel.floor = null;
        } else if (shiftHeld) {
          // Shift+клик — добавить/убрать из множественного выделения
          const idx = multiSel.findIndex(m => m.kind === hit.kind && m.id === hit.id);
          if (idx >= 0) multiSel.splice(idx, 1);
          else multiSel.push(hit);
          if (multiSel.length) {
            sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
            const last = multiSel[multiSel.length - 1];
            if (last.kind === "trigger") sel.trigger = last.id;
            else sel[last.kind === "line" ? "line" : last.kind] = last.id;
          }
        } else {
          // обычный клик — одиночное выделение
          if (selectTarget === "sector" && hit.kind === "sector" && sel.sector === hit.id) {
            // сектор уже выбран — пробуем «провалиться» внутрь: нет ли под курсором
            // меньшего сектора, целиком лежащего внутри выбранного
            const nested = pickNestedSector(wx, wy, hit.id);
            if (nested != null) hit = { kind: "sector", id: nested };
          }
          multiSel = [hit];
          sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
          if (hit.kind === "trigger") sel.trigger = hit.id;
          else sel[hit.kind === "line" ? "line" : hit.kind] = hit.id;
        }
      } else {
        multiSel = [];
        sel.vertex = null; sel.line = null; sel.sector = null; sel.thing = null; sel.trigger = null; sel.triggerCorner = null; sel.floor = null;
      }
      hudText = "Выбрано объектов: " + multiSel.length;
      updateThingPanel();
      updateTriggerPanel();
      break;
    }
  }
  updateHud();
  updateChecks();
  draw();
  saveMap();
}

function makeSectorFromSel() {
  if (selVertices.length < 3) { hudText = "Нужно минимум 3 точек"; return; }
  // build lines connecting the selected vertices in order
  const lineIds = [];
  for (let i=0;i<selVertices.length;i++) {
    const a = selVertices[i], b = selVertices[(i+1)%selVertices.length];
    let l = mapData.lines.find(ll => (ll.a===a&&ll.b===b)||(ll.a===b&&ll.b===a));
    if (!l) {
      l = { id:mapData._idc++, a, b, tex:"wall_01", flags:"0" };
      mapData.lines.push(l);
    }
    lineIds.push(l);
  }
  const ok = tryMakeSector(lineIds);
  if (ok) {
    const s = mapData.sectors[mapData.sectors.length - 1];
    log("Сектор S" + s.id + " создан по точкам (" + s.verts.length + " вершин)");
  } else {
    log("Ошибка: выбранные точки не образуют замкнутый сектор");
  }
  selVertices = [];
}

// ---------- ПКМ: КОНТЕКСТНОЕ МЕНЮ (СВОЙСТВА) ----------
let ctxTarget = null;  // { kind:'vertex'|'line'|'sector'|'thing'|'lift', ref:id }
let ctxEditPending = false;  // история в рамках сессии ПКМ-меню: первый ввод создаёт шаг, остальные — в тот же

function openCtxMenu(clientX, clientY, w) {
  if (closeCtxNextRMB) { closeCtxNextRMB = false; return; }
  pendingFloorBind = null;
  bindTargetThing = null;
  updateCursor();
  closeCtx();
  // вернуть стандартные кнопки меню (кнопки «Применить» больше нет — всё применяется сразу)
  const dlx = document.getElementById("ctmDelete");
  if (dlx) dlx.style.display = "";
  // 1) существо ближе всего
  let bestThing = null, bd = 14;
  for (const t of mapData.things) {
    const d = Math.hypot(t.x - w.x, t.y - w.y);
    if (d < bd) { bd = d; bestThing = t; }
  }
  if (bestThing) {
    ctxTarget = { kind: "thing", ref: bestThing.id };
  } else {
    const floorAt = pickFloorAt(w.x, w.y);
    if (floorAt) {
      ctxTarget = floorAt;
    } else {
      const trigAt = pickTriggerAt(w.x, w.y);
      if (trigAt) {
        ctxTarget = { kind: "trigger", ref: trigAt.id };
      } else {
        const secAt = pickInnermostSector(w.x, w.y);
        if (secAt) {
          const lift = mapData.lifts.find(L => L.sectorId === secAt.id);
          ctxTarget = lift ? { kind: "lift", ref: lift.sectorId } : { kind: "sector", ref: secAt.id };
        } else {
          const line = findLineNear(w.x, w.y, 14);
          if (line) ctxTarget = { kind: "line", ref: line.id };
          else {
            const v = findVertex(w.x, w.y, 12);
            if (v) ctxTarget = { kind: "vertex", ref: v.id };
          }
        }
      }
    }
  }
  if (!ctxTarget) return;

  renderCtx();
  const m = document.getElementById("ctm");
  m.style.display = "block";
  let px = clientX, py = clientY;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  if (px + mw > innerWidth - 8) px = Math.max(8, innerWidth - mw - 8);
  if (py + mh > innerHeight - 8) py = Math.max(8, innerHeight - mh - 8);
  m.style.left = px + "px";
  m.style.top = py + "px";
}

function renderCtx() {
  const t = document.getElementById("ctmTitle");
  const b = document.getElementById("ctmBody");
  const k = ctxTarget.kind, ref = ctxTarget.ref;
  let title = "", html = "";
  if (k === "vertex") {
    const v = getV(ref); if (!v) return;
    title = "Точка V" + v.id;
    html = '<div class="ctmbox"><div class="muted">Координаты: ' + v.x + ' ; ' + v.y + '</div></div>';
  } else if (k === "line") {
    const l = getLineById(ref); if (!l) return;
    title = "Линия L" + l.id;
    const isLiftLn = isLiftLine(l.id);
    html = '<div class="ctmbox">' +
      '<div class="row"><label>Текстура</label><input type="text" id="ctmLex" value="' + (l.tex || "wall_01") + '"></div>' +
      '<div class="row"><label>Тип</label><select id="ctmLtype">' +
      '<option value="wall"' + (!l.free && l.flags !== "2" && !l.step ? ' selected' : '') + '>Стена</option>' +
      '<option value="free"' + (l.free ? ' selected' : '') + '>Свободный проход</option>' +
      (isLiftLn ? '' :
        '<option value="portal"' + (l.flags === "2" ? ' selected' : '') + '>Портал (соединён)</option>' +
        '<option value="step"' + (l.step ? ' selected' : '') + '>Стык лифта</option>') +
      '</select></div>' +
      (isLiftLn ? '<div class="muted">Линия сектора лифта — связывать нельзя, только свободный проход.</div>' : '') +
      (l.flags === "2" ? '<button class="btn danger" id="ctmLDisconnect" style="margin-top:6px;width:100%">Разъединить (снять модификатор)</button>' : '') +
      '</div>';
  } else if (k === "sector") {
    const s = getSector(ref); if (!s) return;
    title = "Сектор S" + s.id;
    html = '<div class="ctmbox">' +
      '<div class="row"><label>Пол</label><input type="text" id="ctmFloor" value="' + (s.floorTex || "floor_01") + '"></div>' +
      '<div class="row"><label>Стены</label><input type="text" id="ctmWall" value="' + (s.wallTex || "wall_01") + '"></div>' +
      '<div class="row"><label>Высота</label><input type="number" id="ctmHeight" value="' + s.height + '"></div>' +
      '<label class="sw"><input type="checkbox" id="ctmStone"' + (s.stone ? ' checked' : '') + ' onclick="toggleSolid(this,true)">' +
      '<span class="swsl"></span><span class="swlabel">Камень<small>сплошная геометрия</small></span></label>' +
      '<label class="sw"><input type="checkbox" id="ctmFragile"' + (s.fragile ? ' checked' : '') + ' onclick="toggleSolid(this,false)">' +
      '<span class="swsl"></span><span class="swlabel">Хрупкая коробка<small>деревянная, разрушается от урона</small></span></label>' +
      '</div>';
  } else if (k === "thing") {
    const th = mapData.things.find(x => x.id === ref); if (!th) return;
    title = "Существо «" + th.id + "»";
    const thSec = mapData.sectors.find(s => s.id === th.sectorId);
    const singleThing = !(multiSel.some(m => m.kind === k && m.id === ref) && multiSel.length > 1);
    const cp = parseThingCode(th.id);
    const codeRow = singleThing
      ? '<div class="row"><label>Код</label><select id="ctmTletter" class="codeletter">' +
        '<option value="A"' + (cp && cp.letter === "A" ? ' selected' : '') + '>A</option>' +
        '<option value="B"' + (cp && cp.letter === "B" ? ' selected' : '') + '>B</option>' +
        '<option value="C"' + (cp && cp.letter === "C" ? ' selected' : '') + '>C</option></select>' +
        '<input type="text" id="ctmTnum" maxlength="8" inputmode="numeric" value="' + escHtml(cp ? cp.num : String(th.id == null ? "" : th.id).slice(0, 8)) + '" title="Номер (1 → 001) или код целиком (B012, можно с пробелом)">' +
        '<span class="spinbtns"><button class="spinbtn" id="ctmTnumUp" title="Увеличить номер">▲</button><button class="spinbtn" id="ctmTnumDown" title="Уменьшить номер">▼</button></span></div>'
      : '<div class="row"><label>Код</label><input type="text" disabled value="' + escHtml(th.id) + '" title="Группа: код правится по одному существу"></div>' +
        '<div class="muted">Группа из ' + multiSel.length + ': код правится по одному существу (коды обязаны различаться).</div>';
    html = '<div class="ctmbox">' +
      codeRow +
      '<div class="row"><label>Имя</label><input type="text" id="ctmTname" value="' + escHtml(th.name || "") + '"></div>' +
      '<div class="muted">Позиция: ' + th.x + ' ; ' + th.y + '  ·  Сектор: ' + (thSec ? "S" + thSec.id : "—") + '</div>' +
      '</div>';
  } else if (k === "trigger") {
    const tr = mapData.triggers.find(x => x.id === ref); if (!tr) return;
    title = "Триггер '" + (tr.tid || tr.id) + "'";
    html = '<div class="ctmbox">' +
      '<div class="row"><label>ID</label><input type="text" id="ctmTrigID" value="' + (tr.tid || "") + '"></div>' +
      '<div class="row"><label>Тики</label><input type="number" min="1" id="ctmTrigTicks" value="' + (tr.ticks || 5) + '"></div>' +
      '<div class="muted">Область: (' + tr.x1 + ' ; ' + tr.y1 + ') → (' + tr.x2 + ' ; ' + tr.y2 + ')</div>' +
      '<div class="muted">Перетащи сам триггер — перемещение. Перетащи угловой ромб — изменение размера.</div>' +
      '</div>';
  } else if (k === "lift") {
    const lift = mapData.lifts.find(L => L.sectorId === ref); if (!lift) return;
    const s = getSector(ref);
    title = "Лифт — сектор " + (s ? "S" + s.id : ref);
    html = '<div class="ctmbox">' +
      '<div class="row"><label>Кривая скорости</label><select id="ctmLiftCurve">' +
      '<option value="sin"' + (lift.curve === "sin" ? ' selected' : '') + '>Син (синусоида)</option>' +
      '<option value="lin"' + (lift.curve === "lin" ? ' selected' : '') + '>Линейная</option>' +
      '<option value="cus"' + (lift.curve === "cus" ? ' selected' : '') + '>Кастомная</option>' +
      '</select></div>' +
      '<div class="row"><label>Sec (время)</label><input type="number" step="0.1" min="0.1" id="ctmLiftSec" value="' + (lift.sec || 3) + '"></div>' +
      '<div style="font-size:11px;color:var(--muted)">Диаграмма скорости:</div>' +
      '<div class="curvebox"><canvas id="ctmLiftDiag" width="260" height="80"></canvas></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:6px">Ключи и вызывалки этажей:</div>' +
      (lift.zeroEntityId != null
        ? '<div style="margin:3px 0;font-size:12px">Нулевой этаж (сам сектор) → <span style="color:#ffd166">ключ «' + thingLabelById(lift.zeroEntityId) + '»</span>' +
          '<button class="btn" data-bindzero="1" style="margin-left:6px;padding:2px 8px;font-size:10px">Перепривязать</button>' +
          '<button class="btn" data-unbindzero="1" style="margin-left:2px;padding:2px 6px;font-size:10px;color:var(--danger)">Отвязать</button></div>'
        : '<div style="margin:3px 0;font-size:12px">Нулевой этаж (сам сектор) → <span style="color:var(--muted)">нет ключа</span>' +
          '<button class="btn" data-bindzero="1" style="margin-left:6px;padding:2px 8px;font-size:10px">Привязать ключик</button></div>') +
      lift.floors.map((fl, fi) => {
        const bt = fl.entityId != null ? mapData.things.find(x => x.id === fl.entityId) : null;
        return '<div style="margin:3px 0;font-size:12px">Этаж <b>' + (fl.name || fi + 1) + '</b>' +
          (bt ? ' → <span style="color:#ffd166">вызывалка «' + thingLabelById(fl.entityId) + '»</span>'
             : ' → <span style="color:var(--muted)">нет вызывалки</span>') +
          '<button class="btn" data-bindfloor="' + fi + '" style="margin-left:6px;padding:2px 8px;font-size:10px">' +
          (bt ? 'Перепривязать' : 'Привязать вызывалку') + '</button>' +
          (bt ? '<button class="btn" data-unbindfloor="' + fi + '" style="margin-left:2px;padding:2px 6px;font-size:10px;color:var(--danger)">Отвязать</button>' : '') +
          '<button class="btn danger" data-delfloor="' + fi + '" title="Удалить этаж" style="margin-left:4px;padding:2px 8px;font-size:10px">✕</button>' +
          '</div>';
      }).join('') +
      '<button class="btn" id="ctmLiftAddFloor" style="margin-top:8px;width:100%">+ Добавить этаж</button>' +
      '<button class="btn danger" id="ctmLiftToSector" style="margin-top:6px;width:100%">Превратить в обычный сектор</button>' +
      '</div>';
  } else if (k === "floor") {
    const lf = liftFloorByKey(ref); if (!lf) return;
    const f = lf.L.floors[lf.fi];
    const span = 'Этаж ' + (f.name || (lf.fi + 1)) + ' — лифт LIF' + lf.L.id;
    const boundThing = f.entityId != null ? mapData.things.find(x => x.id === f.entityId) : null;
    title = span;
    html = '<div class="ctmbox">' +
      '<div class="row"><label>Имя</label><input type="text" id="ctmFloorName" maxlength="3" value="' + (f.name || "") + '"></div>' +
      '<div class="row"><label>Позиция</label><input type="text" disabled value="' + ((f.x||0) + ' ; ' + (f.y||0)) + '"></div>' +
      '<div class="muted">Вызывалка: ' + (boundThing
        ? '«' + thingLabelById(f.entityId) + '»'
        : '<i>не привязана</i>') + '</div>' +
      '<div class="muted">В игре использование этой вызывалки поднимет лифт на данный этаж.</div>' +
      '<button class="btn" id="ctmFloorBind" style="margin-top:8px;width:100%">' + (boundThing
        ? 'Перепривязать вызывалку'
        : 'Связать с вызывалкой') + '</button>' +
      (boundThing ? '<button class="btn" id="ctmFloorUnbind" style="margin-top:4px;width:100%">Отвязать вызывалку</button>' : '') +
      '</div>';
  }
  const inGroup = multiSel.some(m => m.kind === k && m.id === ref) && multiSel.length > 1;
  if (inGroup) title = "Группа: " + title + " + ещё " + (multiSel.length - 1) + " (применится ко всем)";
  else if (multiSel.length > 1) {
    // ПКМ по объекту вне группы — пока единичный
  }
  t.textContent = title;
  b.innerHTML = html;
  // Мгновенное применение: любое изменение поля/переключателя сразу применяется.
  // Первый ввод с момента открытия меню создаёт шаг истории, остальные — в тот же шаг.
  ctxEditPending = false;
  if (k === "line") {
    const lnkTex = document.getElementById("ctmLex");
    if (lnkTex) lnkTex.addEventListener("input", applyCtxImmediate);
    const lnkTy = document.getElementById("ctmLtype");
    if (lnkTy) lnkTy.addEventListener("change", applyCtxImmediate);
  } else if (k === "sector") {
    const sf = document.getElementById("ctmFloor");
    if (sf) sf.addEventListener("input", applyCtxImmediate);
    const sw = document.getElementById("ctmWall");
    if (sw) sw.addEventListener("input", applyCtxImmediate);
    const sh = document.getElementById("ctmHeight");
    if (sh) sh.addEventListener("input", applyCtxImmediate);
    const st = document.getElementById("ctmStone");
    if (st) st.addEventListener("change", applyCtxImmediate);
    const fr = document.getElementById("ctmFragile");
    if (fr) fr.addEventListener("change", applyCtxImmediate);
  } else if (k === "thing") {
    const tl2 = document.getElementById("ctmTletter");
    if (tl2) tl2.addEventListener("change", applyCtxImmediate);
    const tn3 = document.getElementById("ctmTnum");
    if (tn3) {
      tn3.addEventListener("change", applyCtxImmediate);
      tn3.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.target.blur(); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); stepCtxThing(+1); }
        if (e.key === "ArrowDown") { e.preventDefault(); stepCtxThing(-1); }
      });
    }
    const tu = document.getElementById("ctmTnumUp");
    if (tu) tu.addEventListener("click", () => stepCtxThing(+1));
    const td = document.getElementById("ctmTnumDown");
    if (td) td.addEventListener("click", () => stepCtxThing(-1));
    const tn2 = document.getElementById("ctmTname");
    if (tn2) tn2.addEventListener("input", applyCtxImmediate);
  } else if (k === "trigger") {
    const ti = document.getElementById("ctmTrigID");
    if (ti) ti.addEventListener("input", applyCtxImmediate);
    const tt3 = document.getElementById("ctmTrigTicks");
    if (tt3) tt3.addEventListener("input", applyCtxImmediate);
  } else if (k === "lift") {
    const lc = document.getElementById("ctmLiftCurve");
    if (lc) lc.addEventListener("change", applyCtxImmediate);
    const ls = document.getElementById("ctmLiftSec");
    if (ls) ls.addEventListener("input", applyCtxImmediate);
  }
  if (k === "lift") {
    redrawLiftDiagram();
    const cv2 = document.getElementById("ctmLiftCurve");
    const sec2 = document.getElementById("ctmLiftSec");
    if (cv2) cv2.addEventListener("change", redrawLiftDiagram);
    if (sec2) sec2.addEventListener("input", redrawLiftDiagram);
    const addFloor = document.getElementById("ctmLiftAddFloor");
    if (addFloor) addFloor.addEventListener("click", () => {
      histPush();
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      const last = lift2.floors[lift2.floors.length-1];
      const step = liftFloorStep(lift2.sectorId);
      lift2.floors.push({ name: String(lift2.floors.length + 1), x: snapGrid(last.x||0), y: snapGrid((last.y||0) - step) });
      selLiftFloor = lift2.floors.length-1;
      selLift = lift2.sectorId;
      selectTarget = "sector";
      log("Лифт LIF" + lift2.id + ": добавлен этаж " + lift2.floors[selLiftFloor].name + " (через ПКМ-меню)");
      updateLiftPanel();
      multiSel = [];
      sel.floor = "L" + lift2.id + "@" + selLiftFloor;
      closeCtx();
      draw(); saveMap();
    });
    // привязка ключика к нулевому этажу (из меню лифта)
    document.querySelectorAll("[data-bindzero]").forEach(el => el.addEventListener("click", () => {
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      pendingFloorBind = { liftId: lift2.id, floorIndex: -1 };
      closeCtx();
      hudText = "Кликни по ключику, чтобы привязать его к нулевому этажу (сектору) лифта LIF" + lift2.id;
      updateCursor();
      updateHud();
    }));
    document.querySelectorAll("[data-unbindzero]").forEach(el => el.addEventListener("click", () => {
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      histPush();
      delete lift2.zeroEntityId;
      delete lift2.zeroEntityType;
      updateLiftPanel();
      log("Нулевой этаж LIF" + lift2.id + ": ключик отвязан");
      renderCtx();
      draw(); saveMap();
    }));
    document.querySelectorAll("[data-bindfloor]").forEach(el => el.addEventListener("click", () => {
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      const fi = parseInt(el.getAttribute("data-bindfloor"), 10);
      pendingFloorBind = { liftId: lift2.id, floorIndex: fi };
      closeCtx();
      hudText = "Кликни по вызывалке (терминалу), чтобы привязать этаж «" + (lift2.floors[fi].name || (fi + 1)) + "»";
      updateCursor();
      updateHud();
    }));
    document.querySelectorAll("[data-delfloor]").forEach(el => el.addEventListener("click", () => {
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      const fi = parseInt(el.getAttribute("data-delfloor"), 10);
      if (!lift2.floors[fi]) return;
      const key = "L" + lift2.id + "@" + fi;
      histPush();
      const nm = lift2.floors[fi].name || (fi + 1);
      lift2.floors.splice(fi, 1);
      multiSel = multiSel.filter(m => !(m.kind === "floor" && m.id === key));
      if (selLift === lift2.sectorId && selLiftFloor >= lift2.floors.length) selLiftFloor = lift2.floors.length - 1;
      if (sel.floor === key) sel.floor = null;
      if (pendingFloorBind && pendingFloorBind.liftId === lift2.id && pendingFloorBind.floorIndex === fi) pendingFloorBind = null;
      updateLiftPanel();
      log("Удалён этаж " + nm + " лифта LIF" + lift2.id);
      renderCtx();
      draw(); saveMap();
    }));
    document.querySelectorAll("[data-unbindfloor]").forEach(el => el.addEventListener("click", () => {
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      const fi = parseInt(el.getAttribute("data-unbindfloor"), 10);
      if (!lift2.floors[fi]) return;
      histPush();
      delete lift2.floors[fi].entityId;
      delete lift2.floors[fi].entityType;
      updateLiftPanel();
      log("Этаж " + (lift2.floors[fi].name || (fi + 1)) + " LIF" + lift2.id + ": вызывалка отвязана");
      renderCtx();
      draw(); saveMap();
    }));
    const toSectorBtn = document.getElementById("ctmLiftToSector");
    if (toSectorBtn) toSectorBtn.addEventListener("click", () => {
      const lift2 = mapData.lifts.find(L => L.sectorId === ctxTarget.ref);
      if (!lift2) return;
      histPush();
      mapData.lifts = mapData.lifts.filter(L => L.sectorId !== lift2.sectorId);
      if (selLift === lift2.sectorId) selLift = null;
      if (pendingFloorBind && pendingFloorBind.liftId === lift2.id) pendingFloorBind = null;
      multiSel = multiSel.filter(m => !(m.kind === "floor" && m.id.indexOf("L" + lift2.id + "@") === 0));
      if (sel.floor && sel.floor.indexOf("L" + lift2.id + "@") === 0) sel.floor = null;
      updateLiftPanel();
      log("Лифт LIF" + lift2.id + " превращён в обычный сектор S" + lift2.sectorId);
      closeCtx();
      draw(); saveMap();
    });
  }
  if (k === "line") {
    const discBtn = document.getElementById("ctmLDisconnect");
    if (discBtn) discBtn.addEventListener("click", () => {
      const l = getLineById(ctxTarget.ref); if (!l) return;
      histPush();
      unlinkLineConnects(l.id);
      closeCtx();
      draw(); saveMap();
    });
  }
  if (k === "floor") {
    const nameInp = document.getElementById("ctmFloorName");
    if (nameInp) nameInp.addEventListener("input", () => {
      const lf = liftFloorByKey(ctxTarget.ref);
      if (!lf) return;
      if (!ctxEditPending) { ctxEditPending = true; histPush(); }
      lf.L.floors[lf.fi].name = nameInp.value.slice(0, 3);
      updateLiftPanel();
      draw();
      saveMap();
    });
    const bindBtn = document.getElementById("ctmFloorBind");
    if (bindBtn) bindBtn.addEventListener("click", () => {
      const lf = liftFloorByKey(ctxTarget.ref);
      if (!lf) return;
      pendingFloorBind = { liftId: lf.L.id, floorIndex: lf.fi };
      closeCtx();
      hudText = "Кликни по вызывалке (терминалу), чтобы привязать этаж «" + (lf.L.floors[lf.fi].name || (lf.fi + 1)) + "»";
      updateCursor();
      updateHud();
    });
    const unbindBtn = document.getElementById("ctmFloorUnbind");
    if (unbindBtn) unbindBtn.addEventListener("click", () => {
      const lf = liftFloorByKey(ctxTarget.ref);
      if (!lf) return;
      histPush();
      delete lf.L.floors[lf.fi].entityId;
      delete lf.L.floors[lf.fi].entityType;
      updateLiftPanel();
      log("Этаж " + (lf.L.floors[lf.fi].name || (lf.fi + 1)) + " LIF" + lf.L.id + ": вызывалка отвязана");
      closeCtx();
      draw();
      saveMap();
    });
    const gotoLift = document.getElementById("ctmFloorGotoLift");
    if (gotoLift) gotoLift.addEventListener("click", () => {
      const lf = liftFloorByKey(ctxTarget.ref);
      if (!lf) return;
      ctxTarget = { kind: "lift", ref: lf.L.sectorId };
      renderCtx();
    });
  }
}

function redrawLiftDiagram() {
  const cv = document.getElementById("ctmLiftDiag");
  if (!cv) return;
  const x = cv.getContext("2d");
  const W2 = cv.width, H2 = cv.height;
  x.clearRect(0, 0, W2, H2);
  x.strokeStyle = "#2b2f3a"; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, H2 - 10); x.lineTo(W2, H2 - 10); x.moveTo(0, 10); x.lineTo(W2, 10); x.stroke();
  const mode = document.getElementById("ctmLiftCurve") ? document.getElementById("ctmLiftCurve").value : "sin";
  const n = 90;
  x.strokeStyle = "#7ad9a0"; x.lineWidth = 2; x.beginPath();
  for (let i = 0; i <= n; i++) {
    const tt = i / n;
    let y;
    if (mode === "lin") y = tt;
    else if (mode === "cus") y = tt * tt * (3 - 2 * tt);
    else y = 0.5 - 0.5 * Math.cos(tt * Math.PI);
    const px = tt * W2, py = H2 - 10 - y * (H2 - 20);
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
}

// Камень и хрупкая коробка взаимоисключающие: включение одного снимает другое
function toggleSolid(cb, isStone) {
  const other = document.getElementById(isStone ? "ctmFragile" : "ctmStone");
  if (cb.checked && other) other.checked = false;
}

// применить текущие значения полей контекстного меню к цели/группе (без закрытия меню)
function applyCtxFields() {
  const k = ctxTarget.kind, ref = ctxTarget.ref;
  // Если объект входит в множественное выделение — применяем свойства ко всей группе
  const inGroup = multiSel.some(m => m.kind === k && m.id === ref);
  const group = inGroup && multiSel.length > 1
    ? multiSel.filter(m => m.kind === k)
    : [{ kind: k, id: ref }];

  if (k === "line") {
    const texv = document.getElementById("ctmLex").value.trim();
    const ty = document.getElementById("ctmLtype").value;
    for (const m of group) {
      const l = getLineById(m.id); if (!l) continue;
      l.tex = texv || l.tex;
      l.free = false; l.step = false;
      if (ty === "free") { l.free = true; if (l.flags === "2") unlinkLineConnects(l.id); }
      else if (ty === "portal") {
        // Линии сектора лифта нельзя связывать: даже явный выбор «Портал» даст свободный проход
        if (isLiftLine(l.id)) { l.free = true; hudText = "Линия лифта: связывать нельзя — установлен свободный проход"; }
        else l.flags = "2";
      }
      else if (ty === "step") {
        if (isLiftLine(l.id)) { l.free = true; hudText = "Линия лифта: стык запрещён — установлен свободный проход"; }
        else { l.step = true; l.flags = "0"; }
        unlinkLineConnects(l.id);
      }
      else { if (l.flags === "2") unlinkLineConnects(l.id); l.flags = "0"; }
    }
    const l0 = getLineById(ref);
    log("Свойства линий (" + group.length + " шт): тип " + ty + ", текстура " + (texv || (l0 ? l0.tex : "")));
  } else if (k === "sector") {
    const fv = document.getElementById("ctmFloor").value.trim() || "floor_01";
    const wv = document.getElementById("ctmWall").value.trim() || "wall_01";
    const hv = parseFloat(document.getElementById("ctmHeight").value) || 128;
    const sv = document.getElementById("ctmStone") ? document.getElementById("ctmStone").checked : false;
    const fv2 = document.getElementById("ctmFragile") ? document.getElementById("ctmFragile").checked : false;
    for (const m of group) {
      const s = getSector(m.id); if (!s) continue;
      s.floorTex = fv; s.wallTex = wv; s.height = hv;
      s.stone = sv;
      s.fragile = fv2 && !sv; // нельзя одновременно камень и деревянный ящик
    }
    const mods = [sv ? "камень" : "", fv2 && !sv ? "хрупкая коробка" : ""].filter(Boolean).join("+");
    log("Свойства секторов (" + group.length + " шт) применены" + (mods ? " — " + mods : ""));
  } else if (k === "thing") {
    const nv = vlsSanitize(document.getElementById("ctmTname").value);
    const single = group.length === 1;
    let finalCode = null, codeChanged = false, nameChanged = false;
    for (const m of group) {
      const th = mapData.things.find(x => x.id === m.id); if (!th) continue;
      const nameBefore = th.name || "";
      // код — только для одиночного (у группы коды обязаны различаться)
      if (single) {
        const lEl = document.getElementById("ctmTletter"), nEl = document.getElementById("ctmTnum");
        if (lEl && nEl) {
          const r = previewThingCode(th, lEl.value, nEl.value);
          if (!r.ok) {
            toast(r.msg);
            renderCtx();
            log("Существо «" + th.id + "»: код не принят — " + r.msg);
            return;
          }
          if (!r.same) { applyThingCode(th, r.code); codeChanged = true; }
        }
      }
      // имя — только если пользователь его реально поменял (иначе затёрли бы автоимя от смены кода)
      if (nv && nv !== nameBefore && nv !== th.name) { th.name = nv; nameChanged = true; }
      finalCode = th.id;
    }
    // код мог смениться — обновить цель меню и перерисовать его
    if (finalCode != null && finalCode !== ref) {
      ctxTarget.ref = finalCode;
      renderCtx();
    }
    updateThingPanel();
    updateChecks();
    if (codeChanged || nameChanged) log("Существо «" + finalCode + "» обновлено" + (codeChanged ? " (код)" : "") + (nameChanged ? " (имя)" : ""));
  } else if (k === "trigger") {
    const tr = mapData.triggers.find(x => x.id === ref); if (!tr) return;
    tr.tid = document.getElementById("ctmTrigID").value.trim() || tr.tid;
    tr.ticks = parseInt(document.getElementById("ctmTrigTicks").value) || 5;
    log("Триггер '" + tr.tid + "' (#" + tr.id + "): тики " + tr.ticks);
  } else if (k === "lift") {
    const lift = mapData.lifts.find(L => L.sectorId === ref); if (!lift) return;
    lift.curve = document.getElementById("ctmLiftCurve").value;
    lift.sec = parseFloat(document.getElementById("ctmLiftSec").value) || 3;
    log("Лифт (сектор S" + ref + "): кривая " + lift.curve + ", sec " + lift.sec);
  }
}

// Мгновенное применение: вызывается на каждое изменение поля/переключателя.
// Первое изменение с момента открытия меню создаёт шаг истории, остальные пишут в тот же шаг.
function applyCtxImmediate() {
  if (!ctxEditPending) { ctxEditPending = true; histPush(); }
  applyCtxFields();
  updateChecks(); draw();
  saveMap();
}

function deleteCtx() {
  histPush();
  const k = ctxTarget.kind, ref = ctxTarget.ref;
  if (k === "vertex") {
    const used = mapData.lines.some(l => l.a === ref || l.b === ref);
    if (used) { hudText = "Точка используется линиями, сперва удали линии"; updateHud(); return; }
    mapData.vertices = mapData.vertices.filter(v => v.id !== ref);
    log("Удалена точка V" + ref);
  } else if (k === "line") {
    mapData.lines = mapData.lines.filter(l => l.id !== ref);
    mapData.connects = mapData.connects.filter(c => c.lineId !== ref && c.line2Id !== ref);
    pruneOrphans();
    log("Удалена линия L" + ref);
  } else if (k === "sector") {
    mapData.sectors = mapData.sectors.filter(s => s.id !== ref);
    mapData.things = mapData.things.filter(t => t.sectorId !== ref);
    mapData.lifts = (mapData.lifts || []).filter(L => L.sectorId !== ref);
    if (selLift === ref) selLift = null;
    if (pendingFloorBind && pendingFloorBind.liftId === ref) pendingFloorBind = null;
    updateLiftPanel();
    log("Удалён сектор S" + ref + " и его существа/лифт (линии остались)");
  } else if (k === "thing") {
    mapData.things = mapData.things.filter(t => t.id !== ref);
    // при удалении существа — стереть его привязки к этажам лифтов
    for (const L of (mapData.lifts || [])) {
      for (const f of L.floors) {
        if (f.entityId === ref) { delete f.entityId; delete f.entityType; }
      }
    }
    updateThingPanel();
    if (pendingFloorBind) pendingFloorBind = null;
    log("Удалено существо «" + ref + "»");
  } else if (k === "trigger") {
    mapData.triggers = mapData.triggers.filter(t => t.id !== ref);
    if (sel.trigger === ref) { sel.trigger = null; sel.triggerCorner = null; }
    updateTriggerPanel();
    log("Удалён триггер '" + ref + "'");
  } else if (k === "lift") {
    mapData.lifts = mapData.lifts.filter(L => L.sectorId !== ref);
    if (selLift === ref) selLift = null;
    if (pendingFloorBind && pendingFloorBind.liftId === ref) pendingFloorBind = null;
    updateLiftPanel();
    log("Удалён лифт (сектор S" + ref + ")");
  } else if (k === "floor") {
    const lf = liftFloorByKey(ref);
    if (lf) {
      const L = lf.L;
      const nm = L.floors[lf.fi].name || (lf.fi + 1);
      L.floors.splice(lf.fi, 1);
      multiSel = multiSel.filter(m => !(m.kind === "floor" && m.id === ref));
      if (selLift === L.sectorId && selLiftFloor >= L.floors.length) selLiftFloor = L.floors.length - 1;
      if (sel.floor === ref) sel.floor = null;
      if (pendingFloorBind && pendingFloorBind.liftId === L.id && pendingFloorBind.floorIndex === lf.fi) pendingFloorBind = null;
      updateLiftPanel();
      log("Удалён этаж " + nm + " лифта LIF" + L.id);
    }
  }
  closeCtx();
  bindTargetThing = null;
  updateCursor();
  updateChecks(); draw();
  saveMap();
}

function closeCtx() {
  const m = document.getElementById("ctm");
  if (m) m.style.display = "none";
  ctxTarget = null;
}

// Клик/ПКМ вне контекстного меню — закрыть его сразу (кнопку жать не нужно)
let closeCtxNextRMB = false; // этот жест ПКМ = «закрыть», новое меню не открывать
document.addEventListener("mousedown", e => {
  const m = document.getElementById("ctm");
  const wasOpen = m && m.style.display === "block";
  if (wasOpen && !m.contains(e.target)) {
    closeCtx();
    if (e.button === 2) closeCtxNextRMB = true;
  } else {
    closeCtxNextRMB = false;
  }
});
document.getElementById("ctmDelete").onclick = deleteCtx;
document.getElementById("ctmClose").onclick = closeCtx;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

