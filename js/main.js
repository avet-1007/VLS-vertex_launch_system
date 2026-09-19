"use strict";
// VLS editor - js/main.js: init
// ================= INIT =================
const restoredMap = restoreMap();
if (restoredMap) {
  document.getElementById("mapName").value = mapData.name || "map01";
  hudText = "Автосохранение восстановлено";
  log("Восстановлен автосохранённый проект: вершин " + mapData.vertices.length +
      ", линий " + mapData.lines.length +
      ", секторов " + mapData.sectors.length +
      ", существ " + mapData.things.length +
      ", триггеров " + (mapData.triggers||[]).length);
}
setTool("point");
refreshTexPreviews();
drawCurve();
updateThingPanel();
updateTriggerPanel();
updateLiftPanel();
updateHud();
updateChecks();
draw();

console.log("VLS editor build v5 — отвязка ключиков/вызывалок, снятие модификатора соединялки с линий, превращение лифта в обычный сектор");

