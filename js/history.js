"use strict";
// VLS editor - js/history.js: undo/redo history
// ================= HISTORY (Ctrl+Z / Ctrl+Y) =================
function cloneMap() { return JSON.parse(JSON.stringify(mapData)); }

// Запоминаем снапшот начала жеста (ЛКМ/ПКМ): один жест = один шаг отмены
function histBegin() {
  if (histPending == null) histPending = cloneMap();
}
// Завершение жеста: если состояние реально изменилось — кладём «до» в undo
function histCommit() {
  if (histPending == null) return;
  const before = histPending;
  histPending = null;
  if (before.vertices.length !== mapData.vertices.length ||
      before.lines.length !== mapData.lines.length ||
      before.sectors.length !== mapData.sectors.length ||
      before.things.length !== mapData.things.length ||
      before.triggers.length !== mapData.triggers.length ||
      (before.lifts||[]).length !== (mapData.lifts||[]).length ||
      JSON.stringify(before) !== JSON.stringify(mapData)) {
    undoStack.push(before);
    if (undoStack.length > HIST_LIMIT) undoStack.shift();
    redoStack = [];
  }
}
// Явный шаг истории (клавиатура, кнопки): вызвать до изменения mapData
function histPush() {
  histPending = null;
  undoStack.push(cloneMap());
  if (undoStack.length > HIST_LIMIT) undoStack.shift();
  redoStack = [];
}
function histReset() { undoStack = []; redoStack = []; histPending = null; }

function afterRestore() {
  // после undo/redo — сбросить выделение и перерисовать всё
  sel = { vertex: null, line: null, sector: null, thing: null, trigger: null, triggerCorner: null, floor: null };
  multiSel = [];
  selLift = null; selLiftFloor = 0; selVertices = [];
  pendingConnect = null; pendingSector = null; pendingFloorBind = null; bindTargetThing = null;
  selDrag = null; leftBtnDown = false; leftBoxDrag = false; leftTrigDrag = false;
  updateThingPanel(); updateTriggerPanel(); updateLiftPanel();
  updateChecks(); updateHud(); draw(); saveMap();
}
function undo() {
  if (!undoStack.length) { toast("Нечего отменять"); return; }
  redoStack.push(cloneMap());
  if (redoStack.length > HIST_LIMIT) redoStack.shift();
  mapData = undoStack.pop();
  afterRestore();
  log("Отменено (Ctrl+Z). Осталось шагов: " + undoStack.length);
}
function redo() {
  if (!redoStack.length) { toast("Нечего повторять"); return; }
  undoStack.push(cloneMap());
  if (undoStack.length > HIST_LIMIT) undoStack.shift();
  mapData = redoStack.pop();
  afterRestore();
  log("Повторено (Ctrl+Y). Осталось шагов: " + redoStack.length);
}

