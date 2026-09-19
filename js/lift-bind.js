"use strict";
// VLS editor - js/lift-bind.js: floor-to-thing binding, lift panel
// ================= ПРИВЯЗКА ЭТАЖА К СУЩЕСТВУ =================
let bindTargetThing = null; // id существа под курсором в режиме привязки

// радиус «промаха» при выборе существа для привязки: не меньше ~24px на экране
function bindPickRadius() { return Math.max(16, 24 / cam.zoom); }

// название существа по id: редакторное имя, иначе тип, иначе сам код
function thingLabelById(id) {
  if (id == null) return "";
  const t = mapData.things.find(x => x.id === id);
  return t ? (t.name || t.type || t.id) : "";
}

// якорь этажа лифта в мировых координатах: fi=-1 — центр сектора, иначе d·floor-позиция
function liftFloorAnchor(L, fi) {
  const s = getSector(L.sectorId);
  if (!s) return null;
  const poly = s.verts.map(id => getV(id)).filter(Boolean);
  if (poly.length < 3) return null;
  if (fi < 0) {
    return { x: poly.reduce((a,v)=>a+(v.x||0),0)/poly.length, y: poly.reduce((a,v)=>a+(v.y||0),0)/poly.length };
  }
  const f = (L.floors||[])[fi];
  if (!f) return null;
  return { x: f.x||0, y: f.y||0 };
}

// курсор холста: режим привязки — копирующий «перетащить»; с целью — целый крест
function updateCursor() {
  if (pendingFloorBind) {
    canvas.style.cursor = bindTargetThing != null ? "crosshair" : "copy";
  } else {
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
  }
}

// действующее существо под курсором (с запасом на промах)
function pickBindThing(wx, wy) {
  const br = bindPickRadius();
  let best = null;
  for (const t of mapData.things) {
    const d = Math.hypot(t.x - wx, t.y - wy);
    if (d < br && (!best || d < best.d)) best = t;
  }
  return best;
}

// линия-стрелка привязки: этаж ⇢ существо (жёлтая, пунктир + наконечник)
function drawBindArrow(fx, fy, tx, ty, color) {
  const a = worldToScreen(fx, fy), b = worldToScreen(tx, ty);
  ctx.strokeStyle = color;
  ctx.lineWidth = gs(2);
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const len = gs(11);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - len*Math.cos(ang-0.42), b.y - len*Math.sin(ang-0.42));
  ctx.lineTo(b.x - len*Math.cos(ang+0.42), b.y - len*Math.sin(ang+0.42));
  ctx.closePath();
  ctx.fill();
}

// подсветка цели привязки прямо на холсте в drawPreview
function drawBindPreview() {
  if (!pendingFloorBind) return;
  const lift = (mapData.lifts || []).find(L => L.id === pendingFloorBind.liftId);
  const anc = lift ? liftFloorAnchor(lift, pendingFloorBind.floorIndex) : null;
  // обвести привязываемый этаж/сектор
  if (anc) {
    const sc = worldToScreen(anc.x, anc.y);
    ctx.strokeStyle = "#7ad9a0";
    ctx.lineWidth = gs(2);
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(sc.x, sc.y, gs(16), 0, 6.283); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(122,217,160,0.15)";
    ctx.beginPath(); ctx.arc(sc.x, sc.y, gs(16), 0, 6.283); ctx.fill();
    ctx.fillStyle = "#7ad9a0";
    ctx.font = (gs(10)) + "px Consolas";
    ctx.textAlign = "center";
    ctx.fillText("CLICK to pair →", sc.x, sc.y - gs(20));
    ctx.textAlign = "left";
  }
  const bt = bindTargetThing != null ? mapData.things.find(x => x.id === bindTargetThing) : null;
  if (!bt) return;
  if (anc) drawBindArrow(anc.x, anc.y, bt.x, bt.y, "rgba(122,217,160,0.95)");
  const sw = worldToScreen(bt.x, bt.y);
  ctx.strokeStyle = "#7ad9a0";
  ctx.lineWidth = gs(3);
  ctx.beginPath(); ctx.arc(sw.x, sw.y, gs(15), 0, 6.283); ctx.stroke();
  ctx.fillStyle = "rgba(122,217,160,0.2)";
  ctx.beginPath(); ctx.arc(sw.x, sw.y, gs(15), 0, 6.283); ctx.fill();
}

function updateLiftPanel() {
  const lift = mapData.lifts.find(L => L.sectorId === selLift);
  const box = document.getElementById("liftFloorList");
  if (!box) return;
  if (!lift) {
    box.innerHTML = '<div class="muted">Кликни инструментом «Лифт» по сектору</div>';
    return;
  }
  let html = '<div class="muted">Этажи: нулевой — сам сектор лифта (стрелки/клик — выбрать этаж, имя — до 3 символов):</div>';
  // нулевой этаж — это сам сектор лифта, отдельной точкой не хранится
  const zeroThing = lift.zeroEntityId != null ? mapData.things.find(t => t.id === lift.zeroEntityId) : null;
  html += '<div class="liftfloor zero' + (selLiftFloor === -1 ? ' act' : '') + '" data-fi="-1" title="Нулевой этаж — это сам сектор лифта">' +
    '<b>Нулевой этаж</b> (сам сектор S' + lift.sectorId + ')' +
    (zeroThing ? ' <span class="idx">ключ: ' + thingLabelById(lift.zeroEntityId) + '</span>' : '') +
    (zeroThing
      ? '<button class="lb" data-zunbind="1" title="Отвязать ключик" style="color:var(--danger)">✂</button>'
      : '<button class="lb" data-zbind="1" title="Привязать ключик (опускает лифт на нулевой этаж)">⊕</button>') +
    '</div>';
  lift.floors.forEach((floor, fi) => {
    const nm = (floor.name||(fi+1)) || (fi+1);
    const entTag = floor.entityId != null ? ' <span class="idx">↦ ' + thingLabelById(floor.entityId) + '</span>' : '';
    const bindTag = floor.entityId != null
      ? '<button class="lb" data-unbind="' + fi + '" title="Отвязать вызывалку" style="color:var(--danger)">✂</button>'
      : '<button class="lb" data-bind="' + fi + '" title="Привязать вызывалку (терминал)">⊕</button>';
    html += '<div class="liftfloor' + (selLiftFloor===fi?' act':'') + '" data-fi="' + fi + '">' +
      'Этаж ' +
      '<input class="lfname" maxlength="3" value="' + nm + '" data-fi="' + fi + '" title="Название этажа (до 3 символов)"> · (' + (floor.x||0) + ',' + (floor.y||0) + ')' + entTag + bindTag +
      '<button class="lb" data-del="' + fi + '">✕</button>' + '</div>';
  });
  html += '<div class="liftbtns"><button class="btn" id="liftAddFloor">+ Этаж</button></div>';
  box.innerHTML = html;
  box.querySelectorAll('.liftfloor').forEach(el => {
    const nmInp = el.querySelector(".lfname");
    if (nmInp) {
      nmInp.addEventListener("focus", () => histPush());
      nmInp.addEventListener("input", () => {
        const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
        if (!lift2) return;
        const f = lift2.floors[+el.dataset.fi];
        if (f) { f.name = nmInp.value.slice(0,3); draw(); saveMap(); }
      });
    }
    el.addEventListener("click", ev => {
      if (ev.target.dataset.zunbind !== undefined) {
        histPush();
        const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
        if (!lift2) return;
        delete lift2.zeroEntityId;
        delete lift2.zeroEntityType;
        log("Нулевой этаж LIF" + lift2.id + ": ключик отвязан");
        if (pendingFloorBind && pendingFloorBind.liftId === lift2.id && pendingFloorBind.floorIndex === -1) { pendingFloorBind = null; bindTargetThing = null; updateCursor(); }
        updateLiftPanel(); draw(); saveMap();
        return;
      }
      if (ev.target.dataset.zbind !== undefined) {
        const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
        if (!lift2) return;
        pendingFloorBind = { liftId: lift2.id, floorIndex: -1 };
        hudText = "Кликни по ключику, чтобы привязать его к нулевому этажу сектора «S" + lift2.sectorId + "»";
        updateCursor();
        updateHud();
        return;
      }
      if (ev.target.dataset.unbind !== undefined) {
        histPush();
        const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
        if (!lift2) return;
        const u = +ev.target.dataset.unbind;
        if (!lift2.floors[u]) return;
        delete lift2.floors[u].entityId;
        delete lift2.floors[u].entityType;
        log("Этаж " + ((lift2.floors[u].name||(u+1))) + " LIF" + lift2.id + ": вызывалка отвязана");
        if (pendingFloorBind && pendingFloorBind.liftId === lift2.id && pendingFloorBind.floorIndex === u) { pendingFloorBind = null; bindTargetThing = null; updateCursor(); }
        updateLiftPanel(); draw(); saveMap();
        return;
      }
      if (ev.target.dataset.bind !== undefined) {
        const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
        if (!lift2) return;
        const fi = +ev.target.dataset.bind;
        pendingFloorBind = { liftId: lift2.id, floorIndex: fi };
        hudText = "Кликни по вызывалке (терминалу), чтобы привязать этаж «" + (lift2.floors[fi].name || (fi + 1)) + "»";
        updateCursor();
        updateHud();
        return;
      }
      if (ev.target.dataset.del !== undefined || ev.target.classList.contains("lfname")) {
        if (ev.target.dataset.del !== undefined) {
          histPush();
          const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
          if (!lift2) return;
          const d = +ev.target.dataset.del;
          if (lift2.floors.length) { lift2.floors.splice(d,1); if (selLiftFloor>=lift2.floors.length) selLiftFloor=lift2.floors.length-1; log("Лифт LIF" + lift2.id + ": этаж " + (d+1) + " удалён"); }
          updateLiftPanel(); hudText = "Этаж удалён"; draw(); saveMap(); return;
        }
        return;
      }
      selLiftFloor = +el.dataset.fi;
      updateLiftPanel(); draw();
    });
  });
  const add = document.getElementById("liftAddFloor");
  if (add) add.addEventListener("click", () => {
    histPush();
    const lift2 = mapData.lifts.find(L=>L.sectorId===selLift);
    if (!lift2) return;
    const last = lift2.floors[lift2.floors.length-1];
    const step = liftFloorStep(lift2.sectorId);
    lift2.floors.push({ name: String(lift2.floors.length + 1), x: snapGrid(last.x||0), y: snapGrid((last.y||0) - step) });
    selLiftFloor = lift2.floors.length-1;
    log("Лифт LIF" + lift2.id + ": добавлен этаж " + lift2.floors[selLiftFloor].name);
    updateLiftPanel(); draw(); saveMap();
  });
}

