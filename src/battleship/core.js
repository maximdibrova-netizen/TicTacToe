// ===== Морской бой: правила и бот =====
// Поле 10×10, клетка i = r*10 + c. Флот (классика): 1×4, 2×3, 3×2, 4×1.
// Корабли не касаются друг друга даже углами. Попал — стреляешь ещё; промах — ход соперника.
var BS_N = 10;
var BS_FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
var BS_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];

function bsCellName(i) { return BS_LETTERS[i % 10] + (((i / 10) | 0) + 1); }
function bsShipCells(r, c, len, vert) {
  var out = [];
  for (var k = 0; k < len; k++) {
    var rr = r + (vert ? k : 0), cc = c + (vert ? 0 : k);
    if (rr >= BS_N || cc >= BS_N) return null;
    out.push(rr * 10 + cc);
  }
  return out;
}
// occ: Int8Array(100), 1 = занято кораблём. Можно ли поставить корабль (с учётом «не касаться»)?
function bsCanPlace(occ, cells) {
  if (!cells) return false;
  for (var k = 0; k < cells.length; k++) {
    var r = (cells[k] / 10) | 0, c = cells[k] % 10;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= BS_N || cc >= BS_N) continue;
      if (occ[rr * 10 + cc]) return false;
    }
  }
  return true;
}
// случайная расстановка: массив кораблей [{cells:[...]}]
function bsRandomFleet() {
  for (var attempt = 0; attempt < 200; attempt++) {
    var occ = new Int8Array(100), ships = [], ok = true;
    for (var s = 0; s < BS_FLEET.length && ok; s++) {
      var len = BS_FLEET[s], placed = false;
      for (var t = 0; t < 300 && !placed; t++) {
        var vert = Math.random() < .5, r = Math.floor(Math.random() * BS_N), c = Math.floor(Math.random() * BS_N);
        var cells = bsShipCells(r, c, len, vert);
        if (bsCanPlace(occ, cells)) { cells.forEach(function (x) { occ[x] = 1; }); ships.push({ cells: cells }); placed = true; }
      }
      if (!placed) ok = false;
    }
    if (ok) return ships;
  }
  return null;
}
function bsFleetValid(ships) {
  if (!ships || ships.length !== BS_FLEET.length) return false;
  var lens = ships.map(function (s) { return s.cells.length; }).sort(function (a, b) { return b - a; });
  for (var k = 0; k < lens.length; k++) if (lens[k] !== BS_FLEET[k]) return false;
  var occ = new Int8Array(100);
  for (k = 0; k < ships.length; k++) { if (!bsCanPlace(occ, ships[k].cells)) return false; ships[k].cells.forEach(function (x) { occ[x] = 1; }); }
  return true;
}
// Ответ на выстрел по своему флоту. hits: Int8Array(100) уже попавших клеток (меняется).
// Возвращает { res: 'miss'|'hit'|'sunk', ship: [клетки] если потоплен, all: true если флот уничтожен }
function bsAnswer(ships, hits, i) {
  for (var s = 0; s < ships.length; s++) {
    if (ships[s].cells.indexOf(i) >= 0) {
      hits[i] = 1;
      var sunk = ships[s].cells.every(function (x) { return hits[x]; });
      if (!sunk) return { res: 'hit' };
      var all = ships.every(function (sh) { return sh.cells.every(function (x) { return hits[x]; }); });
      return { res: 'sunk', ship: ships[s].cells.slice(), all: all };
    }
  }
  return { res: 'miss' };
}
// клетки вокруг потопленного корабля (по правилам там кораблей нет)
function bsAround(cells) {
  var set = {}, out = [];
  cells.forEach(function (x) {
    var r = (x / 10) | 0, c = x % 10;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= BS_N || cc >= BS_N) continue;
      var j = rr * 10 + cc;
      if (cells.indexOf(j) < 0 && !set[j]) { set[j] = 1; out.push(j); }
    }
  });
  return out;
}

// ---------- бот-стрелок ----------
// view: Int8Array(100) — что стрелок знает о поле соперника: 0 неизвестно, 1 промах, 2 попадание (корабль не добит), 3 потоплен,
// 4 «пусто точно» (вокруг потопленного). left: длины ещё не потопленных кораблей.
var BS_LEVELS = [{ name: 'Лёгкий' }, { name: 'Средний' }, { name: 'Сильный' }];
function bsBotShot(view0, left, level) {
  var view = view0.slice(), unknown = [], hits = [], i;
  // клетки по диагонали от попадания пустые: корабли прямые и не касаются
  if (level > 0) for (i = 0; i < 100; i++) if (view0[i] === 2 || view0[i] === 3) {
    var r0 = (i / 10) | 0, c0 = i % 10;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) { var rr = r0 + d[0], cc = c0 + d[1]; if (rr >= 0 && cc >= 0 && rr < 10 && cc < 10 && view[rr * 10 + cc] === 0) view[rr * 10 + cc] = 4; });
  }
  for (i = 0; i < 100; i++) { if (view[i] === 0) unknown.push(i); else if (view[i] === 2) hits.push(i); }
  if (!unknown.length) return -1;
  // лёгкий: стреляет наугад и добивает раненых не всегда
  if (level === 0 && (!hits.length || Math.random() < .45)) return unknown[Math.floor(Math.random() * unknown.length)];
  if (hits.length) {
    // добиваем раненый корабль
    if (level === 0 || level === 1) return bsFinish(view, hits);
    return bsDensity(view, left, hits);
  }
  if (level === 1) {
    // шахматный порядок с шагом по самому короткому живому кораблю
    var step = Math.min.apply(null, left.filter(function (l) { return l > 1; }).concat([left.length ? Math.max.apply(null, left) : 1]));
    if (step < 2) step = 2;
    var par = unknown.filter(function (x) { return (((x / 10) | 0) + x % 10) % step === 0; });
    var pool = par.length ? par : unknown;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return bsDensity(view, left, []);
}
function bsFinish(view, hits) {
  // если попаданий два и больше — продолжаем по линии, иначе пробуем 4 соседей
  var cand = [];
  var free = function (r, c) { return r >= 0 && c >= 0 && r < 10 && c < 10 && view[r * 10 + c] === 0; };
  if (hits.length >= 2) {
    var rs = hits.map(function (x) { return (x / 10) | 0; }), cs = hits.map(function (x) { return x % 10; });
    var sameRow = rs.every(function (r) { return r === rs[0]; });
    if (sameRow) { var mn = Math.min.apply(null, cs), mx = Math.max.apply(null, cs); if (free(rs[0], mn - 1)) cand.push(rs[0] * 10 + mn - 1); if (free(rs[0], mx + 1)) cand.push(rs[0] * 10 + mx + 1); }
    else { var mr = Math.min.apply(null, rs), xr = Math.max.apply(null, rs); if (free(mr - 1, cs[0])) cand.push((mr - 1) * 10 + cs[0]); if (free(xr + 1, cs[0])) cand.push((xr + 1) * 10 + cs[0]); }
  }
  if (!cand.length) hits.forEach(function (h) { var r = (h / 10) | 0, c = h % 10; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (free(r + d[0], c + d[1])) cand.push((r + d[0]) * 10 + c + d[1]); }); });
  if (!cand.length) { for (var i = 0; i < 100; i++) if (view[i] === 0) cand.push(i); }
  return cand[Math.floor(Math.random() * cand.length)];
}
// карта вероятностей: для каждой клетки считаем, сколько расстановок оставшихся кораблей её накрывают
function bsDensity(view, left, hits) {
  var score = new Float64Array(100), uniq = {}, i;
  left.forEach(function (l) { uniq[l] = (uniq[l] || 0) + 1; });
  Object.keys(uniq).forEach(function (key) {
    var len = +key, mult = uniq[key];
    for (var r = 0; r < 10; r++) for (var c = 0; c < 10; c++) for (var v = 0; v < 2; v++) {
      if (len === 1 && v === 1) continue;
      var cells = bsShipCells(r, c, len, v === 1);
      if (!cells) continue;
      var ok = true, coverHits = 0;
      for (var k = 0; k < len; k++) { var s = view[cells[k]]; if (s === 1 || s === 3 || s === 4) { ok = false; break; } if (s === 2) coverHits++; }
      if (!ok) continue;
      if (hits.length && !coverHits) continue;                 // добиваем: только расстановки через попадания
      // корабль не может касаться потопленных (они уже окружены «пустыми» клетками) — это учтено через 4
      var w = mult * (hits.length ? Math.pow(30, coverHits) : 1);
      for (k = 0; k < len; k++) if (view[cells[k]] === 0) score[cells[k]] += w;
    }
  });
  var best = -1, bv = -1;
  for (i = 0; i < 100; i++) if (view[i] === 0) {
    var sc = score[i] + Math.random() * 1e-3;
    if (sc > bv) { bv = sc; best = i; }
  }
  return best;
}

// ---------- подсказка и разбор: шанс попадания в каждую клетку ----------
// Только по тому, что стрелок знает (view). Есть раненый корабль — где он продолжается; иначе — где может стоять
// хоть один из оставшихся кораблей (каждый корабль считаем отдельно, грубо, но наглядно).
function bsProb(view0, left) {
  var view = view0.slice(), i, P = new Float64Array(100), hits = [];
  for (i = 0; i < 100; i++) if (view0[i] === 2 || view0[i] === 3) {
    var r0 = (i / 10) | 0, c0 = i % 10;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) { var rr = r0 + d[0], cc = c0 + d[1]; if (rr >= 0 && cc >= 0 && rr < 10 && cc < 10 && view[rr * 10 + cc] === 0) view[rr * 10 + cc] = 4; });
  }
  for (i = 0; i < 100; i++) if (view[i] === 2) hits.push(i);
  var uniq = {}; left.forEach(function (l) { uniq[l] = (uniq[l] || 0) + 1; });
  var miss = new Float64Array(100).fill(1), tot = 0, cov = new Float64Array(100);
  Object.keys(uniq).forEach(function (key) {
    var len = +key, mult = uniq[key], total = 0, cover = new Float64Array(100);
    for (var r = 0; r < 10; r++) for (var c = 0; c < 10; c++) for (var v = 0; v < 2; v++) {
      if (len === 1 && v === 1) continue;
      var cells = bsShipCells(r, c, len, v === 1); if (!cells) continue;
      var ok = true, ch = 0;
      for (var k = 0; k < len; k++) { var s = view[cells[k]]; if (s === 1 || s === 3 || s === 4) { ok = false; break; } if (s === 2) ch++; }
      if (!ok) continue;
      if (hits.length) { if (!ch) continue; var w = mult * Math.pow(30, ch); tot += w; for (k = 0; k < len; k++) if (view[cells[k]] === 0) cov[cells[k]] += w; }
      else { total++; for (k = 0; k < len; k++) cover[cells[k]]++; }
    }
    if (!hits.length && total) for (var j = 0; j < 100; j++) miss[j] *= Math.pow(1 - cover[j] / total, mult);
  });
  for (i = 0; i < 100; i++) P[i] = view[i] !== 0 ? 0 : hits.length ? (tot ? cov[i] / tot : 0) : 1 - miss[i];
  var best = -1, bv = -1;
  for (i = 0; i < 100; i++) if (view[i] === 0 && P[i] > bv) { bv = P[i]; best = i; }
  return { P: P, best: best };
}
