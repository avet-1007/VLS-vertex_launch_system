"use strict";
// VLS editor - js/checks.js: map validation
// ================= CHECKS / HERMETIC =================
function updateChecks() {
  warnings = [];
  const groups = getLineGroups();
  let closedOk = true;
  groups.forEach(g => {
    if (!isClosed(g)) {
      closedOk = false;
      warnings.push("⚠ Незамкнутая группа линий (не герметична): " + g.map(l=>l.a+"-"+l.b).join(", "));
    }
  });
  // every sector must be closed
  mapData.sectors.forEach(s => {
    const poly = s.verts.map(id => getV(id)).filter(Boolean);
    if (poly.length < 3 || !poly.every(v => v)) {
      warnings.push("⚠ Сектор #"+s.id+" не герметичен (вершины не найдены)");
    }
  });
  // обязательный игрок A000 (точка появления; legacy: ID 1 / "Player 01")
  const hasPlayer = mapData.things.some(isPlayerThing);
  if (!hasPlayer) {
    warnings.push("⚠ Нет игрока A000 — при экспорте в файл добавится наблюдатель A000 в (0,0)");
  }
  // битые ID существ: неверный формат или дубли (чинится кнопкой ✕ — аннулирование)
  const seenCodes = new Map();
  mapData.things.forEach((t, ti) => {
    const code = String(t.id == null ? "" : t.id).toUpperCase();
    const bad = !isValidThingId(t.id) || seenCodes.has(code);
    if (!seenCodes.has(code)) seenCodes.set(code, ti);
    if (bad) {
      warnings.push("⚠ Существо повреждено: ID «" + escHtml(t.id) + "» — нажми ✕ чтобы аннулировать <button class=\"wfix\" data-fixthing=\"" + ti + "\" title=\"Аннулировать: оставить позицию, сбросить код\">✕</button>");
    }
  });
  // unconnected sector edges
  // (each sector should have its lines either neighbor a sector or be a portal)
  const w = document.getElementById("warnings");
  if (warnings.length) {
    w.className = "show";
    w.innerHTML = warnings.join("\n");
  } else {
    // проблем нет — бокс не показываем вообще
    w.className = "";
    w.innerHTML = "";
  }
}

// Кнопки ✕ в боксе предупреждений: аннулировать существо с битым ID
document.getElementById("warnings").addEventListener("click", e => {
  const b = e.target.closest ? e.target.closest("[data-fixthing]") : null;
  if (!b) return;
  const t = mapData.things[+b.getAttribute("data-fixthing")];
  if (!t) return;
  histPush();
  if (resetThingCode(t)) {
    sel.thing = t.id;
    updateThingPanel(); updateLiftPanel(); updateChecks(); draw(); saveMap();
  }
});

