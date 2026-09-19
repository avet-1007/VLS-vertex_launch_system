"use strict";
// VLS editor - js/storage.js: autosave, projects, .vls export
// ================= AUTOSAVE (localStorage) =================
// После перезапуска сайта нарисованное остаётся. Если сохранить не удалось
// (например, файловый режим/блокировка), перед перезагрузкой браузер спросит:
// «Хотите ли вы перезагрузить сайт?» — если да, всё, что нарисовано, удалится.
const AUTOSAVE_KEY = "vls_editor_autosave";
let persistOk = true;

function saveMap() {
  try {
    if (typeof localStorage === "undefined") { persistOk = false; return; }
    // вместе с картой сохраняем и камеру (позиция + зум)
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ data: mapData, view: { x: cam.x, y: cam.y, zoom: cam.zoom } }));
    persistOk = true;
  } catch (err) {
    persistOk = false;
  }
}
function restoreMap() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    let data = JSON.parse(raw);
    // новый формат: обёртка {data, view}; старый — сам mapData
    if (data && data.data && Array.isArray(data.data.vertices)) {
      const view = data.view || {};
      if (view.x != null && view.y != null) { cam.x = view.x; cam.y = view.y; }
      if (view.zoom != null) cam.zoom = Math.max(0.2, Math.min(10, view.zoom));
      data = data.data;
    }
    if (!data || !Array.isArray(data.vertices)) return false;
    mapData = data;
    if (!Array.isArray(mapData.lifts)) mapData.lifts = [];
    if (!Array.isArray(mapData.triggers)) mapData.triggers = [];
    if (!Array.isArray(mapData.connects)) mapData.connects = [];
    ensureIdc();
    normalizeLiftFloors();
    attachThingsToSectors();
    const strippedRestore = stripLiftConnects();
    if (strippedRestore) { const li = mapData.lifts.length; log("Загружено: связи линий лифтов заменены свободными проходами (" + strippedRestore + " связей, лифтов «" + li + "»)"); }
    histReset();
    return true;
  } catch (err) {
    persistOk = false;
    return false;
  }
}
// Нулевой этаж — это сам сектор лифта (не хранится в floors[]).
function normalizeLiftFloors() {
  for (const L of mapData.lifts || []) {
    if (!L.floors) L.floors = [];
    // миграция: если floors[0] — старый «нулевой этаж», вынести ключ на лифт и удалить
    if (L.floors.length && L.floors[0].name === "0") {
      if (!L.zeroEntityId && L.floors[0].entityId != null) { L.zeroEntityId = L.floors[0].entityId; L.zeroEntityType = L.floors[0].entityType; }
      L.floors.splice(0, 1);
    }
  }
}
// Перед перезагрузкой: если автосейв невозможен и есть что терять — спрашиваем.
window.addEventListener("beforeunload", e => {
  const hasData = mapData.vertices.length || mapData.lines.length || mapData.sectors.length || mapData.things.length || mapData.triggers.length;
  if (!persistOk && hasData) {
    e.preventDefault();
    e.returnValue = "Сохранить состояние невозможно — при перезагрузке всё, что вы нарисовали, будет удалено. Хотите ли вы перезагрузить сайт?";
  }
});

// ================= SAVE / LOAD PROJECT =================
function saveProject() {
  const view = { x: cam.x, y: cam.y, zoom: cam.zoom };
  mapData.__view = view;
  const data = JSON.stringify(mapData);
  delete mapData.__view;
  download(data, (mapData.name || "map") + ".vls", "text/plain");
}
// Пересчёт счётчика id: не ниже max+1 по всем коллекциям (существа не входят — у них коды A000).
function ensureIdc() {
  let mx = 1;
  const bump = v => { if (typeof v === "number" && v >= mx) mx = v + 1; };
  for (const v of mapData.vertices) bump(v.id);
  for (const l of mapData.lines) bump(l.id);
  for (const s of mapData.sectors) bump(s.id);
  for (const c of mapData.connects) bump(c.id);
  for (const tr of mapData.triggers) bump(tr.id);
  for (const L of mapData.lifts) bump(L.id);
  if ((mapData._idc || 1) <= mx) mapData._idc = mx;
}

// Общая пост-обработка загруженной карты (и для JSON-проекта, и для текстового .vls)
function applyLoadedProject(data, srcKind) {
  if (!data || !Array.isArray(data.vertices)) throw new Error("no data");
  mapData = data;
  if (!Array.isArray(mapData.lifts)) mapData.lifts = [];
  if (!Array.isArray(mapData.triggers)) mapData.triggers = [];
  if (!Array.isArray(mapData.connects)) mapData.connects = [];
  ensureIdc();
  normalizeLiftFloors();
  attachThingsToSectors();
  const strippedLoad = stripLiftConnects();
  if (strippedLoad) log("Загрузка: связи линий лифтов заменены свободными проходами (" + strippedLoad + " связей)");
  histReset();
  document.getElementById("mapName").value = mapData.name || "map01";
  updateThingPanel();
  updateLiftPanel();
  updateTriggerPanel();
  updateChecks(); draw(); refreshTexPreviews(); saveMap();
  hudText = srcKind + " загружен";
  updateHud();
  log("Загружен " + srcKind.toLowerCase() + " '" + (mapData.name || "(без имени)") + "': вершин " + mapData.vertices.length +
      ", линий " + mapData.lines.length +
      ", секторов " + mapData.sectors.length +
      ", связей " + mapData.connects.length +
      ", существ " + mapData.things.length +
      ", триггеров " + mapData.triggers.length +
      ", лифтов " + mapData.lifts.length);
}

// Парсер текстового формата .vls (тот самый, что пишет exportMap).
// Толерантен к пропущенным полям/комментариям. Возвращает mapData с idc-непрерывностью.
function parseVlsText(text) {
  const m = {
    name: "map01",
    version: "VLS.1",
    vertices: [], lines: [], sectors: [], connects: [], things: [], triggers: [], lifts: [],
    _idc: 1
  };
  let section = null, idcMax = 1;
  const bump = id => { if (typeof id === "number" && id >= idcMax) idcMax = id + 1; };
  const read = txt => String(txt).split(/\r?\n/);
  for (const raw of read(text)) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    const hdr = line.match(/^\[(\w+)\]$/);
    if (hdr) { section = hdr[1]; continue; }
    if (!section) {
      const kv = line.split("=", 2);
      if (kv.length === 2) {
        const k = kv[0].trim(), v = kv[1].trim();
        if (k === "name") m.name = v;
        else if (k === "version") m.version = v;
      }
      continue;
    }
    const parts = line.split(",");
    try {
      if (section === "vertices") {
        const id = +parts[0];
        m.vertices.push({ id, x: vlsNum(parts[1]), y: vlsNum(parts[2]) });
        bump(id);
      } else if (section === "lines") {
        const id = +parts[0];
        const ln = { id, a: +parts[1], b: +parts[2], tex: parts[3] || "wall_01", flags: parts[4] != null ? parts[4] : "0" };
        if (parts.indexOf("free") >= 0) ln.free = true;
        if (parts.indexOf("step") >= 0) ln.step = true;
        m.lines.push(ln);
        bump(id);
      } else if (section === "sectors") {
        const id = +parts[0];
        const s = {
          id, verts: [], floorTex: parts[2] || "floor_01", wallTex: parts[3] || "wall_01",
          height: +parts[4] || 128, flags: +parts[5] || 0,
          offset: { x: +(parts[6] || 0) || 0, y: +(parts[7] || 0) || 0 },
          stone: parts[8] === "1", fragile: parts[9] === "1",
          neighbors: []
        };
        const vs = parts[1];
        if (vs && vs.indexOf("v:") === 0) s.verts = vs.slice(2).split(":").map(n => +n);
        m.sectors.push(s);
        bump(id);
        const tik = parts[10];
        if (tik && tik.indexOf("things") === 0) {
          const body = tik.slice(6);
          if (body) for (const one of body.split(";")) {
            const f = one.split(":");
            const tid = (f[0] || "").trim();
            if (!tid) continue;
            m.things.push({
              id: tid, type: f[1] || "", x: vlsNum(f[2]), y: vlsNum(f[3]),
              slot: +(f[4] || 1) || 1, name: f[5] || "", sectorId: id
            });
          }
        }
      } else if (section === "connects") {
        const id = +parts[0];
        m.connects.push({ id, lineId: +parts[1], line2Id: +parts[2], fromSector: null, toSector: null });
        bump(id);
      } else if (section === "things") {
        const tid = (parts[0] || "").trim();
        if (!tid) continue;
        m.things.push({
          id: tid, type: parts[1] || "", name: parts[2] || "", x: vlsNum(parts[3]), y: vlsNum(parts[4]),
          slot: +(parts[5] || 1) || 1, sectorId: +(parts[6] || 0) || 0
        });
      } else if (section === "triggers") {
        const id = +parts[0];
        m.triggers.push({
          id, tid: parts[1] || "", type: parts[2] || "inner", ticks: +(parts[3] || 5) || 5,
          x1: vlsNum(parts[4]), y1: vlsNum(parts[5]), x2: vlsNum(parts[6]), y2: vlsNum(parts[7])
        });
        bump(id);
      } else if (section === "lifts") {
        const id = +parts[0];
        const L = { id, sectorId: +parts[1], curve: parts[2] || "sin", sec: +(parts[3] || 3) || 3, floors: [] };
        const zk = parts[4] || "";
        if (zk.indexOf("zero:") === 0) {
          const zf = zk.slice(5).split(":");
          if ((zf[0] || "").trim()) { L.zeroEntityId = zf[0].trim(); if (zf[1]) L.zeroEntityType = zf[1]; }
        }
        const floorStr = parts[5] || "";
        for (const one of floorStr.split("|")) {
          if (!one) continue;
          const f = one.split(":");
          const fl = { x: vlsNum(f[0]), y: vlsNum(f[1]), name: f[2] || "" };
          if (f[3] != null && (f[3] || "").trim() !== "") { fl.entityId = f[3].trim(); if (f[4] != null && f[4] !== "") fl.entityType = f[4]; }
          L.floors.push(fl);
        }
        m.lifts.push(L);
        bump(id);
      } else if (section === "summary") {
        const kv = line.split("=", 2);
        if (kv.length === 2 && kv[0].trim() === "idc") {
          const mx = +kv[1].trim();
          if (mx > idcMax) idcMax = mx;
        }
      }
    } catch (err) { /* пропустить битую строку */ }
  }
  // нормализация кодов существ к верхнему регистру (A001, а не a001) — до дедупа
  for (const t of m.things) { const p = parseThingCode(t.id); if (p) t.id = p.code; }
  for (const L of m.lifts) {
    if (L.zeroEntityId != null) { const p0 = parseThingCode(L.zeroEntityId); if (p0) L.zeroEntityId = p0.code; }
    for (const f of L.floors) if (f.entityId != null) { const p1 = parseThingCode(f.entityId); if (p1) f.entityId = p1.code; }
  }
  // дедуп существ: [things] перекрывает inline-секции (последний по секции выигрывает)
  const tbl = new Map();
  for (const t of m.things) tbl.set(t.id, t);
  m.things = Array.from(tbl.values());
  m._idc = Math.max(idcMax, 1);
  return m;
}

function applyLoadedMap(content) {
  const clean = content.replace(/^\ufeff/, "").trim();
  if (!clean) { alert("Пустой файл"); return; }
  if (clean.charAt(0) === "{") {
    const data = JSON.parse(clean);
    // камера проекта (если сохранена)
    if (data.__view) {
      const view = data.__view;
      if (view.x != null && view.y != null) { cam.x = view.x; cam.y = view.y; }
      if (view.zoom != null) cam.zoom = Math.max(0.2, Math.min(10, view.zoom));
      delete data.__view;
    }
    applyLoadedProject(data, "Проект");
  } else {
    applyLoadedProject(parseVlsText(clean), "Карта (.vls)");
  }
}

document.getElementById("fileInput").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { applyLoadedMap(reader.result); }
    catch (err) { alert("Ошибка загрузки: " + (err && err.message ? err.message : "неверный формат файла")); console.error(err); }
  };
  reader.readAsText(f);
  e.target.value = "";
};

// ================= EXPORT =================
// Очистка имени/строки от разделителей текстового формата .vls
function vlsSanitize(s) {
  return String(s == null ? "" : s).replace(/[\r\n\t,;:|]/g, " ").trim();
}
function vlsNum(v) { return v == null || isNaN(v) ? 0 : +v; }

function exportMap() {
  const name = vlsSanitize(document.getElementById("mapName").value.trim() || "map01");
  // Экспорт работает на снапшоте: живой mapData не трогаем (stripLiftConnects и т.п.
  // применились бы к рабочей сессии и «съели» бы связи лифтов).
  const liveMap = mapData;
  const snap = cloneMap();
  snap.name = name;
  mapData = snap;
  // страховка: связи линий лифтов в файл не пишем (только свободные проходы)
  stripLiftConnects();
  // игрок A000 обязателен в файле: если его нет — добавляем наблюдателя в (0,0) (только в экспорт)
  let observerAdded = false;
  if (!mapData.things.some(isPlayerThing)) {
    const sec0 = pickSectorAt(0, 0);
    mapData.things.push({ id: "A000", type: "Player", name: "Observer", x: 0, y: 0, slot: 1, sectorId: sec0 ? sec0.id : 0 });
    observerAdded = true;
    log("Игрок A000 не найден — в файл добавлен наблюдатель A000 в (0,0)");
  }
  let out = "";

  out += "// VLS MAP v1 (.vls)\n";
  out += "// Vertex Landscape System — экспорт редактора\n";
  out += "// txt-подобный текстовый формат с расширением .vls (движок читает по содержимому, не по расширению)\n\n";

  out += "name = " + name + "\n";
  out += "version = " + (mapData.version || "VLS.1") + "\n";
  out += "units_per_cell = " + GRID_SIZE + "\n\n";

  // VERTICES
  out += "[vertices]\n";
  out += "// id, x, y\n";
  mapData.vertices.forEach(v => { out += v.id + "," + vlsNum(v.x) + "," + vlsNum(v.y) + "\n"; });
  out += "\n";

  // LINES
  out += "[lines]\n";
  out += "// id, vertexA, vertexB, texture, flags\n";
  out += "// flags: 0 = стена (коллизия), 1 = стена сектора, 2 = портал/соединение (проходимая), free = свободный проход, step = стык лифта\n";
  mapData.lines.forEach(l => {
    let f = l.flags != null ? l.flags : "0";
    if (l.free) f += ",free";
    if (l.step) f += ",step";
    out += l.id + "," + l.a + "," + l.b + "," + (l.tex || "wall_01") + "," + f + "\n";
  });
  out += "\n";

  // SECTORS
  out += "[sectors]\n";
  out += "// id, vertices(v:id:id...), floor_tex, wall_tex, height, flags, offset_x, offset_y, stone, fragile, things(id:type:x:y:slot:name;...)\n";
  mapData.sectors.forEach(s => {
    const thingsInS = mapData.things.filter(t => t.sectorId === s.id);
    out += s.id + ",v:" + s.verts.join(":") + "," + (s.floorTex || "floor_01") + "," + (s.wallTex || "wall_01") + "," + (s.height || 128) + "," + (s.flags || 0) + "," + ((s.offset && s.offset.x) || 0) + "," + ((s.offset && s.offset.y) || 0) + "," + (s.stone ? "1" : "0") + "," + (s.fragile ? "1" : "0");
    if (thingsInS.length) {
      out += ",things" + thingsInS.map(t => t.id + ":" + vlsSanitize(t.type) + ":" + vlsNum(t.x) + ":" + vlsNum(t.y) + ":" + (t.slot || 1) + ":" + vlsSanitize(t.name)).join(";");
    }
    out += "\n";
  });
  out += "\n";

  // CONNECTS
  out += "[connects]\n";
  out += "// id, line_id, line2_id\t// две линии двух секторов, ведущие себя как один проход\n";
  mapData.connects.forEach(c => out += c.id + "," + c.lineId + "," + (c.line2Id != null ? c.line2Id : "") + "\n");
  out += "\n";

  // THINGS
  out += "[things]\n";
  out += "// id (код: A000 игрок, A-техника/вызывалки/ключи, B-подбираемое, C-враги/NPC), type, name, x, y, slot, sector_id\n";
  mapData.things.forEach(t => out += t.id + "," + vlsSanitize(t.type) + "," + vlsSanitize(t.name) + "," + vlsNum(t.x) + "," + vlsNum(t.y) + "," + (t.slot || 1) + "," + (t.sectorId || 0) + "\n");
  out += "\n";

  // TRIGGERS
  out += "[triggers]\n";
  out += "// id, tid, type, ticks, x1, y1, x2, y2\n";
  mapData.triggers.forEach(tr => {
    out += tr.id + "," + (tr.tid || "") + "," + (tr.type || "inner") + "," + (tr.ticks || 5) + "," + vlsNum(tr.x1) + "," + vlsNum(tr.y1) + "," + vlsNum(tr.x2) + "," + vlsNum(tr.y2) + "\n";
  });
  out += "\n";

  // LIFTS
  out += "[lifts]\n";
  out += "// id, sector_id, curve, sec, zeroKey[:entity_type]| floor(x:y:name[:caller_id[:caller_type]])\n";
  out += "// zero — ключик нулевого этажа (сам сектор): 'zero:<id>[:<type>]' или '-' если нет\n";
  mapData.lifts.forEach(L => {
    out += L.id + "," + L.sectorId + "," + (L.curve || "sin") + "," + (L.sec || 3) + ",";
    // нулевой этаж — это сам сектор; ключ, опускающий лифт на нулевой этаж, пишется в заголовке
    const zType = L.zeroEntityType != null
      ? L.zeroEntityType
      : ((mapData.things.find(x => x.id === L.zeroEntityId) || {}).type || "");
    out += (L.zeroEntityId != null ? "zero:" + L.zeroEntityId + ":" + vlsSanitize(zType) : "-") + ",";
    out += L.floors.map(f => {
      let fs = vlsNum(f.x) + ":" + vlsNum(f.y) + ":" + vlsSanitize(f.name || "");
      if (f.entityId != null) {
        const ct = f.entityType != null ? f.entityType : ((mapData.things.find(x => x.id === f.entityId) || {}).type || "");
        fs += ":" + f.entityId + ":" + vlsSanitize(ct);
      }
      return fs;
    }).join("|") + "\n";
  });
  out += "\n";

  // SUMMARY / help
  out += "[summary]\n";
  out += "vertices=" + mapData.vertices.length + "\n";
  out += "lines=" + mapData.lines.length + "\n";
  out += "sectors=" + mapData.sectors.length + "\n";
  out += "connects=" + mapData.connects.length + "\n";
  out += "things=" + mapData.things.length + "\n";
  out += "triggers=" + mapData.triggers.length + "\n";
  out += "lifts=" + mapData.lifts.length + "\n";
  out += "idc=" + mapData._idc + "\n";

  log("Экспорт карты '" + name + "': вершин " + mapData.vertices.length +
      ", линий " + mapData.lines.length +
      ", секторов " + mapData.sectors.length +
      ", связей " + mapData.connects.length +
      ", существ " + mapData.things.length +
      ", триггеров " + (mapData.triggers||[]).length +
      ", лифтов " + mapData.lifts.length);
  mapData = liveMap;
  download(out, name + ".vls", "text/plain");
  hudText = "Экспортировано в " + name + ".vls" + (observerAdded ? " (+наблюдатель A000)" : "");
  updateHud();
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

