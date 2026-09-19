"use strict";
// VLS editor - js/ui.js: toolbar buttons and sidebar fields
// ================= BUTTONS =================
document.getElementById("btnResetView").onclick = () => { cam.x=0;cam.y=0;cam.zoom=1;draw(); };
document.getElementById("btnChecks").onclick = updateChecks;
document.getElementById("btnWiki").onclick = () => toast("VLS Wiki — ссылка появится позже");
document.getElementById("btnPlaceThing").onclick = () => { if (sel.sector!=null){const s=getSector(sel.sector); const poly=s.verts.map(id=>getV(id)).filter(Boolean); if(poly.length){const cx=poly.reduce((a,v)=>a+v.x,0)/poly.length; const cy=poly.reduce((a,v)=>a+v.y,0)/poly.length; histPush(); const nt=tryPlaceThing(cx,cy); if (nt) { sel.thing=nt.id; multiSel=[{kind:"thing",id:nt.id}]; updateThingPanel(); } hudText="Существо размещено в центре сектора"; } draw(); saveMap(); } else hudText="Выбери сектор"; };
document.getElementById("btnClearThings").onclick = () => { if (mapData.things.length) { histPush(); } mapData.things=[]; sel.thing=null; updateThingPanel(); draw(); log("Все существа очищены"); saveMap(); };
document.getElementById("btnApplyTex").onclick = () => { histPush(); applyTexToSelection(); draw(); saveMap(); };
document.getElementById("btnClearLog").onclick = () => {
  const el = document.getElementById("logList");
  if (el) el.innerHTML = '<div class="muted">Журнал очищен</div>';
};

// ================= РЕЖИМЫ СОЕДИНЕНИЯ =================
function setConnectMode(mode) {
  connectMode = mode;
  document.querySelectorAll("#connectModes .mode").forEach(x => x.classList.toggle("active", x.dataset.mode === mode));
  const sel2 = document.getElementById("toolConnectSel");
  if (sel2 && sel2.value !== mode) sel2.value = mode;
  pendingConnect = null;
  updateHud();
}
document.querySelectorAll("#connectModes .mode").forEach(b => {
  b.addEventListener("click", () => setConnectMode(b.dataset.mode));
});
document.getElementById("toolConnectSel").addEventListener("change", (e) => setConnectMode(e.target.value));

// ================= ID СУЩЕСТВА: буква + три цифры (A000 игрок, A-техника, B-предметы, C-враги) =================
document.getElementById("toolThingCat").addEventListener("change", () => {
  const numEl = document.getElementById("toolThingNum");
  if (numEl && !numEl.value.trim()) {
    const nxt = nextThingId(document.getElementById("toolThingCat").value);
    if (nxt) numEl.value = nxt.slice(1);
  }
});
// Шаг кода выбранного существа (левая панель)
function stepSelectedThing(dir) {
  if (sel.thing == null) return;
  const t = mapData.things.find(th => th.id === sel.thing);
  if (!t) return;
  stepThingCode(t, dir, document.getElementById("thingNum"), document.getElementById("thingLetter"));
}
// Шаг кода существа в открытом ПКМ-меню (только одиночное)
function stepCtxThing(dir) {
  if (!ctxTarget || ctxTarget.kind !== "thing") return;
  const th = mapData.things.find(x => x.id === ctxTarget.ref);
  if (!th) return;
  stepThingCode(th, dir, document.getElementById("ctmTnum"), document.getElementById("ctmTletter"));
}
document.getElementById("thingLetter").addEventListener("change", commitThingCode);
document.getElementById("thingNum").addEventListener("change", commitThingCode);
document.getElementById("thingNum").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.target.blur(); return; }
  if (e.key === "ArrowUp") { e.preventDefault(); stepSelectedThing(+1); }
  if (e.key === "ArrowDown") { e.preventDefault(); stepSelectedThing(-1); }
});
document.getElementById("thingNumUp").addEventListener("click", () => stepSelectedThing(+1));
document.getElementById("thingNumDown").addEventListener("click", () => stepSelectedThing(-1));
document.getElementById("toolThingNumUp").addEventListener("click", () => stepCodeNumber(document.getElementById("toolThingNum"), document.getElementById("toolThingCat"), +1, null));
document.getElementById("toolThingNumDown").addEventListener("click", () => stepCodeNumber(document.getElementById("toolThingNum"), document.getElementById("toolThingCat"), -1, null));
document.getElementById("toolThingNum").addEventListener("keydown", e => {
  if (e.key === "ArrowUp") { e.preventDefault(); stepCodeNumber(e.target, document.getElementById("toolThingCat"), +1, null); }
  if (e.key === "ArrowDown") { e.preventDefault(); stepCodeNumber(e.target, document.getElementById("toolThingCat"), -1, null); }
});
document.getElementById("thingFixBtn").addEventListener("click", () => {
  if (sel.thing == null) return;
  const t = mapData.things.find(th => th.id === sel.thing);
  if (!t) return;
  histPush();
  if (resetThingCode(t)) {
    sel.thing = t.id;
    updateThingPanel(); updateLiftPanel(); updateChecks(); draw(); saveMap();
  }
});
document.getElementById("thingName").addEventListener("input", () => {
  if (sel.thing != null) {
    const t = mapData.things.find(th => th.id === sel.thing);
    if (t) { t.name = vlsSanitize(document.getElementById("thingName").value); draw(); saveMap(); }
  }
});

// ================= ТРИГГЕРЫ: ПОЛЯ ВЫБРАННОГО (сайдбар) =================
document.getElementById("triggerID").addEventListener("input", () => {
  if (sel.trigger != null) {
    const t = mapData.triggers.find(tr => tr.id === sel.trigger);
    if (t) { t.tid = document.getElementById("triggerID").value.trim(); draw(); saveMap(); }
  }
});
document.getElementById("triggerType").addEventListener("change", () => {
  if (sel.trigger != null) {
    const t = mapData.triggers.find(tr => tr.id === sel.trigger);
    if (t) { t.type = document.getElementById("triggerType").value; draw(); saveMap(); }
  }
});
document.getElementById("triggerTicks").addEventListener("input", () => {
  if (sel.trigger != null) {
    const t = mapData.triggers.find(tr => tr.id === sel.trigger);
    if (t) { t.ticks = parseInt(document.getElementById("triggerTicks").value) || 5; draw(); saveMap(); }
  }
});

// ================= ПРЕВЬЮ ТЕКСТУР =================
function texColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const pal = ["#7a5c3a","#5c7a4a","#7a5a74","#5a647a","#7a6b3a","#4a7a6b","#6b5a7a","#7a4a4a"];
  return pal[h % pal.length];
}
function drawTexPreview(cv, name) {
  const x = cv.getContext("2d");
  const base = texColor(name);
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      x.fillStyle = (r + c) % 2 ? base : shade(base, -22);
      x.fillRect(c, r, 1, 1);
    }
  }
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}
function refreshTexPreviews() {
  drawTexPreview(document.getElementById("prevFloor"), document.getElementById("floorTex").value);
  drawTexPreview(document.getElementById("prevWall"), document.getElementById("wallTex").value);
}
document.getElementById("floorTex").addEventListener("input", refreshTexPreviews);
document.getElementById("wallTex").addEventListener("input", refreshTexPreviews);

// ================= КРИВАЯ ЛИФТА =================
function drawCurve() {
  const cv = document.getElementById("curveCanvas");
  const x = cv.getContext("2d");
  const W2 = cv.width, H2 = cv.height;
  x.clearRect(0, 0, W2, H2);
  x.strokeStyle = "#2b2f3a";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(0, H2 - 14); x.lineTo(W2, H2 - 14);  // baseline / position 0
  x.moveTo(0, 14);      x.lineTo(W2, 14);       // position 1
  x.stroke();
  x.strokeStyle = "#4c7dd9";
  x.lineWidth = 2;
  x.beginPath();
  const mode = document.getElementById("curveType").value;
  const n = 80;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let y;
    if (mode === "lin") y = t;
    else if (mode === "cus") y = t * t * (3 - 2 * t);
    else y = 0.5 - 0.5 * Math.cos(t * Math.PI);  // sine: 0 -> 1
    const px = t * W2;
    const py = H2 - 14 - y * (H2 - 28);
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
}
document.getElementById("curveType").addEventListener("change", drawCurve);

