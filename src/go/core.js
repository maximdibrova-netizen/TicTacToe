// ===== Го: правила, подсчёт и бот (общий код для страницы и воркера) =====
// Позиция для игры: { N, komi, b: Int8Array(N*N) (0 пусто, 1 чёрный, 2 белый), turn, ko, caps: [_, чёрные взяли, белые взяли],
//   passes, moves, over, key, parent }. Пункт i = r*N + c, r = 0 — верхний ряд. Пас = -1.
// Правила китайские: самоубийство запрещено, позиционное суперко (позиция на доске не может повториться),
// два паса подряд — конец, счёт по площади: камни + окружённая пустая территория, коми белым.
var GO_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
function goName(N, i) { if (i < 0) return 'пас'; return GO_LETTERS[i % N] + (N - ((i / N) | 0)); }
function goStars(N) {
  if (N < 7) return N % 2 ? [((N * N) / 2) | 0] : [];
  var e = N >= 13 ? 3 : 2, m = (N - 1) / 2, pts = [[e, e], [e, N - 1 - e], [N - 1 - e, e], [N - 1 - e, N - 1 - e]];
  if (N % 2) { pts.push([m, m]); if (N >= 15) pts.push([e, m], [m, e], [N - 1 - e, m], [m, N - 1 - e]); }
  return pts.map(function (p) { return p[0] * N + p[1]; });
}
function goNew(N, komi) {
  var b = new Int8Array(N * N);
  return { N: N, komi: komi == null ? 7.5 : komi, b: b, turn: 1, ko: -1, caps: [0, 0, 0], passes: 0, moves: 0, over: false, key: goKey(b), parent: null };
}
function goKey(b) { var s = ''; for (var i = 0; i < b.length; i++) s += b[i]; return s; }

// ---------- быстрая доска (для поиска) ----------
// доска с рамкой: M = N + 2, пункт p = (r+1)*M + (c+1); цепочки — кольцевые списки, псевдо-дамэ (с повторами)
function GoBoard(N) {
  var M = N + 2, A = M * M;
  this.N = N; this.M = M; this.A = A; this.d = [-M, -1, 1, M];
  this.c = new Int8Array(A); this.head = new Int32Array(A); this.nxt = new Int32Array(A);
  this.libs = new Int32Array(A); this.size = new Int32Array(A);
  this.emp = new Int32Array(N * N); this.epos = new Int32Array(A); this.nEmp = 0;
  this.mark = new Int32Array(A); this.stamp = 1;
  this.ko = -1; this.turn = 1; this.passes = 0; this.last = -1; this.last2 = -1;
  for (var p = 0; p < A; p++) {
    var r = (p / M) | 0, c = p % M;
    if (r === 0 || c === 0 || r === M - 1 || c === M - 1) this.c[p] = 3;
    else { this.epos[p] = this.nEmp; this.emp[this.nEmp++] = p; }
  }
}
GoBoard.prototype.copy = function (o) {
  this.c.set(o.c); this.head.set(o.head); this.nxt.set(o.nxt); this.libs.set(o.libs); this.size.set(o.size);
  this.emp.set(o.emp); this.epos.set(o.epos); this.nEmp = o.nEmp;
  this.ko = o.ko; this.turn = o.turn; this.passes = o.passes; this.last = o.last; this.last2 = o.last2;
};
GoBoard.prototype.toP = function (i) { return ((i / this.N) | 0) * this.M + this.M + 1 + (i % this.N); };
GoBoard.prototype.toI = function (p) { return (((p / this.M) | 0) - 1) * this.N + (p % this.M) - 1; };
GoBoard.prototype.remEmpty = function (p) { var k = this.epos[p], q = this.emp[--this.nEmp]; this.emp[k] = q; this.epos[q] = k; };
GoBoard.prototype.addEmpty = function (p) { this.epos[p] = this.nEmp; this.emp[this.nEmp++] = p; };
// можно ли поставить камень цвета col в p (без суперко)
GoBoard.prototype.legal = function (p, col) {
  var c = this.c, h = this.head, d = this.d;
  if (c[p] !== 0 || p === this.ko) return false;
  for (var k = 0; k < 4; k++) if (c[p + d[k]] === 0) return true;
  for (k = 0; k < 4; k++) {
    var q = p + d[k], v = c[q]; if (v === 3) continue;
    var hq = h[q], n = 0;
    for (var j = 0; j < 4; j++) { var q2 = p + d[j]; if (c[q2] === v && h[q2] === hq) n++; }
    if (v === col ? this.libs[hq] > n : this.libs[hq] === n) return true;
  }
  return false;
};
// пункт — «глаз» цвета col (в случайных доигрываниях свои глаза не заполняем)
GoBoard.prototype.eyeish = function (p, col) {
  var c = this.c, d = this.d, M = this.M, edge = 0, bad = 0;
  for (var k = 0; k < 4; k++) { var v = c[p + d[k]]; if (v === 3) edge = 1; else if (v !== col) return false; }
  var dg = [p - M - 1, p - M + 1, p + M - 1, p + M + 1];
  for (k = 0; k < 4; k++) { var w = c[dg[k]]; if (w === 3) edge = 1; else if (w === 3 - col) bad++; }
  return bad + edge < 2;
};
GoBoard.prototype.place = function (p, col) {
  var c = this.c, h = this.head, nx = this.nxt, L = this.libs, S = this.size, d = this.d, opp = 3 - col;
  this.remEmpty(p);
  c[p] = col; h[p] = p; nx[p] = p; S[p] = 1; L[p] = 0;
  for (var k = 0; k < 4; k++) { var q = p + d[k], v = c[q]; if (v === 0) L[p]++; else if (v !== 3) L[h[q]]--; }
  for (k = 0; k < 4; k++) { q = p + d[k]; if (c[q] === col && h[q] !== h[p]) this.merge(h[p], h[q]); }
  var cap = 0, capAt = -1;
  for (k = 0; k < 4; k++) { q = p + d[k]; if (c[q] === opp && L[h[q]] === 0) { cap += S[h[q]]; capAt = q; this.removeChain(h[q]); } }
  var hp = h[p];
  this.ko = cap === 1 && S[hp] === 1 && L[hp] === 1 ? capAt : -1;
  this.turn = opp; this.passes = 0; this.last2 = this.last; this.last = p;
  return cap;
};
GoBoard.prototype.pass = function () { this.ko = -1; this.turn = 3 - this.turn; this.passes++; this.last2 = this.last; this.last = -1; };
GoBoard.prototype.merge = function (a, b) {
  var h = this.head, nx = this.nxt, S = this.size;
  if (S[a] < S[b]) { var t = a; a = b; b = t; }
  var p = b; do { h[p] = a; p = nx[p]; } while (p !== b);
  var tmp = nx[a]; nx[a] = nx[b]; nx[b] = tmp;
  S[a] += S[b]; this.libs[a] += this.libs[b];
};
GoBoard.prototype.removeChain = function (hd) {
  var c = this.c, nx = this.nxt, h = this.head, d = this.d, p = hd;
  do { c[p] = 0; this.addEmpty(p); p = nx[p]; } while (p !== hd);
  p = hd;
  do { for (var k = 0; k < 4; k++) { var q = p + d[k], v = c[q]; if (v === 1 || v === 2) this.libs[h[q]]++; } p = nx[p]; } while (p !== hd);
};
// настоящие дамэ цепочки (не больше max); lib — последнее найденное
GoBoard.prototype.realLibs = function (hd, max) {
  var c = this.c, nx = this.nxt, d = this.d, mk = this.mark, st = ++this.stamp, n = 0, p = hd;
  this.lib = -1;
  do {
    for (var k = 0; k < 4; k++) { var q = p + d[k]; if (c[q] === 0 && mk[q] !== st) { mk[q] = st; n++; this.lib = q; if (n >= max) return n; } }
    p = nx[p];
  } while (p !== hd);
  return n;
};
// сколько дамэ будет у камня в p после хода (оценка, до 3), и сколько он съест
GoBoard.prototype.after = function (p, col) {
  var c = this.c, d = this.d, h = this.head, mk = this.mark, st = ++this.stamp, n = 0, cap = 0, opp = 3 - col;
  mk[p] = st;
  for (var k = 0; k < 4; k++) {
    var q = p + d[k], v = c[q];
    if (v === 0 && mk[q] !== st) { mk[q] = st; n++; }
    else if (v === opp && this.realLibs(h[q], 2) === 1) { cap += this.size[h[q]]; n++; }
  }
  st = this.stamp;
  for (k = 0; k < 4 && n < 3; k++) {
    q = p + d[k];
    if (c[q] === col) {
      var hd = h[q], s = hd;
      do { for (var j = 0; j < 4; j++) { var r = s + d[j]; if (c[r] === 0 && r !== p && mk[r] !== st) { mk[r] = st; n++; } } s = this.nxt[s]; } while (s !== hd && n < 3);
    }
  }
  this.cap = cap;
  return n;
};
// счёт по площади в конце доигрывания: чёрные минус белые (без коми)
GoBoard.prototype.area = function (own) {
  var c = this.c, d = this.d, sc = 0;
  for (var k = 0; k < this.N * this.N; k++) {
    var p = this.toP(k), v = c[p], o = 0;
    if (v === 1) o = 1; else if (v === 2) o = -1;
    else { var b = 0, w = 0; for (var j = 0; j < 4; j++) { var x = c[p + d[j]]; if (x === 1) b++; else if (x === 2) w++; } o = b && !w ? 1 : w && !b ? -1 : 0; }
    sc += o; if (own) own[k] += o;
  }
  return sc;
};
GoBoard.prototype.fromState = function (s) {
  for (var i = 0; i < s.N * s.N; i++) if (s.b[i]) this.place(this.toP(i), s.b[i]);
  this.ko = s.ko >= 0 ? this.toP(s.ko) : -1; this.turn = s.turn; this.passes = s.passes;
  this.last = s.lastMove >= 0 ? this.toP(s.lastMove) : -1; this.last2 = -1;
  return this;
};

// ---------- ход в игре (с суперко) ----------
function goBoardOf(s) { return new GoBoard(s.N).fromState(s); }
// ходы от начала партии до позиции s
function goPath(s) { var out = []; for (var t = s; t && t.parent; t = t.parent) out.push(t.mv); return out.reverse(); }
function goSeen(s, key) { for (var t = s; t; t = t.parent) if (t.key === key) return true; return false; }
// новая позиция после хода i (или пас -1); null — ход невозможен. Исходная позиция не меняется.
function goPlay(s, i) {
  if (s.over) return null;
  var n = { N: s.N, komi: s.komi, b: s.b, turn: 3 - s.turn, ko: -1, caps: s.caps.slice(), passes: s.passes + 1, moves: s.moves + 1, over: false, key: s.key, parent: s, lastMove: -1, mv: i };
  if (i < 0) { if (n.passes >= 2) n.over = true; return n; }
  var B = goBoardOf(s), p = B.toP(i);
  if (!B.legal(p, s.turn)) return null;
  var cap = B.place(p, s.turn), b = new Int8Array(s.N * s.N);
  for (var k = 0; k < b.length; k++) { var v = B.c[B.toP(k)]; b[k] = v; }
  var key = goKey(b);
  if (goSeen(s, key)) return null;          // суперко
  n.b = b; n.key = key; n.passes = 0; n.ko = B.ko >= 0 ? B.toI(B.ko) : -1; n.caps[s.turn] += cap; n.lastMove = i;
  return n;
}
function goLegalMoves(s) {
  var out = [], B = goBoardOf(s);
  for (var i = 0; i < s.N * s.N; i++) { var p = B.toP(i); if (B.legal(p, s.turn) && goPlay(s, i)) out.push(i); }
  return out;
}

// ---------- случайное доигрывание ----------
var goRnd = (function () { var x = (Date.now() ^ 0x9e3779b9) >>> 0 || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; })();
// ход в доигрывании: сначала тактика вокруг последнего хода (съесть / спастись из атари), иначе случайный
function goPlayoutMove(B) {
  var col = B.turn, c = B.c, d = B.d, h = B.head, last = B.last;
  if (last >= 0 && goRnd() < .92) {
    for (var k = 0; k < 4; k++) {
      var q = last + d[k];
      if (c[q] === col && B.realLibs(h[q], 2) === 1) {           // нашу цепочку поставили в атари — убегаем или съедаем
        var lib = B.lib;
        if (B.legal(lib, col) && B.after(lib, col) >= 2) return lib;
      }
    }
    if (c[last] === 3 - col && B.realLibs(h[last], 2) === 1 && B.legal(B.lib, col)) return B.lib;   // сам встал в атари
  }
  var n = B.nEmp; if (!n) return -1;
  var st = (goRnd() * n) | 0;
  for (var j = 0; j < n; j++) {
    var p = B.emp[(st + j) % n];
    if (!B.legal(p, col) || B.eyeish(p, col)) continue;
    if (B.after(p, col) <= 1 && !B.cap && goRnd() < .85) continue;   // обычно не ставим себя в атари
    return p;
  }
  return -1;
}
function goPlayout(B, seq, maxLen) {
  var n = 0;
  while (B.passes < 2 && n < maxLen) {
    var p = goPlayoutMove(B);
    if (p < 0) B.pass(); else { if (seq) seq.push(p, B.turn); B.place(p, B.turn); }
    n++;
  }
}

// ---------- оценка территории и мёртвых камней (много доигрываний) ----------
function goOwnership(s, playouts) {
  var N = s.N, own = new Float64Array(N * N), base = goBoardOf(s), B = new GoBoard(N), lead = 0;
  for (var t = 0; t < playouts; t++) { B.copy(base); B.passes = 0; goPlayout(B, null, N * N * 3); lead += B.area(own); }
  for (var k = 0; k < own.length; k++) own[k] /= playouts;
  return { own: own, lead: lead / playouts - s.komi };
}
function goGuessDead(s, own) {
  var dead = new Uint8Array(s.N * s.N);
  for (var i = 0; i < dead.length; i++) { var v = s.b[i]; if (v === 1 && own[i] < -.25) dead[i] = 1; else if (v === 2 && own[i] > .25) dead[i] = 1; }
  // мёртвыми считаем цепочки целиком (по большинству камней)
  var seen = new Uint8Array(dead.length), N = s.N;
  for (i = 0; i < dead.length; i++) {
    if (!s.b[i] || seen[i]) continue;
    var ch = goChain(s, i), dn = 0; ch.forEach(function (x) { seen[x] = 1; dn += dead[x]; });
    var all = dn * 2 > ch.length ? 1 : 0; ch.forEach(function (x) { dead[x] = all; });
  }
  return dead;
}
function goChain(s, i) {
  var N = s.N, col = s.b[i], out = [i], seen = {}; seen[i] = 1;
  for (var k = 0; k < out.length; k++) {
    var p = out[k], r = (p / N) | 0, c = p % N, nb = [];
    if (r > 0) nb.push(p - N); if (r < N - 1) nb.push(p + N); if (c > 0) nb.push(p - 1); if (c < N - 1) nb.push(p + 1);
    nb.forEach(function (q) { if (!seen[q] && s.b[q] === col) { seen[q] = 1; out.push(q); } });
  }
  return out;
}
// счёт по площади с учётом мёртвых камней: { b, w (с коми), owner: Int8Array (1/2/0), diff = b - w }
function goScore(s, dead) {
  var N = s.N, A = N * N, b = new Int8Array(A), owner = new Int8Array(A), sb = 0, sw = 0;
  for (var i = 0; i < A; i++) b[i] = dead && dead[i] ? 0 : s.b[i];
  var seen = new Uint8Array(A);
  for (i = 0; i < A; i++) {
    if (b[i]) { owner[i] = b[i]; continue; }
    if (seen[i]) continue;
    var reg = [i], touch = 0; seen[i] = 1;
    for (var k = 0; k < reg.length; k++) {
      var p = reg[k], r = (p / N) | 0, c = p % N, nb = [];
      if (r > 0) nb.push(p - N); if (r < N - 1) nb.push(p + N); if (c > 0) nb.push(p - 1); if (c < N - 1) nb.push(p + 1);
      for (var j = 0; j < nb.length; j++) { var q = nb[j]; if (b[q]) touch |= b[q]; else if (!seen[q]) { seen[q] = 1; reg.push(q); } }
    }
    var o = touch === 1 ? 1 : touch === 2 ? 2 : 0;
    reg.forEach(function (x) { owner[x] = o; });
  }
  for (i = 0; i < A; i++) { if (owner[i] === 1) sb++; else if (owner[i] === 2) sw++; }
  return { b: sb, w: sw + s.komi, owner: owner, diff: sb - sw - s.komi };
}

// ---------- бот: поиск по дереву Монте-Карло (UCT + RAVE) ----------
var GO_LEVELS = [
  { name: 'Лёгкий', time: 350, temp: 1 },
  { name: 'Средний', time: 1500, temp: 0 },
  { name: 'Сильный', time: 4500, temp: 0 }
];
function goNode(mv) { return { mv: mv, n: 0, w: 0, an: 0, aw: 0, pn: 0, pw: 0, kids: null }; }
// априорная оценка хода (виртуальные посещения): тактика, линии от края, близость к последним ходам
function goPrior(B, p, col, early) {
  var N = B.N, r = ((p / B.M) | 0) - 1, c = (p % B.M) - 1, line = Math.min(r, c, N - 1 - r, N - 1 - c), v = .5;
  var libs = B.after(p, col), cap = B.cap;
  if (cap) v = .78;
  else {
    for (var k = 0; k < 4; k++) { var q = p + B.d[k]; if (B.c[q] === col && B.realLibs(B.head[q], 2) === 1) { v = libs >= 2 ? .74 : .3; break; } }
    if (libs <= 1) v = Math.min(v, .12);
  }
  if (N >= 9 && v === .5) {
    if (line === 0) v = early ? .2 : .4; else if (line === 1) v = early ? .38 : .47;
    else if (early && (line === 2 || line === 3)) v = .6;
  }
  var near = 0;
  [B.last, B.last2].forEach(function (L) { if (L >= 0) { var lr = ((L / B.M) | 0) - 1, lc = (L % B.M) - 1, dist = Math.abs(lr - r) + Math.abs(lc - c); if (dist <= 2) near = 1; } });
  if (near && v < .7) v += .06;
  return v;
}
function goExpand(node, B) {
  var col = B.turn, kids = [], filled = (B.N * B.N - B.nEmp) / (B.N * B.N), early = filled < .12;
  for (var j = 0; j < B.nEmp; j++) {
    var p = B.emp[j];
    if (!B.legal(p, col) || B.eyeish(p, col)) continue;
    var kd = goNode(p), pr = goPrior(B, p, col, early);
    kd.pn = 12; kd.pw = 12 * pr; kids.push(kd);
  }
  var ps = goNode(-1); ps.pn = 12; ps.pw = 12 * (kids.length ? (filled > .5 ? .25 : .05) : .9); kids.push(ps);
  node.kids = kids;
}
function goSelect(node) {
  var best = null, bv = -1, lnN = Math.log(node.n + 1);
  for (var k = 0; k < node.kids.length; k++) {
    var x = node.kids[k], q = (x.w + x.pw) / (x.n + x.pn);
    var am = x.an ? x.aw / x.an : q, beta = x.an ? x.an / (x.an + x.n + x.an * x.n / 1500) : 0;
    var v = (1 - beta) * q + beta * am + .05 * Math.sqrt(lnN / (x.n + 1));
    if (v > bv) { bv = v; best = x; }
  }
  return best;
}
// поиск: { best (i или -1), p: шанс на победу того, чей ход, lead: перевес чёрных в очках, visits }
function goSearch(s, ms, temp) {
  var N = s.N, base = goBoardOf(s), B = new GoBoard(N), root = goNode(-2), deadline = Date.now() + ms;
  var firstAt = new Int32Array(base.A), stamp = new Int32Array(base.A), st = 0, sims = 0, leadSum = 0;
  goExpand(root, base);
  // если соперник спасовал и мы и так выигрываем по счёту — пасуем тоже
  var seq = [], expandAt = N >= 13 ? 6 : 2;
  while ((sims & 31) || Date.now() < deadline) {
    B.copy(base); seq.length = 0;
    var node = root, path = [root];
    while (node.kids && B.passes < 2) {
      var kd = goSelect(node), col = B.turn;
      if (kd.mv < 0) B.pass(); else { seq.push(kd.mv, col); B.place(kd.mv, col); }
      path.push(kd); node = kd;
      if (!node.kids && node.n >= expandAt && B.passes < 2) { goExpand(node, B); }
    }
    var tree = seq.length;
    goPlayout(B, seq, N * N * 3);
    var margin = B.area(null) - s.komi, bw = margin > 0 ? 1 : 2;
    leadSum += margin;
    // первое появление каждого пункта в симуляции (для AMAF)
    st++;
    for (var t = 0; t < seq.length; t += 2) { var pp = seq[t]; if (stamp[pp] !== st) { stamp[pp] = st; firstAt[pp] = t; } }
    var c0 = s.turn;
    for (var dpt = 0; dpt < path.length; dpt++) {
      var nd = path[dpt], mover = (dpt % 2 === 1) ? c0 : 3 - c0;    // кто сделал ход nd.mv (с учётом пасов — по очереди)
      nd.n++; if (dpt > 0 && mover === bw) nd.w++;
      if (nd.kids) {
        var toMove = (dpt % 2 === 0) ? c0 : 3 - c0, from = 2 * dpt;
        for (var k = 0; k < nd.kids.length; k++) {
          var x = nd.kids[k]; if (x.mv < 0) continue;
          if (stamp[x.mv] === st && firstAt[x.mv] >= from - 0 && seq[firstAt[x.mv] + 1] === toMove) { x.an++; if (toMove === bw) x.aw++; }
        }
      }
    }
    sims++;
    if (sims > 400000) break;
  }
  var kids = root.kids.slice().sort(function (a, b) { return b.n - a.n; }), pick = kids[0];
  if (temp && kids.length > 1) {        // лёгкий уровень: иногда второй-третий по силе ход
    var top = kids.filter(function (x) { return x.n >= kids[0].n * .35 && x.mv >= 0; });
    if (top.length) pick = top[(goRnd() * Math.min(top.length, 4)) | 0];
  }
  var p = pick.n ? pick.w / pick.n : .5;
  var lead = leadSum / Math.max(1, sims);
  // пас против паса, если по честному счёту (с мёртвыми камнями) выигрываем
  if (s.passes === 1) {
    var est = goOwnership(s, 120), dead = goGuessDead(s, est.own), sc = goScore(s, dead);
    if ((s.turn === 1 && sc.diff > 0) || (s.turn === 2 && sc.diff < 0)) return { best: -1, p: Math.max(p, .9), lead: sc.diff, visits: sims };
  }
  return { best: pick.mv < 0 ? -1 : base.toI(pick.mv), p: p, lead: lead, visits: sims };
}
function goThink(s, level) { var L = GO_LEVELS[level]; var t = L.time * (s.N >= 17 ? 1.3 : 1); return goSearch(s, t, L.temp).best; }
function goAnalyze(s, ms) {
  if (s.over) { var sc = goScore(s, goGuessDead(s, goOwnership(s, 200).own)); return { p: (sc.diff > 0) === (s.turn === 1) ? 1 : 0, best: null, lead: sc.diff }; }
  var r = goSearch(s, ms || 800, 0);
  return { p: r.p, best: r.best, lead: r.lead };
}
