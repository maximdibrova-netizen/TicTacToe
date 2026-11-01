// ===== Крестики-нолики 3×3 из 3×3: правила и бот (общий код для страницы и воркера) =====
// Клетка i = доска*9 + клетка_на_доске (обе от 0 до 8, слева направо, сверху вниз).
// Правила Ultimate tic-tac-toe: клетка, в которую ты сходил, задаёт доску, где ходит соперник (next).
// Если эта доска уже выиграна или заполнена — соперник ходит в любую открытую доску (next = -1).
// cells: 0 пусто, 1 крестик, 2 нолик. boards: 0 идёт игра, 1/2 захвачена, 3 ничья (ничья ни за кем).
var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
var LINES_OF = [[], [], [], [], [], [], [], [], []];
LINES.forEach(function (l, k) { l.forEach(function (c) { LINES_OF[c].push(k); }); });

function newState(first) {
  return { cells: new Int8Array(81), boards: new Int8Array(9), turn: first || 1, winner: 0, line: null, moves: 0, next: -1 };
}
function cloneState(s) {
  return { cells: s.cells.slice(), boards: s.boards.slice(), turn: s.turn, winner: s.winner, line: s.line, moves: s.moves, next: s.next };
}
function legal(s, i) { var b = (i / 9) | 0; return !s.winner && s.cells[i] === 0 && s.boards[b] === 0 && (s.next < 0 || s.next === b); }
function canEnter(s, b) { return s.boards[b] === 0 && (s.next < 0 || s.next === b); }
function legalMoves(s) {
  var out = [];
  if (s.winner) return out;
  for (var b = 0; b < 9; b++) if (canEnter(s, b)) for (var c = 0; c < 9; c++) if (s.cells[b * 9 + c] === 0) out.push(b * 9 + c);
  return out;
}
function smallLineWon(cells, b, c, p) {
  var base = b * 9, ls = LINES_OF[c];
  for (var k = 0; k < ls.length; k++) { var l = LINES[ls[k]]; if (cells[base + l[0]] === p && cells[base + l[1]] === p && cells[base + l[2]] === p) return l; }
  return null;
}
// ход: возвращает { boardWon: p|3|0, smallLine } для анимации
function play(s, i) {
  var p = s.turn, b = (i / 9) | 0, c = i % 9, res = { boardWon: 0, smallLine: null };
  s.cells[i] = p; s.moves++;
  var l = smallLineWon(s.cells, b, c, p);
  if (l) { s.boards[b] = p; res.boardWon = p; res.smallLine = l; }
  else {
    var full = true;
    for (var k = 0; k < 9; k++) if (s.cells[b * 9 + k] === 0) { full = false; break; }
    if (full) { s.boards[b] = 3; res.boardWon = 3; }
  }
  if (res.boardWon === p) {
    var ls = LINES_OF[b];
    for (k = 0; k < ls.length; k++) { var L = LINES[ls[k]]; if (s.boards[L[0]] === p && s.boards[L[1]] === p && s.boards[L[2]] === p) { s.winner = p; s.line = L; break; } }
  }
  if (!s.winner && res.boardWon) {
    var open = false;
    for (k = 0; k < 9; k++) if (s.boards[k] === 0) { open = true; break; }
    if (!open) s.winner = 3;                       // все доски решены, линии нет — ничья
    else if (!bigLinePossible(s)) s.winner = 3;     // никто уже не может собрать линию
  }
  s.next = s.boards[c] === 0 ? c : -1;      // куда отправлен соперник
  s.turn = 3 - p;
  return res;
}
function bigLinePossible(s) {
  for (var k = 0; k < 8; k++) {
    var l = LINES[k], a = s.boards[l[0]], b = s.boards[l[1]], c = s.boards[l[2]];
    for (var p = 1; p <= 2; p++) if ((a === 0 || a === p) && (b === 0 || b === p) && (c === 0 || c === p)) return true;
  }
  return false;
}

// ---------- оценка ----------
// Для открытой маленькой доски: насколько вероятно, что её возьмёт p (грубая эвристика по линиям).
function boardChance(cells, b, p, toMove) {
  var base = b * 9, q = 3 - p, mine = 0, theirs = 0, myThreats = 0, theirThreats = 0;
  for (var k = 0; k < 8; k++) {
    var l = LINES[k], np = 0, nq = 0;
    for (var t = 0; t < 3; t++) { var v = cells[base + l[t]]; if (v === p) np++; else if (v === q) nq++; }
    if (nq === 0) { mine += np === 2 ? 9 : np === 1 ? 3 : 1; if (np === 2) myThreats++; }
    if (np === 0) { theirs += nq === 2 ? 9 : nq === 1 ? 3 : 1; if (nq === 2) theirThreats++; }
  }
  if (mine === 0 && theirs === 0) return 0;      // мёртвая доска: будет ничья
  // угроза того, кто ходит, почти гарантирована; две угрозы сразу (вилка) — тоже
  if (myThreats && toMove === p) return 0.95;
  if (myThreats >= 2 && !(theirThreats && toMove === q)) return 0.85;
  if (theirThreats && toMove === q) return 0.03;
  return mine / (mine + theirs + 2);
}
// оценка с точки зрения игрока p, ход за s.turn
function evaluate(s, p) {
  if (s.winner) return s.winner === p ? 1e5 : s.winner === 3 ? 0 : -1e5;
  var q = 3 - p, cp = new Float64Array(9), cq = new Float64Array(9), b;
  for (b = 0; b < 9; b++) {
    var st = s.boards[b];
    if (st === p) { cp[b] = 1; cq[b] = 0; }
    else if (st === q) { cp[b] = 0; cq[b] = 1; }
    else if (st === 3) { cp[b] = 0; cq[b] = 0; }
    else { var tm = canEnter(s, b) ? s.turn : 0; cp[b] = boardChance(s.cells, b, p, tm); cq[b] = boardChance(s.cells, b, q, tm); }
  }
  var sp = 0, sq = 0, wp = 0, wq = 0;
  for (var k = 0; k < 8; k++) {
    var l = LINES[k];
    var vp = cp[l[0]] * cp[l[1]] * cp[l[2]], vq = cq[l[0]] * cq[l[1]] * cq[l[2]];
    sp += vp; sq += vq;
    if (vp > wp) wp = vp; if (vq > wq) wq = vq;
  }
  var mat = 0;
  for (b = 0; b < 9; b++) mat += (cp[b] - cq[b]) * (b === 4 ? 1.4 : (b % 2 === 0 ? 1.15 : 1));
  var free = s.next < 0 ? (s.turn === p ? 14 : -14) : 0;   // свобода выбора доски — преимущество
  return 260 * (sp - sq) + 520 * (wp - wq) + 18 * mat + free;
}

// ---------- порядок ходов ----------
function moveScore(s, i) {
  var p = s.turn, q = 3 - p, b = (i / 9) | 0, c = i % 9, base = b * 9, sc = 0;
  var ls = LINES_OF[c];
  for (var k = 0; k < ls.length; k++) {
    var l = LINES[ls[k]], np = 0, nq = 0;
    for (var t = 0; t < 3; t++) { var j = base + l[t]; if (j === i) continue; if (s.cells[j] === p) np++; else if (s.cells[j] === q) nq++; }
    if (np === 2) sc += 1000;          // берёт доску
    else if (nq === 2) sc += 600;      // не даёт сопернику взять доску
    else if (nq === 0 && np === 1) sc += 40;   // делает угрозу
    else if (np === 0 && nq === 1) sc += 8;
  }
  // важность доски на большом поле
  var bl = LINES_OF[b], imp = 0;
  for (k = 0; k < bl.length; k++) {
    var L = LINES[bl[k]], okp = true, okq = true;
    for (t = 0; t < 3; t++) { var v = s.boards[L[t]]; if (v === q || v === 3) okp = false; if (v === p || v === 3) okq = false; }
    if (okp) imp += 2; if (okq) imp += 1;
  }
  sc *= 1 + imp * 0.12;
  sc += (c === 4 ? 6 : c % 2 === 0 ? 4 : 2) + (b === 4 ? 3 : b % 2 === 0 ? 2 : 1);
  // куда этот ход отправит соперника
  var sendTo = c, closes = sc >= 1000 && b === c;           // если берём доску c и она же цель — она закроется
  if (s.boards[sendTo] !== 0 || closes) sc -= 120;           // соперник получит свободный ход
  else {
    var tb = sendTo * 9;
    for (k = 0; k < 8; k++) {
      var L2 = LINES[k], nq2 = 0, np2 = 0, e2 = 0;
      for (t = 0; t < 3; t++) { var v2 = s.cells[tb + L2[t]]; if (v2 === q) nq2++; else if (v2 === p) np2++; else e2++; }
      if (nq2 === 2 && e2 === 1) { sc -= 700; break; }       // там соперник сразу возьмёт доску
    }
  }
  return sc;
}
function tacticalMove(s, i) {
  var p = s.turn, q = 3 - p, b = (i / 9) | 0, c = i % 9, base = b * 9, ls = LINES_OF[c];
  for (var k = 0; k < ls.length; k++) {
    var l = LINES[ls[k]], np = 0, nq = 0;
    for (var t = 0; t < 3; t++) { var j = base + l[t]; if (j === i) continue; if (s.cells[j] === p) np++; else if (s.cells[j] === q) nq++; }
    if (np === 2 || nq === 2) return true;
  }
  return false;
}

// ---------- поиск ----------
var TTT_LEVELS = [
  { name: 'Лёгкий', time: 120, depth: 1, beam: 99, noise: 90 },
  { name: 'Средний', time: 400, depth: 4, beam: 10, noise: 12 },
  { name: 'Сильный', time: 1500, depth: 14, beam: 14, noise: 0.5 }
];
function tttThink(s0, levelIdx) {
  var L = TTT_LEVELS[levelIdx], me = s0.turn, deadline = Date.now() + L.time, nodes = 0, ABORT = {};
  var moves = legalMoves(s0);
  if (moves.length === 1) return moves[0];
  function ordered(s) {
    var mv = legalMoves(s), arr = mv.map(function (i) { return { i: i, k: moveScore(s, i) }; });
    arr.sort(function (a, b) { return b.k - a.k; });
    return arr;
  }
  function negamax(s, depth, alpha, beta, ply) {
    if ((++nodes & 255) === 0 && Date.now() > deadline) throw ABORT;
    if (s.winner) return (s.winner === 3 ? 0 : (s.winner === s.turn ? 1e5 - ply : -1e5 + ply));
    if (depth <= 0) return evaluate(s, s.turn);
    var arr = ordered(s), best = -Infinity;
    if (arr.length > L.beam) {
      var keep = arr.slice(0, L.beam);
      for (var z = L.beam; z < arr.length; z++) if (tacticalMove(s, arr[z].i)) keep.push(arr[z]);
      arr = keep;
    }
    for (var a = 0; a < arr.length; a++) {
      var t = cloneState(s); play(t, arr[a].i);
      var v = -negamax(t, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  var root = ordered(s0), scores = {}, bestMove = root[0].i;
  for (var d = 1; d <= L.depth; d++) {
    try {
      var bv = -Infinity, res = [];
      for (var a = 0; a < root.length; a++) {
        var t = cloneState(s0); play(t, root[a].i);
        // values above (best - noise) are exact; the rest only need to be shown worse
        var v = -negamax(t, d - 1, -Infinity, -(bv - L.noise - 1), 1);
        res.push({ i: root[a].i, v: v });
        if (v > bv) bv = v;
      }
      res.sort(function (x, y) { return y.v - x.v; });
      root = res.map(function (r) { return { i: r.i, k: r.v }; });
      // случайный выбор среди почти равных лучших (для слабых уровней — среди широкого круга)
      var good = res.filter(function (r) { return r.v >= bv - L.noise; });
      bestMove = good[Math.floor(Math.random() * good.length)].i;
      tttThink.depth = d;
      if (bv > 5e4) break;
    } catch (e) { if (e !== ABORT) throw e; break; }
    if (Date.now() > deadline) break;
  }
  return bestMove;
}
