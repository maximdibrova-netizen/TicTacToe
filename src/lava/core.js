// Лава: правила, карты и бот. Общие для интерфейса, ботов и хозяина онлайн-партии.
//
// Поле 6 × 6, все клетки — плитки. Плитка держит 3 (белая), 2 (бежевая) или 1 (тёмная) прыжок; 0 — лава.
// Ход: прыжок по прямой (вверх/вправо/вниз/влево) на любое расстояние — над фишками и дырами,
// но приземлиться можно только на плитку. Плитка, с которой оттолкнулся, теряет слой.
// Назад — туда, откуда прилетел (или откуда тебя толкнули), — нельзя; прыжок на месте снимает запрет и тоже ломает плитку.
// Прыгнул на фишку — она (и все, кто стоит за ней вплотную) сдвигается на клетку дальше; в лаву — сгорает.
// Если за толкаемыми стена — толчок не проходит, и прыгнувший отскакивает на клетку перед ними.
// Сгорел — выбыл. Побеждает последний.
//
// Ход кодируется числом: 0 — на месте, иначе направление * 10 + расстояние (1 = вверх на 1, 23 = вниз на 3).
var Lava = (function () {
  'use strict';
  var SIZE = 6;
  var DIRS = [{ dr: -1, dc: 0, label: '↑' }, { dr: 0, dc: 1, label: '→' }, { dr: 1, dc: 0, label: '↓' }, { dr: 0, dc: -1, label: '←' }];
  // углы по часовой: 0 слева сверху, 1 справа сверху, 2 справа снизу, 3 слева снизу; ходят по часовой
  var START = [7, 10, 28, 25];
  function q(rows) { return rows.join('').split('').map(Number); }
  var MAPS = [
    { id: 'classic', name: 'Классика', note: 'Как в оригинале', tiles: q(['132231', '321123', '213312', '213312', '321123', '132231']) },
    { id: 'ring', name: 'Кольцо', note: 'Прочное кольцо вокруг хрупкого центра', tiles: q(['122221', '223322', '231132', '231132', '223322', '122221']) },
    { id: 'cross', name: 'Крест', note: 'Белые мосты по краям', tiles: q(['113311', '122221', '321123', '321123', '122221', '113311']) },
    { id: 'corners', name: 'Углы', note: 'Крепости в углах, середина тонкая', tiles: q(['331133', '322223', '121121', '121121', '322223', '331133']) },
    { id: 'diag', name: 'Диагонали', note: 'Острова на диагоналях', tiles: q(['312213', '121121', '213312', '213312', '121121', '312213']) },
    { id: 'core', name: 'Ядро', note: 'Мало белых — короткие партии', tiles: q(['112211', '121121', '213312', '213312', '121121', '112211']) },
    { id: 'random', name: 'Случайная', note: 'Новая симметричная карта каждую партию', tiles: null }
  ];
  function map(id) { for (var i = 0; i < MAPS.length; i++) if (MAPS[i].id === id) return MAPS[i]; return null; }
  function randomTiles() {
    var t = new Array(36), quad = [];
    for (var k = 0; k < 9; k++) { var r = Math.random(); quad.push(r < .27 ? 3 : r < .62 ? 2 : 1); }
    quad[4] = 2;   // клетка старта (1,1)
    for (var row = 0; row < 3; row++) for (var col = 0; col < 3; col++) {
      var v = quad[row * 3 + col];
      t[row * 6 + col] = t[row * 6 + 5 - col] = t[(5 - row) * 6 + col] = t[(5 - row) * 6 + 5 - col] = v;
    }
    return t;
  }
  function defaultCorners(n) { return n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]; }
  function setup(input) {
    if (typeof input === 'number') {
      if (input < 2 || input > 4 || input % 1) throw new Error('Нужно 2–4 игрока');
      return { mapId: 'classic', corners: defaultCorners(input), first: 0 };
    }
    if (!input || typeof input !== 'object' || !map(input.mapId || 'classic')) throw new Error('Неизвестная карта');
    var corners = input.corners;
    if (!Array.isArray(corners) || corners.length < 2 || corners.length > 4 || corners.some(function (c, i) { return typeof c !== 'number' || c % 1 || c < 0 || c > 3 || corners.indexOf(c) !== i; })) throw new Error('Выбери 2–4 разных угла');
    var sorted = corners.slice().sort(function (a, b) { return a - b; });
    if (sorted.join() !== corners.join()) throw new Error('Углы идут по часовой');
    var first = input.first === undefined ? 0 : input.first;
    if (typeof first !== 'number' || first % 1 || first < 0 || first >= corners.length) throw new Error('Неверный первый игрок');
    return { mapId: input.mapId || 'classic', corners: corners.slice(), first: first };
  }
  function create(input) {
    var cfg = setup(input), m = map(cfg.mapId), tiles = m.tiles ? m.tiles.slice() : randomTiles();
    cfg.corners.forEach(function (c) { if (tiles[START[c]] < 2) tiles[START[c]] = 2; });
    return { v: 3, size: SIZE, mapId: m.id, tiles: tiles,
      players: cfg.corners.map(function (c) { return { pos: START[c], corner: c, back: -1, alive: true }; }),
      turn: cfg.first, ply: 0, over: false, winner: null, last: null };
  }
  function corner(s, seat) { return s.players[seat].corner; }
  function rc(i) { return [Math.floor(i / SIZE), i % SIZE]; }
  function step(pos, d, k) {
    var p = rc(pos), r = p[0] + DIRS[d].dr * k, c = p[1] + DIRS[d].dc * k;
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1;
  }
  function who(s, pos) { for (var i = 0; i < s.players.length; i++) if (s.players[i].alive && s.players[i].pos === pos) return i; return -1; }
  function clone(s) {
    return { v: 3, size: s.size, mapId: s.mapId, tiles: s.tiles.slice(),
      players: s.players.map(function (p) { return { pos: p.pos, corner: p.corner, back: p.back, alive: p.alive }; }),
      turn: s.turn, ply: s.ply, over: s.over, winner: s.winner, last: null };
  }
  function decode(m) { return m === 0 ? { d: -1, n: 0 } : { d: Math.floor(m / 10), n: m % 10 }; }
  function code(d, n) { return n === 0 ? 0 : d * 10 + n; }
  // применить ход игрока seat (без проверки очереди); null — так нельзя
  function play(s, seat, m) {
    if (typeof m !== 'number' || m % 1 || m < 0) return null;
    var mv = decode(m), p = s.players[seat];
    if (!p || !p.alive) return null;
    var n = clone(s), me = n.players[seat], from = me.pos;
    var ev = { seat: seat, m: m, d: mv.d, from: from, land: from, to: from, kind: 'stay', pushed: [], fell: false, left: 0, killed: [] };
    if (mv.n === 0) {
      n.tiles[from]--; me.back = -1;
      if (n.tiles[from] <= 0) { me.alive = false; ev.fell = true; }
    } else {
      if (mv.d < 0 || mv.d > 3 || mv.n > SIZE - 1 || mv.d === p.back) return null;
      var land = step(from, mv.d, mv.n);
      if (land < 0 || s.tiles[land] <= 0) return null;
      ev.land = land;
      var chain = [], c = land, o;
      while (c >= 0 && (o = who(s, c)) >= 0 && o !== seat) { chain.push(o); c = step(c, mv.d, 1); }
      n.tiles[from]--; me.back = (mv.d + 2) % 4;
      if (!chain.length) { me.pos = land; ev.kind = mv.n === 1 ? 'step' : 'jump'; }
      else if (c < 0) {                       // за толкаемыми стена — отскок
        var b = step(land, (mv.d + 2) % 4, 1);
        if (b !== from && who(s, b) >= 0) return null;
        me.pos = b; ev.kind = 'bounce';
        if (n.tiles[b] <= 0) { me.alive = false; ev.fell = true; }
      } else {
        for (var k = chain.length - 1; k >= 0; k--) {
          var q2 = n.players[chain[k]], was = q2.pos; q2.pos = step(was, mv.d, 1); q2.back = (mv.d + 2) % 4;   // назад, к толкнувшему, — нельзя
          var burn = n.tiles[q2.pos] <= 0;
          if (burn) { q2.alive = false; ev.killed.push(chain[k]); }
          ev.pushed.unshift({ seat: chain[k], from: was, to: q2.pos, fell: burn });
        }
        me.pos = land; ev.kind = 'push';
      }
    }
    ev.to = me.pos; ev.left = n.tiles[from];
    n.ply++; n.last = ev;
    var alive = [];
    n.players.forEach(function (x, i) { if (x.alive) alive.push(i); });
    if (alive.length <= 1) { n.over = true; n.winner = alive.length ? alive[0] : null; n.turn = -1; return n; }
    for (var t = 1; t <= n.players.length; t++) { var nx = (seat + t) % n.players.length; if (n.players[nx].alive) { n.turn = nx; break; } }
    return n;
  }
  function codes(s, seat) {
    var p = s.players[seat], out = [0];
    if (!p || !p.alive) return [];
    for (var d = 0; d < 4; d++) if (d !== p.back) for (var k = 1; k < SIZE; k++) { var to = step(p.pos, d, k); if (to < 0) break; if (s.tiles[to] > 0) out.push(code(d, k)); }
    return out;
  }
  // все ходы с последствиями: {m, d, n, to (куда встанешь), land (куда прыгаешь), kind, fatal, kills}
  function moves(s, seat) {
    if (s.over || !s.players[seat] || !s.players[seat].alive) return [];
    var res = [];
    codes(s, seat).forEach(function (m) {
      var n = play(s, seat, m); if (!n) return;
      var e = n.last;
      res.push({ m: m, d: e.d, n: m % 10, to: e.to, land: e.land, kind: e.kind, fatal: e.fell, kills: e.killed.slice() });
    });
    return res;
  }
  function apply(s, m) {
    if (!s || s.over) return null;
    return play(s, s.turn, m);
  }
  // ---------- бот ----------
  function safeCount(s, seat) {
    var c = 0; codes(s, seat).forEach(function (m) { var n = play(s, seat, m); if (n && !n.last.fell) c++; }); return c;
  }
  function canKill(s, opp, me) {
    var cs = codes(s, opp);
    for (var i = 0; i < cs.length; i++) { var n = play(s, opp, cs[i]); if (n && !n.players[me].alive) return true; }
    return false;
  }
  function score(s, n, me, rnd) {
    var p = n.players[me];
    if (!p.alive) return -100000;
    if (n.over) return n.winner === me ? 100000 : -100000;
    var v = n.last.killed.length * 4000 + n.tiles[p.pos] * 14 + safeCount(n, me) * 9 + rnd() * 6;
    n.players.forEach(function (o, i) {
      if (i === me || !o.alive) return;
      if (canKill(n, i, me)) v -= 2600;
      v -= safeCount(n, i) * 3;
      if (n.tiles[o.pos] === 1) v += 6;
    });
    if (n.last.kind === 'stay') v -= 4;
    return v;
  }
  function bot(s, rnd) {
    rnd = rnd || Math.random;
    var me = s.turn, best = null, bestV = -Infinity;
    codes(s, me).forEach(function (m) {
      var n = play(s, me, m); if (!n) return;
      var v = score(s, n, me, rnd);
      if (v > bestV) { bestV = v; best = m; }
    });
    return best;
  }
  function valid(s) {
    if (!s || typeof s !== 'object' || s.v !== 3 || s.size !== SIZE || !map(s.mapId)) return false;
    if (!Array.isArray(s.tiles) || s.tiles.length !== 36 || !s.tiles.every(function (t) { return t === 0 || t === 1 || t === 2 || t === 3; })) return false;
    if (!Array.isArray(s.players) || s.players.length < 2 || s.players.length > 4) return false;
    if (typeof s.ply !== 'number' || s.ply % 1 || s.ply < 0 || s.ply > 400 || typeof s.over !== 'boolean') return false;
    var pos = {}, cs = {}, alive = 0, prev = -1;
    for (var i = 0; i < s.players.length; i++) {
      var p = s.players[i];
      if (!p || typeof p.pos !== 'number' || p.pos % 1 || p.pos < 0 || p.pos > 35 || [-1, 0, 1, 2, 3].indexOf(p.back) < 0 || typeof p.alive !== 'boolean') return false;
      if ([0, 1, 2, 3].indexOf(p.corner) < 0 || cs[p.corner] || p.corner <= prev) return false;
      cs[p.corner] = 1; prev = p.corner;
      if (p.alive) { if (!s.tiles[p.pos] || pos[p.pos]) return false; pos[p.pos] = 1; alive++; }
    }
    if (s.over) return s.turn === -1 && alive <= 1 && (alive === 0 ? s.winner === null : typeof s.winner === 'number' && !!s.players[s.winner] && s.players[s.winner].alive);
    return alive >= 2 && typeof s.turn === 'number' && !!s.players[s.turn] && s.players[s.turn].alive && s.winner === null;
  }
  return { SIZE: SIZE, DIRS: DIRS, MAPS: MAPS, START: START, map: map, setup: setup, create: create, corner: corner,
    step: step, rc: rc, who: who, code: code, decode: decode, moves: moves, apply: apply, play: play, bot: bot, valid: valid, startCells: function () { return START.slice(); } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Lava;
