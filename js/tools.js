"use strict";
// VLS editor - js/tools.js: tools, toasts, cancel, hotkeys
// ================= TOOLS =================
const toolBtns = document.querySelectorAll(".tool[data-tool]");
const actionBtns = document.querySelectorAll(".tool[data-action]");
toolBtns.forEach(t => {
  t.addEventListener("click", () => setTool(t.dataset.tool));
});
actionBtns.forEach(t => {
  t.addEventListener("click", () => runAction(t.dataset.action));
});

// Инструменты, которым пока нет функционала — только блокировка
const DEAD_TOOLS = { settings: "Настройки", texpick: "Выбор текстур" };

let prevBoxTool = "point";   // во что вернуться после разового использования бокса

function setTool(t) {
  if (DEAD_TOOLS[t]) { toast(DEAD_TOOLS[t] + " пока не работает"); return; }

  // Выделение как переключатель с парой: повторный клик возвращает прошлый гео-инструмент
  if (t === "select") {
    if (tool === "select") {
      const back = { vertex:"point", line:"line", sector:"sector", thing:"thing", trigger:"trigger" }[selectTarget] || "point";
      setTool(back);
    } else {
      if (tool === "thing") selectTarget = "thing";
      else if (tool === "point") selectTarget = "vertex";
      else if (tool === "line") selectTarget = "line";
      else if (tool === "sector" || tool === "box" || tool === "boxsmooth") selectTarget = "sector";
      else if (tool === "trigger") selectTarget = "trigger";
      setToolRaw("select");
    }
    draw();
    return;
  }

  // В режиме выделения клик по точке/линии/сектору/существу/триггеру просто меняет цель (комбо-пара)
  if (tool === "select" && (t === "point" || t === "line" || t === "sector" || t === "thing" || t === "trigger")) {
    selectTarget = { point:"vertex", line:"line", sector:"sector", thing:"thing", trigger:"trigger" }[t];
    updateToolVisual();
    updateHud();
    return;
  }

  // Бокс/гладкие — разовые: запоминаем инструмент, чтобы вернуться после использования
  if (t === "box" || t === "boxsmooth") prevBoxTool = tool === "select" ? "point" : tool;

  setToolRaw(t);
}

function setToolRaw(t) {
  tool = t;
  toolBtns.forEach(el => el.classList.toggle("active", el.dataset.tool === t));
  if (t !== "line") selVertices = [];
  if (t !== "connect") pendingConnect = null;
  if (t !== "sector") pendingSector = null;
  hoverLine = null; hoverVertex = null;
  boxAnchor = null;
  rightDrag = false; rectSel = null;
  if (t === "point") selectTarget = "vertex";
  else if (t === "line") selectTarget = "line";
  else if (t === "sector" || t === "box" || t === "boxsmooth") selectTarget = "sector";
  else if (t === "thing") selectTarget = "thing";
  else if (t === "trigger") selectTarget = "trigger";
  updateCursor();
  updateToolVisual();
  updateHud();
}

// Показывает пару: при активном выделении подсвечивает и гео-кнопку под цель
function updateToolVisual() {
  toolBtns.forEach(el => {
    const isActive = el.dataset.tool === tool || (tool === "select" && ({vertex:"point",line:"line",sector:"sector",thing:"thing",trigger:"trigger"}[selectTarget]) === el.dataset.tool);
    el.classList.toggle("active", isActive);
  });
}

// Действия верхней панели (загрузка/выгрузка карты)
function runAction(a) {
  if (a === "loadmap") document.getElementById("fileInput").click();
  else if (a === "exportmap") exportMap();
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = ""; }, 2000);
}
document.addEventListener("keydown", e => {
  if (e.key === "Shift") shiftHeld = true;
  if (e.code === "Backquote") tildeHeld = true;
  const c = e.code;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
  // Ctrl+Z / Ctrl+Y / Ctrl+C / Ctrl+V / Ctrl+A (по физической клавише — работает в любой раскладке)
  if (e.ctrlKey || e.metaKey) {
    if (c === "KeyZ" && e.shiftKey) { e.preventDefault(); redo(); return; }
    if (c === "KeyZ") { e.preventDefault(); undo(); return; }
    if (c === "KeyY") { e.preventDefault(); redo(); return; }
    if (c === "KeyC") { e.preventDefault(); copySelection(); return; }
    if (c === "KeyV") { e.preventDefault(); pasteSelection(); return; }
    if (c === "KeyA") { e.preventDefault(); selectAll(); return; }
  }
  if (c === "KeyP") setTool("point");
  else if (c === "KeyL") setTool("line");
  else if (c === "KeyS") setTool("sector");
  else if (c === "KeyC") setTool("connect");
  else if (c === "KeyT") setTool("thing");
  else if (c === "KeyV") setTool("select");
  else if (c === "KeyB") setTool("box");
  else if (c === "KeyG") setTool("boxsmooth");
  else if (c === "KeyE") setTool("lift");
  else if (c === "Delete" || c === "Backspace") { if (selItems().length) { histPush(); deleteSelection(); } updateThingPanel(); updateHud(); updateChecks(); draw(); saveMap(); }
  else if (c === "Escape") { closeCtx(); cancelOperation(); }
  else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    let dx = 0, dy = 0;
    if (e.key === "ArrowUp") dy = -1;
    if (e.key === "ArrowDown") dy = 1;
    if (e.key === "ArrowLeft") dx = -1;
    if (e.key === "ArrowRight") dx = 1;
    const step = dragStep();
    if (tool === "lift") {
      if (selLift != null) { histPush(); moveLiftFloor(dx*step, dy*step); }
    } else {
      if (selItems().length) { histPush(); moveSelection(dx*step, dy*step); }
    }
    updateHud();
    updateChecks();
    draw();
    saveMap();
  }
});
document.addEventListener("keyup", e => {
  if (e.key === "Shift") shiftHeld = false;
  if (e.code === "Backquote") tildeHeld = false;
});

function cancelOperation() {
  selVertices = []; pendingConnect = null; pendingSector = null; pendingFloorBind = null;
  bindTargetThing = null;
  setTool("point");
  updateHud();
}

