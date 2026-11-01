// ===== BGC Точки: движок и боты (общий код для страницы и воркера) =====
var MAPS = [
  { id: 'small', name: 'Малая', rows: ['######','######','######','######','######','######'] },
  { id: 'big', name: 'Большая', rows: ['########','########','########','########','########','########','########','########'] },
  { id: 'ring', name: 'Рамка', rows: ['.######.','########','########','###..###','###..###','########','########','.######.'] },
  { id: 'round', name: 'Круг', rows: ['.####.','######','######','######','######','.####.'] },
  { id: 'cross', name: 'Икс', rows: ['###..###','########','########','.######.','.######.','########','########','###..###'] }
];

// Игроки по углам: 0 — левый верх, 1 — правый верх, 2 — правый низ, 3 — левый низ.
// Ходы идут по часовой стрелке: 0 → 1 → 2 → 3 → 0.
function buildBoard(rows) {
  var H = rows.length, W = rows[0].length;
  var idx = new Int16Array(W * H).fill(-1);
  var rc = [];
  for (var r = 0; r < H; r++) for (var c = 0; c < W; c++) {
    if (rows[r][c] === '#') { idx[r * W + c] = rc.length; rc.push([r, c]); }
  }
  var n = rc.length;
  var crit = new Int8Array(n), nbS = new Int16Array(n + 1), flat = [];
  var D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (var i = 0; i < n; i++) {
    nbS[i] = flat.length;
    for (var d = 0; d < 4; d++) {
      var rr = rc[i][0] + D[d][0], cc = rc[i][1] + D[d][1];
      if (rr >= 0 && rr < H && cc >= 0 && cc < W && idx[rr * W + cc] >= 0) flat.push(idx[rr * W + cc]);
    }
    // Клетка взрывается, когда точек столько же, сколько у неё соседей:
    // в середине 4, у стенки 3, в углу 2. Точки никуда не пропадают.
    crit[i] = flat.length - nbS[i];
  }
  nbS[n] = flat.length;
  var starts = [idx[1 * W + 1], idx[1 * W + W - 2], idx[(H - 2) * W + W - 2], idx[(H - 2) * W + 1]];
  return { W: W, H: H, n: n, rc: rc, idx: idx, crit: crit, nbS: nbS, nbF: Int16Array.from(flat), starts: starts, mark: new Int32Array(n), stamp: 1 };
}

function onlyOwner(B, own, p) {
  for (var i = 0; i < B.n; i++) if (own[i] >= 0 && own[i] !== p) return false;
  return true;
}

// Ход: +1 точка в свою клетку, затем цепная реакция волнами.
// rec=true — вернуть кадры для анимации.
function applyMove(B, cnt, own, i, p, rec) {
  var crit = B.crit, nbS = B.nbS, nbF = B.nbF, mark = B.mark;
  cnt[i]++; own[i] = p;
  var frames = rec ? [] : null;
  if (cnt[i] < crit[i]) return frames;
  var cur = [i], guard = 0;
  while (cur.length && guard++ < 4000) {
    var ex = [];
    for (var a = 0; a < cur.length; a++) if (cnt[cur[a]] >= crit[cur[a]]) ex.push(cur[a]);
    if (!ex.length) break;
    var st = ++B.stamp, next = [];
    for (a = 0; a < ex.length; a++) {
      var j = ex[a];
      cnt[j] -= crit[j];
      for (var t = nbS[j]; t < nbS[j + 1]; t++) {
        var q = nbF[t];
        cnt[q]++; own[q] = p;
        if (cnt[q] >= crit[q] && mark[q] !== st) { mark[q] = st; next.push(q); }
      }
    }
    for (a = 0; a < ex.length; a++) {
      j = ex[a];
      if (cnt[j] === 0) own[j] = -1;
      else if (cnt[j] >= crit[j] && mark[j] !== st) { mark[j] = st; next.push(j); }
    }
    if (rec) frames.push({ ex: ex, cnt: cnt.slice(), own: own.slice() });
    if (onlyOwner(B, own, p)) break;
    cur = next;
  }
  return frames;
}

function aliveMaskAfter(B, own, mask) {
  var seen = 0;
  for (var i = 0; i < B.n; i++) if (own[i] >= 0) seen |= (1 << own[i]);
  return mask & seen;
}

function nextAlive(mask, p) {
  for (var k = 1; k <= 4; k++) { var q = (p + k) % 4; if (mask & (1 << q)) return q; }
  return p;
}

function bitCount(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

// ---------- Оценка позиции ----------
var _chainSeen = null, _chainStack = null;
function heur(B, cnt, own, p) {
  var n = B.n, crit = B.crit, nbS = B.nbS, nbF = B.nbF;
  var s = 0, orbs = 0, cells = 0;
  for (var i = 0; i < n; i++) {
    if (own[i] !== p) continue;
    cells++; orbs += cnt[i];
    var vuln = false, cm = crit[i];
    for (var t = nbS[i]; t < nbS[i + 1]; t++) {
      var q = nbF[t];
      if (own[q] >= 0 && own[q] !== p && cnt[q] === crit[q] - 1) { s -= (5 - cm); vuln = true; }
    }
    if (!vuln) {
      if (cm === 3) s += 2; else if (cm === 2) s += 3;
      if (cnt[i] === cm - 1) s += 2;
    }
  }
  if (!cells) return -1000;
  // Цепочки моих «заряженных» клеток (одна точка до взрыва) стоят дороже.
  if (!_chainSeen || _chainSeen.length < n) { _chainSeen = new Uint8Array(n); _chainStack = new Int16Array(n); }
  var seen = _chainSeen; seen.fill(0, 0, n);
  for (i = 0; i < n; i++) {
    if (seen[i] || own[i] !== p || cnt[i] !== crit[i] - 1) continue;
    var sp = 0, size = 0; _chainStack[sp++] = i; seen[i] = 1;
    while (sp) {
      var x = _chainStack[--sp]; size++;
      for (t = nbS[x]; t < nbS[x + 1]; t++) {
        q = nbF[t];
        if (!seen[q] && own[q] === p && cnt[q] === crit[q] - 1) { seen[q] = 1; _chainStack[sp++] = q; }
      }
    }
    if (size > 1) s += 2 * size;
  }
  return s + orbs + cells * 0.5;
}

var WIN = 1000000;
function evalFor(B, cnt, own, mask, me, startMask) {
  if (!(mask & (1 << me))) return -WIN;
  if (mask === (1 << me)) return WIN;
  var mine = heur(B, cnt, own, me), sum = 0, mx = -1e9, k = 0;
  for (var q = 0; q < 4; q++) {
    if (q === me || !(mask & (1 << q))) continue;
    var h = heur(B, cnt, own, q); sum += h; if (h > mx) mx = h; k++;
  }
  var dead = bitCount(startMask & ~mask);
  if (k === 1) return mine - mx + dead * 30;
  return mine - (0.55 * mx + 0.45 * sum / k) + dead * 30;
}

// ---------- Поиск (альфа-бета; при 3–4 игроках «параноидальный»: все против меня) ----------
var LEVELS = [
  { name: 'Лёгкий', depth: 1, time: 150, beam: 99, noise: 6, q: 0, qbeam: 0 },
  { name: 'Средний', depth: 2, time: 500, beam: 8, noise: 0.6, q: 0, qbeam: 0 },
  { name: 'Сильный', depth: 6, time: 1300, beam: 9, noise: 0.05, q: 3, qbeam: 6, verify: true },
  { name: 'Мастер', depth: 10, time: 2800, beam: 11, noise: 0.01, q: 5, qbeam: 8, verify: true }
];

function ownedBy(B, own, p) { var m = []; for (var i = 0; i < B.n; i++) if (own[i] === p) m.push(i); return m; }

// Поиск (общий для бота, подсказки и оценки позиции).
function makeSearch(B, me, startMask, L, deadline) {
  var nodes = 0, ABORT = {};
  function expand(cnt, own, mask, turn, ply) {
    var mv = ownedBy(B, own, turn), out = [];
    for (var a = 0; a < mv.length; a++) {
      var c2 = cnt.slice(), o2 = own.slice();
      applyMove(B, c2, o2, mv[a], turn, false);
      var m2 = aliveMaskAfter(B, o2, mask);
      var sc = evalFor(B, c2, o2, m2, me, startMask);
      if (sc >= WIN) sc = WIN - ply; else if (sc <= -WIN) sc = -WIN + ply;
      out.push({ m: mv[a], c: c2, o: o2, k: m2, s: sc });
    }
    return out;
  }

  var crit = B.crit, nbS = B.nbS, nbF = B.nbF;
  function isTerminal(s) { return s >= WIN - 1000 || s <= -WIN + 1000; }

  // Досчёт взрывов: на конце варианта тот, чей ход, может взорвать заряженную
  // клетку рядом с чужой. Перебираем только такие «захваты», пока не станет тихо.
  function Q(cnt, own, mask, turn, alpha, beta, ply, qd, stand) {
    if ((++nodes & 127) === 0 && Date.now() > deadline) throw ABORT;
    var maxi = turn === me;
    if (maxi) { if (stand >= beta) return stand; if (stand > alpha) alpha = stand; }
    else { if (stand <= alpha) return stand; if (stand < beta) beta = stand; }
    if (qd <= 0) return stand;
    var ch = [];
    for (var i = 0; i < B.n; i++) {
      if (own[i] !== turn || cnt[i] !== crit[i] - 1) continue;
      var hit = false;
      for (var t = nbS[i]; t < nbS[i + 1]; t++) { var o = own[nbF[t]]; if (o >= 0 && o !== turn) { hit = true; break; } }
      if (!hit) continue;
      var c2 = cnt.slice(), o2 = own.slice();
      applyMove(B, c2, o2, i, turn, false);
      var m2 = aliveMaskAfter(B, o2, mask), sc = evalFor(B, c2, o2, m2, me, startMask);
      if (sc >= WIN) sc = WIN - ply; else if (sc <= -WIN) sc = -WIN + ply;
      ch.push({ c: c2, o: o2, k: m2, s: sc });
    }
    if (!ch.length) return stand;
    ch.sort(maxi ? function (x, y) { return y.s - x.s; } : function (x, y) { return x.s - y.s; });
    var qlim = maxi ? L.qbeam : (L.oppQbeam || 99);
    if (ch.length > qlim) ch.length = qlim;
    var best = stand;
    for (var a = 0; a < ch.length; a++) {
      var x = ch[a];
      var v = isTerminal(x.s) ? x.s : Q(x.c, x.o, x.k, nextAlive(x.k, turn), alpha, beta, ply + 1, qd - 1, x.s);
      if (maxi) { if (v > best) best = v; if (v > alpha) alpha = v; }
      else { if (v < best) best = v; if (v < beta) beta = v; }
      if (alpha >= beta) break;
    }
    return best;
  }

  function tactical(cnt, own, i, turn) {
    var after = cnt[i] + 1, cm = crit[i];
    if (after < cm - 1) return false;                       // not loaded yet and not bursting
    for (var t = nbS[i]; t < nbS[i + 1]; t++) { var o = own[nbF[t]]; if (o >= 0 && o !== turn) return true; }
    return false;
  }

  function leaf(x, turn, alpha, beta, ply) {
    if (!L.q || isTerminal(x.s)) return x.s;
    return Q(x.c, x.o, x.k, nextAlive(x.k, turn), alpha, beta, ply + 1, L.q, x.s);
  }

  function V(cnt, own, mask, turn, depth, alpha, beta, ply) {
    if ((++nodes & 127) === 0 && Date.now() > deadline) throw ABORT;
    var ch = expand(cnt, own, mask, turn, ply + 1), maxi = turn === me;
    ch.sort(maxi ? function (x, y) { return y.s - x.s; } : function (x, y) { return x.s - y.s; });
    // Prune only our own options. Cutting the opponent's replies made the search believe in
    // wins that a quiet defence (e.g. loading a corner) refutes.
    var lim = maxi ? L.beam : (L.oppBeam || L.beam);
    if (ch.length > lim) {
      // Beyond the best-looking moves, always keep the tactical ones: a burst next to someone else's
      // cell, or a quiet move that cocks a cell (one dot short of bursting) next to someone else's cell.
      // Those quiet set-ups are the typical refutations that a plain cut-off throws away.
      var keep = ch.slice(0, lim);
      for (var z = lim; z < ch.length; z++) if (tactical(cnt, own, ch[z].m, turn)) keep.push(ch[z]);
      ch = keep;
    }
    var best = maxi ? -Infinity : Infinity;
    for (var a = 0; a < ch.length; a++) {
      var x = ch[a], v;
      if (isTerminal(x.s)) v = x.s;
      else if (depth <= 1) v = leaf(x, turn, alpha, beta, ply + 1);
      else v = V(x.c, x.o, x.k, nextAlive(x.k, turn), depth - 1, alpha, beta, ply + 1);
      if (maxi) { if (v > best) best = v; if (v > alpha) alpha = v; }
      else { if (v < best) best = v; if (v < beta) beta = v; }
      if (alpha >= beta) break;
    }
    return best;
  }

  return { expand: expand, V: V, isTerminal: isTerminal, ABORT: ABORT };
}

function think(B, cnt0, own0, mask0, me, levelIdx, startMask) {
  var L = LEVELS[levelIdx], t0 = Date.now(), deadline = t0 + L.time * (L.verify ? 0.65 : 1);
  var root = ownedBy(B, own0, me);
  if (root.length === 1) return root[0];
  var S = makeSearch(B, me, startMask, L, deadline), expand = S.expand, V = S.V, isTerminal = S.isTerminal, ABORT = S.ABORT;

  // Случайность только среди ходов, чья оценка посчитана точно и почти равна лучшей.
  // (Отсечённые альфа-бетой ходы возвращают лишь границу — их брать нельзя.)
  var W = Math.max(L.noise, 1e-6);
  function pick(list, key) {
    var best = -Infinity, i;
    for (i = 0; i < list.length; i++) if (list[i].ok && list[i][key] > best) best = list[i][key];
    var c = list.filter(function (x) { return x.ok && x[key] >= best - W; });
    return c[Math.floor(Math.random() * c.length)].m;
  }

  var rootCh = expand(cnt0, own0, mask0, me, 1);
  rootCh.forEach(function (x) { x.v = x.s; x.ok = true; });
  rootCh.sort(function (x, y) { return y.s - x.s; });
  if (rootCh[0].s >= WIN - 1000) return rootCh[0].m;
  if (L.depth === 1) return pick(rootCh, 's');

  var bestMove = rootCh[0].m;
  // Глубина всегда кратна полному кругу (все живые игроки сходили), иначе бот
  // не видит ответного взрыва и жадничает.
  var round = bitCount(mask0), step = round, d0 = Math.min(L.depth, round);
  if (L.depth < round) step = L.depth;
  if (L.step) { d0 = Math.min(2, L.depth); step = L.step; }
  for (var d = d0; d <= Math.max(L.depth, d0); d += step) {
    try {
      var bv = -Infinity, res = [];
      for (var a = 0; a < rootCh.length; a++) {
        var x = rootCh[a], v, alpha = bv - W;
        if (isTerminal(x.s)) v = x.s;
        else v = V(x.c, x.o, x.k, nextAlive(x.k, me), d - 1, alpha, Infinity, 1);
        res.push({ m: x.m, v: v, ok: v > alpha, x: x });
        if (v > bv) bv = v;
      }
      bestMove = pick(res, 'v');
      res.forEach(function (r) { r.x.v = r.ok ? r.v : r.v - 0.001; });
      rootCh.sort(function (p, q) { return q.v - p.v; });
      think.lastDepth = d;
      if (bv >= WIN - 1000) break;
    } catch (e) {
      if (e !== ABORT) throw e;
      break;
    }
    if (Date.now() > deadline) break;
  }
  if (L.verify) bestMove = verify(bestMove);
  return bestMove;

  // Safety check: the pruned search is deep but can miss a quiet defence. Re-check the top candidates
  // with a full-width search (every reply considered) and drop any that turn out to be refuted.
  function verify(fallback) {
    var cand = rootCh.filter(function (x) { return !isTerminal(x.s) || x.s > 0; }).slice(0, 4);
    if (cand.length < 2) return fallback;
    var SF = makeSearch(B, me, startMask, { beam: 999, q: L.q, qbeam: 99 }, t0 + L.time);
    var fw = null, rnd = bitCount(mask0);
    for (var dv = Math.min(2, rnd); dv <= 12; dv += (dv < rnd ? rnd - dv : rnd)) {
      var cur = [];
      try {
        for (var a = 0; a < cand.length; a++) {
          var x = cand[a];
          cur.push(isTerminal(x.s) ? x.s : SF.V(x.c, x.o, x.k, nextAlive(x.k, me), dv - 1, -Infinity, Infinity, 1));
        }
      } catch (e) { if (e !== SF.ABORT) throw e; break; }
      fw = cur; verify.depth = dv;
      if (Date.now() > t0 + L.time) break;
    }
    if (!fw) return fallback;
    var top = Math.max.apply(null, fw);
    // keep the deep search's preference unless the full-width check shows that move is clearly worse
    for (var b = 0; b < cand.length; b++) {
      if (cand[b].m === fallback && fw[b] >= top - 8) return fallback;
    }
    for (b = 0; b < cand.length; b++) if (fw[b] >= top - 8) return cand[b].m;
    return fallback;
  }
}

// Оценка позиции: насколько хорошо для игрока me (ход за turn). Возвращает
// значение поиска (как у мастера) и шанс на победу в процентах.
var EVAL_K = 12.5; // масштаб перевода оценки в проценты: подобран по 20 партиям бот против бота (1248 позиций)
function analyze(B, cnt, own, mask, turn, me, startMask, timeMs) {
  if (!(mask & (1 << me))) return { v: -WIN, pct: 0, depth: 0 };
  if (mask === (1 << me)) return { v: WIN, pct: 100, depth: 0 };
  var L = { beam: 999, q: 3, qbeam: 99 };
  var S = makeSearch(B, me, startMask, L, Date.now() + (timeMs || 400));
  // Average of the last two completed depths: odd and even horizons lean opposite ways
  // (whoever moves at the horizon looks stronger), so the mean cancels that tempo bias.
  var best = evalFor(B, cnt, own, mask, me, startMask), prev = null, cur = null, depth = 0;
  for (var d = 1; d <= 12; d++) {
    var v;
    try { v = S.V(cnt, own, mask, turn, d, -Infinity, Infinity, 0); }
    catch (e) { if (e !== S.ABORT) throw e; break; }
    prev = cur; cur = v; depth = d;
    if (S.isTerminal(v)) break;
  }
  if (cur !== null) best = (prev === null || S.isTerminal(cur)) ? cur : (cur + prev) / 2;
  var pct;
  if (best >= WIN - 1000) pct = 100; else if (best <= -WIN + 1000) pct = 0;
  else pct = Math.max(3, Math.min(97, 100 / (1 + Math.exp(-best / EVAL_K))));
  return { v: best, pct: pct, depth: depth };
}
