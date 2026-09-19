"use strict";
// VLS editor - js/core.js: core: coords, map data, editor state, canvas
// ================= COORDINATE SYSTEM =================
// 1 cell = GRID_SIZE units per side
const GRID_SIZE = 40;

// Центрация: привязка любого движения к полуклеткам сетки (20 юнитов; Shift = точное движение без привязки)
const MOVE_STEP = GRID_SIZE / 2;
function snapGrid(v) { return Math.round(v / MOVE_STEP) * MOVE_STEP; }
function dragStep() { return shiftHeld ? 1 : MOVE_STEP; }
// квантованная дельта перетаскивания от точки захвата
function snapDelta(cur, start) {
  const st = dragStep();
  return Math.round((cur - start) / st) * st;
}

// ================= DATA =================
let mapData = {
  name: "map01",
  version: "VLS.1",
  vertices: [],   // {id, x, y}
  lines: [],      // {id, a, b, tex, flags(0 wall /1 portal)}
  sectors: [],    // {id, verts:[], floorTex, wallTex, height, flags, neighbors:[], offset:{x,y}, stone, fragile}
  connects: [],   // {id, lineId, fromSector, toSector}
  things: [],     // {id, type, x, y, slot, sectorId} — always bound to a sector
lifts: [],    // {id, sectorId, floors:[{name,x,y}]} — floors[] только реальные этажи; нулевой этаж = сам сектор, его ключик — zeroEntityId/zeroEntityType
  triggers: [],   // {id, tid, type, ticks, x1, y1, x2, y2}
  _idc: 1
};

// ================= EDITOR STATE =================
let tool = "point";
let cam = { x: 0, y: 0, zoom: 1 };
let dragging = false;
let lastMouse = { x: 0, y: 0 };
let sel = { vertex: null, line: null, sector: null, thing: null, trigger: null, triggerCorner: null, floor: null };
let multiSel = [];  // несколько выделенных объектов: [{kind:'line'|'sector'|'thing'|'vertex'|'floor', id}]
let selLift = null;          // текущий выбранный лифт (id), работает с инструментом "lift"
let selLiftFloor = 0;        // номер выбранного этажа лифта
let pendingFloorBind = null; // { liftId, floorIndex } — режим привязки этажа к существу
let selVertices = [];      // для line: a -> b
let preview = null;        // mouse world pos
let pendingConnect = null; // line id waiting for second click
let hoverLine = null;      // line id currently under cursor (для подсветки при наведении)
let hoverVertex = null;    // vertex id currently under cursor (для подсветки)
let pendingSector = null;  // reserved
let hudText = "";
let warnings = [];

// История (Ctrl+Z / Ctrl+Y) — снапшоты mapData (JSON-копии)
let undoStack = [];
let redoStack = [];
let histPending = null;      // снапшот начала жеста (для сравнения «до/после»)
const HIST_LIMIT = 100;
// Буфер обмена (Ctrl+C / Ctrl+V)
let clipboard = null;        // {verts, lines, sectors, things, triggers, lifts, minX, minY}

// Журнал действий: дублируется в консоль браузера и в панель «Журнал».
// Пользователь может скопировать его из консоли (F12) или посмотреть прямо в редакторе.
function log(msg) {
  const ts = new Date().toTimeString().split(" ")[0];
  console.log("[VLS] " + ts + " " + msg);
  const el = document.getElementById("logList");
  if (el) {
    const div = document.createElement("div");
    div.className = "logrow";
    div.textContent = ts + " " + msg;
    el.appendChild(div);
    while (el.childElementCount > 200) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
}

// --- selection-marquee (ПКМ, как на рабочем столе) ---
let rightDrag = false;
let rectSel = null;        // {sx,sy,ex,ey} world coords while dragging

// --- select tool sub-target ---
let selectTarget = "vertex";   // vertex | line | sector

// --- preset box tool state ---
let boxAnchor = null;          // {x,y} where drag started
let boxSmooth = false;         // smooth (chamfered) corners?
let leftBoxDrag = false;       // currently dragging a box sector
let trigAnchor = null;         // {x,y} trigger drag start
let leftTrigDrag = false;      // currently dragging a trigger rect
let selDrag = null;            // {kind:'trigger'|'floor', ...} drag-move/resize в select
let leftBtnDown = false;       // ЛКМ сейчас зажата
let shiftHeld = false;
let tildeHeld = false;         // клавиша ~ (ё) — зажата: ПКМ удаляет (как раньше)
let animT = 0;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let W = canvas.width, H = canvas.height;
let dpr = 1;

// ================= CANVAS SIZING =================
function resize() {
  dpr = window.devicePixelRatio || 1;
  const rect = document.getElementById("viewport").getBoundingClientRect();
  W = rect.width; H = rect.height;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  draw();
}
window.addEventListener("resize", resize);
resize();

// ================= COORDS =================
function screenToWorld(sx, sy) {
  return {
    x: (sx - W/2) / cam.zoom + cam.x,
    y: (sy - H/2) / cam.zoom + cam.y
  };
}
function worldToScreen(wx, wy) {
  return {
    x: (wx - cam.x) * cam.zoom + W/2,
    y: (wy - cam.y) * cam.zoom + H/2
  };
}

