"use strict";

// ================= COORDINATE SYSTEM =================
// 1 cell = GRID_SIZE units per side
const GRID_SIZE = 40;

// ================= DATA =================
let mapData = {
  name: "map01",
  version: "VLS.1",
  vertices: [],   // {id, x, y}
  lines: [],      // {id, a, b, tex, flags(0 wall /1 portal)}
  sectors: [],    // {id, verts:[], floorTex, wallTex, height, flags, neighbors:[], offset:{x,y}}
  connects: [],   // {id, lineId, fromSector, toSector}
  things: [],     // {id, type, x, y, slot}
  _idc: 1
};

// ================= EDITOR STATE =================
let tool = "point";
let cam = { x: 0, y: 0, zoom: 1 };
let dragging = false;
let lastMouse = { x: 0, y: 0 };
let sel = { vertex: null, line: null, sector: null, thing: null };
let selVertices = [];      // для line: a -> b
let preview = null;        // mouse world pos
let pendingConnect = null; // line id waiting for second click
let pendingSector = null;  // reserved
let hudText = "";
let warnings = [];

// --- selection-marquee (ПКМ, как на рабочем столе) ---
let rightDrag = false;
let rectSel = null;        // {sx,sy,ex,ey} world coords while dragging

// --- select tool sub-target ---
let selectTarget = "vertex";   // vertex | line | sector

// --- preset box tool state ---
let boxAnchor = null;          // {x,y} where drag started
let boxSmooth = false;         // smooth (chamfered) corners?
let leftBoxDrag = false;       // currently dragging a box sector
let shiftHeld = false;

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

// ================= HELPERS =================
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Округление экранной координаты до целого пикселя (чтобы не было размытия/зума)
function px(v) { return Math.round(v); }

// Целая толщина линии в CSS-пикселях (минимум 1) — чёткая линия
function lw(v) { return Math.max(1, Math.round(v)); }

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}