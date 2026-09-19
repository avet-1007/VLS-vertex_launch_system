"use strict";
// VLS editor - js/things.js: things: A/B/C codes, panel, sector attach
// ================= THINGS =================
// Существа всегда привязаны к сектору (sectorId). Точка хранения абсолютная,
// но движение сектора двигает и его существ, чтобы они оставались на своих местах.
// ID существа — код «буква+3 цифры»: A000 — игрок, A001+ — техника (вызывалки, ключи),
// B — подбираемое (оружие/боеприпасы), C — враги/NPC.

// Разобрать код существа: "A001", "A 001", "b12", "C000" → {letter,num,code} или null
// (пробелы внутри игнорируются, цифр — максимум 3)
function parseThingCode(s) {
  const m = String(s == null ? "" : s).trim().toUpperCase().replace(/\s+/g, "").match(/^([ABC])([0-9]{1,3})$/);
  if (!m) return null;
  const num = m[2].padStart(3, "0");
  return { letter: m[1], num, code: m[1] + num };
}
function isValidThingId(id) { return parseThingCode(id) != null; }
// Первый свободный код категории (A000 никогда не выдаём автоматически — только руками)
function nextThingId(prefix) {
  prefix = "ABC".indexOf(prefix) >= 0 ? prefix : "A";
  const used = new Set();
  for (const t of mapData.things) {
    const p = parseThingCode(t.id);
    if (p && p.letter === prefix) used.add(p.code);
  }
  for (let n = (prefix === "A" ? 1 : 0); n <= 999; n++) {
    const c = prefix + String(n).padStart(3, "0");
    if (!used.has(c)) return c;
  }
  return null;
}
// Экранирование для вставки ID в HTML
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Аннулировать существо с битым ID: координаты остаются, ID+имя → как при первом создании
function resetThingCode(t) {
  if (!t) return false;
  const oldId = t.id;
  const nid = nextThingId("A");
  if (!nid) { toast("Нет свободных кодов A000–A999"); return false; }
  t.id = nid;
  t.name = nid;
  for (const m of multiSel) if (m.kind === "thing" && m.id === oldId) m.id = nid;
  for (const L of (mapData.lifts || [])) {
    for (const f of L.floors) if (f.entityId === oldId) { delete f.entityId; delete f.entityType; }
    if (L.zeroEntityId === oldId) { delete L.zeroEntityId; delete L.zeroEntityType; }
  }
  log("Существо аннулировано: ID «" + oldId + "» → «" + nid + "» (позиция " + t.x + ";" + t.y + " сохранена)");
  return true;
}
function tryPlaceThing(wx, wy) {
  const catEl = document.getElementById("toolThingCat");
  const numEl = document.getElementById("toolThingNum");
  const letter = (catEl && "ABC".indexOf(catEl.value) >= 0) ? catEl.value : "A";
  const typed = numEl ? numEl.value.trim() : "";
  // если номер вбит руками — берём точный код (цифры «5» → буква+005, полный «B012» → как есть);
  // иначе следующий свободный. previewThingCode сверяет занятость с картой сам.
  let code = null;
  if (typed) {
    const r = previewThingCode({ id: null }, letter, typed);
    if (r.ok) code = r.code;
    else toast(r.msg + " — выдан следующий свободный");
  }
  if (!code) code = nextThingId(letter);
  if (!code) {
    hudText = "Нет свободных кодов категории " + letter;
    log("Размещение существа: свободные коды " + letter + "000–" + letter + "999 закончились");
    return null;
  }
  const sector = pickSectorAt(wx, wy);
  if (!sector) {
    hudText = "Существо можно разместить только внутри сектора";
    log("Существо '" + code + "': размещение вне сектора запрещено (" + Math.round(wx) + ";" + Math.round(wy) + ")");
    return null;
  }
  const thing = {
    id: code,
    type: code,
    name: code,
    x: Math.round(wx),
    y: Math.round(wy),
    slot: 1,
    sectorId: sector.id
  };
  mapData.things.push(thing);
  // продвинуть номер в тулбаре на следующий свободный — серийная расстановка без дублей
  if (numEl) {
    const nxt = nextThingId(letter);
    numEl.value = nxt ? nxt.slice(1) : "";
  }
  hudText = "Существо '" + code + "' размещено в секторе S" + sector.id;
  log("Существо '" + code + "' размещено в секторе S" + sector.id + " в (" + thing.x + ";" + thing.y + ")");
  return thing;
}

// Привязка существ к секторам: для вещей без sectorId находим сектор по координатам
function attachThingsToSectors() {
  for (const t of mapData.things) {
    if (t.sectorId == null) {
      const s = pickSectorAt(t.x, t.y);
      if (s) t.sectorId = s.id;
    }
  }
}

// Есть ли на карте «точка появления игрока»: код A000; legacy — ID 1 / "1" / "01" / "Player 01" и т.п.
function isPlayerThing(t) {
  if (!t) return false;
  if (String(t.id == null ? "" : t.id).trim().toUpperCase() === "A000") return true;
  if (t.id === 1 || t.id === "1") return true;
  const norm = s => String(s || "").trim().replace(/^0+(?=\d)/, "").replace(/\s+/g, "").toLowerCase();
  const type = norm(t.type), name = norm(t.name);
  return type === "1" || type === "player" || type === "player1" || type === "player01" ||
         name === "1" || name === "player" || name === "player1" || name === "player01";
}

// Подсветка панели существ при выборе ромбика
function updateThingPanel() {
  const t = sel.thing != null ? mapData.things.find(th => th.id === sel.thing) : null;
  const panel = document.getElementById("thingPanel");
  const empty = document.getElementById("thingEmpty");
  const fields = document.getElementById("thingFields");
  if (t) {
    panel.classList.add("on");
    empty.style.display = "none";
    fields.style.display = "block";
    syncThingCodeInputs(t);
    document.getElementById("thingName").value = t.name || "";
  } else {
    panel.classList.remove("on");
    empty.style.display = "block";
    fields.style.display = "none";
  }
}

// Залить поля кода (буква+номер) из существа; битый ID — подсветить и показать кнопку аннулирования
function syncThingCodeInputs(t) {
  const letterEl = document.getElementById("thingLetter");
  const numEl = document.getElementById("thingNum");
  const badRow = document.getElementById("thingCorrupt");
  const p = parseThingCode(t.id);
  if (p) {
    letterEl.value = p.letter;
    numEl.value = p.num;
    numEl.classList.remove("bad");
    if (badRow) badRow.style.display = "none";
  } else {
    letterEl.value = "A";
    numEl.value = String(t.id == null ? "" : t.id).slice(0, 3);
    numEl.classList.add("bad");
    if (badRow) {
      badRow.style.display = "block";
      document.getElementById("thingCorruptId").textContent = String(t.id == null ? "—" : t.id);
    }
  }
}

// Проверить код из буквы + сырого ввода БЕЗ изменений.
// Сырой ввод — либо 1–3 цифры («5» → буква+005), либо полный код целиком («B012», буква из селекта игнорируется).
// Возвращает {ok, code, msg}.
function previewThingCode(t, letter, numRaw) {
  numRaw = String(numRaw == null ? "" : numRaw).trim().replace(/\s+/g, "");
  let code = null;
  if (/^[0-9]{1,3}$/.test(numRaw) && "ABC".indexOf(letter) >= 0) {
    code = letter + numRaw.padStart(3, "0");
  } else {
    const p = parseThingCode(numRaw);
    if (p) code = p.code;
  }
  if (!code) return { ok: false, msg: "Код: буква A/B/C и 3 цифры (можно с пробелом: «A 001»)" };
  if (code === String(t.id).toUpperCase()) return { ok: true, code, same: true };
  if (mapData.things.some(x => x !== t && String(x.id).toUpperCase() === code))
    return { ok: false, msg: "Код " + code + " уже занят" };
  return { ok: true, code };
}

// Применить проверенный код (историю пишет вызывающий — ДО вызова)
function applyThingCode(t, code) {
  const old = t.id;
  t.id = code;
  if (sel.thing === old) sel.thing = code;
  for (const m of multiSel) if (m.kind === "thing" && m.id === old) m.id = code;
  if (!t.name || String(t.name).toUpperCase() === String(old).toUpperCase()) t.name = code;
  remapThingRefs(old, code);
  toast("Код «" + old + "» → «" + code + "»");
  log("Существо: код «" + old + "» → «" + code + "»");
}

// Перевесить все привязки лифтов со старого кода на новый
function remapThingRefs(fromId, toId) {
  for (const L of (mapData.lifts || [])) {
    for (const f of L.floors) if (f.entityId === fromId) f.entityId = toId;
    if (L.zeroEntityId === fromId) L.zeroEntityId = toId;
  }
}

// Шаг кода СУЩЕСТВУЮЩЕГО существа кнопками ▲▼ / стрелками ↑↓: ровно ±1.
// Если код занят — обмен с владельцем (оба остаются уникальными, привязки едут следом).
// Историю пишет сама (один шаг), панели/меню обновляет сама.
function stepThingCode(t, dir, numEl, letterEl) {
  if (!t) return;
  const norm = s => String(s).toUpperCase();
  const raw = numEl ? String(numEl.value == null ? "" : numEl.value).trim().replace(/\s+/g, "") : "";
  let letter = (letterEl && "ABC".indexOf(letterEl.value) >= 0) ? letterEl.value : null;
  let n = null;
  if (/^[0-9]{1,3}$/.test(raw) && letter) n = parseInt(raw, 10);
  else {
    const p = parseThingCode(raw);
    if (p) { n = parseInt(p.num, 10); letter = p.letter; if (letterEl) letterEl.value = letter; }
  }
  if ((n == null || isNaN(n) || !letter)) {
    const p0 = parseThingCode(t.id);
    if (!p0) { toast("Код существа повреждён — аннулируй его через ✕"); return; }
    letter = p0.letter; if (letterEl) letterEl.value = letter;
    n = parseInt(p0.num, 10);
  }
  n += dir;
  if (n < 0 || n > 999) { toast("Дальше кодов " + letter + " нет (000–999)"); return; }
  const cand = letter + String(n).padStart(3, "0");
  if (norm(t.id) === cand) return;
  const oldT = t.id;
  const holder = mapData.things.find(x => x !== t && norm(x.id) === cand);
  histPush();
  if (holder) {
    const oldH = holder.id;
    remapThingRefs(oldT, cand);
    remapThingRefs(oldH, oldT);
    if (!t.name || norm(t.name) === norm(oldT)) t.name = cand;
    if (!holder.name || norm(holder.name) === norm(oldH)) holder.name = oldT;
    t.id = cand;
    holder.id = oldT;
    if (sel.thing === oldT) sel.thing = cand;
    if (sel.thing === oldH) sel.thing = oldT;
    for (const m of multiSel) {
      if (m.kind !== "thing") continue;
      if (m.id === oldT) m.id = cand;
      else if (m.id === oldH) m.id = oldT;
    }
    if (ctxTarget && ctxTarget.kind === "thing") {
      if (ctxTarget.ref === oldT) ctxTarget.ref = cand;
      else if (ctxTarget.ref === oldH) ctxTarget.ref = oldT;
    }
    toast("Код " + oldT + " → " + cand + " (обмен с «" + (holder.name || oldH) + "»)");
    log("Существо: код «" + oldT + "» → «" + cand + "» обменом с «" + oldH + "» (теперь «" + oldT + "»)");
  } else {
    applyThingCode(t, cand);
    if (ctxTarget && ctxTarget.kind === "thing" && ctxTarget.ref === oldT) ctxTarget.ref = cand;
  }
  if (numEl) numEl.value = String(n).padStart(3, "0");
  updateThingPanel(); updateLiftPanel(); updateChecks(); draw(); saveMap();
  const ctm = document.getElementById("ctm");
  if (ctm && ctm.style.display !== "none") renderCtx();
}

// Шаг номера-пресета для НОВОГО существа (тулбар): ровно ±1, занятые не трогаем —
// постановка сама разрулит дубликат автономером
function stepCodeNumber(numEl, letterEl, dir, commit) {
  if (!numEl) return;
  const raw = String(numEl.value == null ? "" : numEl.value).trim().replace(/\s+/g, "");
  let letter = (letterEl && "ABC".indexOf(letterEl.value) >= 0) ? letterEl.value : "A";
  let n = null;
  if (/^[0-9]{1,3}$/.test(raw)) n = parseInt(raw, 10);
  else {
    const p = parseThingCode(raw);
    if (p) { n = parseInt(p.num, 10); letter = p.letter; if (letterEl) letterEl.value = letter; }
  }
  if (n == null || isNaN(n)) n = dir > 0 ? -1 : 1000;
  n += dir;
  if (n < 0 || n > 999) { toast("Дальше кодов " + letter + " нет (000–999)"); return; }
  const cand = letter + String(n).padStart(3, "0");
  const holder = mapData.things.find(x => String(x.id).toUpperCase() === cand);
  if (holder) { toast("Код " + cand + " уже занят («" + (holder.name || holder.id) + "»)"); return; }
  numEl.value = String(n).padStart(3, "0");
  if (commit) commit();
}

// Применить код из полей левой панели
function commitThingCode() {
  if (sel.thing == null) return;
  const t = mapData.things.find(th => th.id === sel.thing);
  if (!t) return;
  const r = previewThingCode(t, document.getElementById("thingLetter").value, document.getElementById("thingNum").value);
  if (!r.ok) {
    toast(r.msg);
    syncThingCodeInputs(t);
    return;
  }
  if (!r.same) { histPush(); applyThingCode(t, r.code); }
  updateThingPanel(); updateLiftPanel(); updateChecks(); draw(); saveMap();
}

