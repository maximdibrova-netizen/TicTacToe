// ===== Русские шашки: правила и бот =====
// Доска 8×8, клетка i = r*8 + c, r = 0 — верхний ряд (сторона чёрных). Играют на тёмных полях: (r + c) нечётно.
// Значения: 0 пусто, 1 белая простая, 2 белая дамка, -1 чёрная простая, -2 чёрная дамка. Белые ходят первыми, вверх.
// Правила: простая ходит вперёд на одно поле, бьёт и вперёд, и назад. Бить обязательно, но из нескольких
// вариантов взятия можно выбрать любой (не обязательно самый большой) и довести его до конца.
// Дамка ходит и бьёт на любое расстояние по диагонали. Простая, дошедшая до последнего ряда во время взятия,
// сразу становится дамкой и продолжает бить уже как дамка. Сбитые шашки снимаются после хода целиком
// («турецкий удар»: через одну шашку дважды прыгать нельзя, снятые ещё стоят и мешают).
var CK_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var CK_FILES = 'abcdefgh';
function ckName(i) { return CK_FILES[i % 8] + (8 - ((i / 8) | 0)); }
function ckNew() {
  var b = new Int8Array(64);
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) b[r * 8 + c] = -1; else if (r > 4) b[r * 8 + c] = 1;
  }
  return { b: b, side: 1, quiet: 0, hist: {}, winner: 0, plies: 0 };
}
function ckClone(s) { return { b: s.b.slice(), side: s.side, quiet: s.quiet, hist: s.hist, winner: s.winner, plies: s.plies }; }
function ckOn(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// все взятия фигурой с поля from (перебор в глубину по правилам), массив ходов {path, caps, promote}
function ckCaptures(b, from, side) {
  var out = [], king0 = Math.abs(b[from]) === 2, promoRow = side === 1 ? 0 : 7;
  var taken = new Uint8Array(64);
  var empty = function (i) { return b[i] === 0 || i === from; };        // поле, с которого ушли, свободно
  var enemy = function (i) { return b[i] * side < 0 && !taken[i]; };
  // все прыжки из pos: [{over, land}] ; для дамки — все поля приземления за сбиваемой шашкой
  function jumps(pos, king) {
    var r = (pos / 8) | 0, c = pos % 8, res = [];
    for (var d = 0; d < 4; d++) {
      var dr = CK_DIRS[d][0], dc = CK_DIRS[d][1];
      if (!king) {
        var r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (ckOn(r2, c2) && enemy((r + dr) * 8 + c + dc) && empty(r2 * 8 + c2)) res.push({ over: (r + dr) * 8 + c + dc, lands: [r2 * 8 + c2] });
      } else {
        var rr = r + dr, cc = c + dc;
        while (ckOn(rr, cc) && empty(rr * 8 + cc)) { rr += dr; cc += dc; }
        if (!ckOn(rr, cc) || !enemy(rr * 8 + cc)) continue;
        var lands = [], lr = rr + dr, lc = cc + dc;
        while (ckOn(lr, lc) && empty(lr * 8 + lc)) { lands.push(lr * 8 + lc); lr += dr; lc += dc; }
        if (lands.length) res.push({ over: rr * 8 + cc, lands: lands });
      }
    }
    return res;
  }
  function rec(pos, king, path, caps, promoted) {
    var js = jumps(pos, king);
    if (!js.length) { if (caps.length) out.push({ path: path, caps: caps, promote: promoted }); return; }
    js.forEach(function (j) {
      taken[j.over] = 1;
      var lands = j.lands;
      if (king && lands.length > 1) {
        // дамка обязана встать на поле, откуда бьёт дальше, если такое есть
        var cont = lands.filter(function (L) { return jumps(L, true).length > 0; });
        if (cont.length) lands = cont;
      }
      lands.forEach(function (L) {
        var r2 = (L / 8) | 0, becomes = !king && r2 === promoRow;
        rec(L, king || becomes, path.concat([L]), caps.concat([j.over]), promoted || becomes);
      });
      taken[j.over] = 0;
    });
  }
  rec(from, king0, [from], [], false);
  return out;
}
function ckQuiet(b, from, side) {
  var out = [], piece = b[from], r = (from / 8) | 0, c = from % 8, promoRow = side === 1 ? 0 : 7;
  if (Math.abs(piece) === 1) {
    var dr = side === 1 ? -1 : 1;
    [-1, 1].forEach(function (dc) {
      var rr = r + dr, cc = c + dc;
      if (ckOn(rr, cc) && b[rr * 8 + cc] === 0) out.push({ path: [from, rr * 8 + cc], caps: [], promote: rr === promoRow });
    });
  } else {
    for (var d = 0; d < 4; d++) {
      var rr = r + CK_DIRS[d][0], cc = c + CK_DIRS[d][1];
      while (ckOn(rr, cc) && b[rr * 8 + cc] === 0) { out.push({ path: [from, rr * 8 + cc], caps: [], promote: false }); rr += CK_DIRS[d][0]; cc += CK_DIRS[d][1]; }
    }
  }
  return out;
}
function ckMoves(s) {
  if (s.winner) return [];
  var caps = [], quiet = [], b = s.b, side = s.side;
  for (var i = 0; i < 64; i++) if (b[i] * side > 0) { var cm = ckCaptures(b, i, side); for (var k = 0; k < cm.length; k++) caps.push(cm[k]); }
  if (caps.length) return caps;
  for (i = 0; i < 64; i++) if (b[i] * side > 0) { var qm = ckQuiet(b, i, side); for (k = 0; k < qm.length; k++) quiet.push(qm[k]); }
  return quiet;
}
function ckKey(s) { return s.side + ':' + Array.prototype.join.call(s.b, ''); }
// применить ход. track — вести учёт повторений и ничьих (в поиске выключено для скорости)
function ckApply(s, mv, track) {
  var b = s.b, from = mv.path[0], to = mv.path[mv.path.length - 1], piece = b[from];
  var manMove = Math.abs(piece) === 1;
  b[from] = 0;
  for (var k = 0; k < mv.caps.length; k++) b[mv.caps[k]] = 0;
  b[to] = mv.promote ? 2 * s.side : piece;
  s.quiet = (mv.caps.length || manMove) ? 0 : s.quiet + 1;
  s.side = -s.side; s.plies++;
  if (track) {
    var key = ckKey(s), h = Object.assign({}, s.hist); h[key] = (h[key] || 0) + 1; s.hist = h;
    if (h[key] >= 3) { s.winner = 3; s.drawReason = 'тройное повторение позиции'; return; }
    if (s.quiet >= 30) { s.winner = 3; s.drawReason = '15 ходов дамками без взятий'; return; }
  }
  if (!ckMoves(s).length) s.winner = -s.side;   // у того, кто должен ходить, нет ходов — он проиграл
}

// ---------- бот ----------
var CK_LEVELS = [
  { name: 'Лёгкий', time: 150, depth: 2, noise: 60 },
  { name: 'Средний', time: 600, depth: 6, noise: 8 },
  { name: 'Сильный', time: 2000, depth: 30, noise: 0.5 }
];
// оценка для стороны side
function ckEval(b, side) {
  var sc = 0, mw = 0, mb = 0;
  for (var i = 0; i < 64; i++) {
    var v = b[i]; if (!v) continue;
    var r = (i / 8) | 0, c = i % 8, val;
    if (v === 1 || v === -1) {
      var adv = v === 1 ? 7 - r : r;                       // насколько продвинулась
      val = 100 + adv * adv * 0.9 + (c >= 2 && c <= 5 ? 4 : 0);
      if ((v === 1 && r === 7) || (v === -1 && r === 0)) val += 6;   // держит последний ряд
      if (c === 0 || c === 7) val -= 3;
    } else {
      val = 300 + ((r === c || r + c === 7) ? 18 : 0);           // большие диагонали — сила дамки
    }
    if (v > 0) { sc += val; mw++; } else { sc -= val; mb++; }
  }
  return sc * side;
}
function ckThink(s0, levelIdx) {
  var L = CK_LEVELS[levelIdx], deadline = Date.now() + L.time, nodes = 0, ABORT = {}, me = s0.side;
  var root = ckMoves(s0);
  if (root.length === 1) return 0;
  function order(s, mv) {
    return mv.map(function (m) { return { m: m, k: m.caps.length * 1000 + (m.promote ? 500 : 0) }; }).sort(function (a, b) { return b.k - a.k; }).map(function (x) { return x.m; });
  }
  function neg(s, depth, alpha, beta, ply) {
    if ((++nodes & 511) === 0 && Date.now() > deadline) throw ABORT;
    var mv = ckMoves(s);
    if (!mv.length) return -1e5 + ply;
    var forced = mv[0].caps.length > 0;
    if (depth <= 0 && !forced) return ckEval(s.b, s.side);
    if (depth <= -8) return ckEval(s.b, s.side);           // предел досчёта взятий
    if (mv.length === 1 && depth > 0) depth++;             // единственный ход не тратит глубину
    var best = -Infinity;
    mv = order(s, mv);
    for (var a = 0; a < mv.length; a++) {
      var t = { b: s.b.slice(), side: s.side, quiet: s.quiet, plies: s.plies };
      ckApplyFast(t, mv[a]);
      var v = -neg(t, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  var list = order(s0, root).map(function (m) { return { m: m, v: 0 }; }), bestIdx = 0;
  for (var d = 1; d <= L.depth; d++) {
    try {
      var bv = -Infinity, res = [];
      for (var a = 0; a < list.length; a++) {
        var t = { b: s0.b.slice(), side: s0.side, quiet: s0.quiet, plies: s0.plies };
        ckApplyFast(t, list[a].m);
        var v = -neg(t, d - 1, -Infinity, -(bv - L.noise - 1), 1);
        res.push({ m: list[a].m, v: v });
        if (v > bv) bv = v;
      }
      res.sort(function (x, y) { return y.v - x.v; });
      list = res;
      var good = res.filter(function (r) { return r.v >= bv - L.noise; });
      var pick = good[Math.floor(Math.random() * good.length)].m;
      bestIdx = root.indexOf(pick);
      ckThink.depth = d;
      if (bv > 5e4 || bv < -5e4) break;
    } catch (e) { if (e !== ABORT) throw e; break; }
    if (Date.now() > deadline) break;
  }
  return bestIdx;          // индекс в ckMoves(s0)
}
function ckApplyFast(s, mv) {
  var b = s.b, from = mv.path[0], to = mv.path[mv.path.length - 1], piece = b[from];
  b[from] = 0;
  for (var k = 0; k < mv.caps.length; k++) b[mv.caps[k]] = 0;
  b[to] = mv.promote ? 2 * s.side : piece;
  s.side = -s.side;
}
