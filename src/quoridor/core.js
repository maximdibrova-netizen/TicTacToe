var Quoridor = (function () {
  'use strict';

  const SIZE = 9, SLOTS = 8, CELLS = 81;
  const DIRECTIONS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  // Seats start at the south, north, west and east edges.
  const STARTS = [76, 4, 36, 44];
  const ORDER = {2: [0, 1], 4: [0, 2, 1, 3]};
  const graphCache = new WeakMap(), routeCache = new WeakMap();
  const topology = Int16Array.from({length: CELLS * 4}, (_, edge) => {
    const cell = edge >> 2, [dr, dc] = DIRECTIONS[edge % 4];
    const r = Math.floor(cell / SIZE) + dr, c = cell % SIZE + dc;
    return r < 0 || c < 0 || r >= SIZE || c >= SIZE ? -1 : r * SIZE + c;
  });

  function create(count = 2) {
    if (count !== 2 && count !== 4) throw new RangeError('В Кворидоре играют вдвоём или вчетвером.');
    return {
      count, pawns: STARTS.slice(0, count), remaining: Array(count).fill(count === 2 ? 10 : 5),
      h: Array(64).fill(0), v: Array(64).fill(0),
      turn: 0, winner: null, draw: false, ply: 0, last: null
    };
  }

  function goal(seat, cell) {
    if (cell < 0) return false;
    return [cell < SIZE, cell >= CELLS - SIZE, cell % SIZE === SIZE - 1, cell % SIZE === 0][seat];
  }

  function graph(state) {
    let edges = graphCache.get(state);
    if (edges) return edges;
    edges = topology.slice();
    function block(cell, direction) {
      const other = edges[cell * 4 + direction];
      edges[cell * 4 + direction] = -1;
      if (other >= 0) edges[other * 4 + (direction + 2) % 4] = -1;
    }
    for (let i = 0; i < 64; i++) {
      const top = Math.floor(i / SLOTS) * SIZE + i % SLOTS;
      if (state.h[i]) { block(top, 2); block(top + 1, 2); }
      if (state.v[i]) { block(top, 1); block(top + SIZE, 1); }
    }
    graphCache.set(state, edges);
    return edges;
  }

  function route(state, seat) {
    let routes = routeCache.get(state);
    if (!routes) { routes = []; routeCache.set(state, routes); }
    if (routes[seat]) return routes[seat];
    const start = state.pawns[seat];
    if (start < 0) return [];
    const edges = graph(state), prev = new Int16Array(CELLS).fill(-1);
    const queue = new Int16Array(CELLS);
    let head = 0, tail = 1;
    queue[0] = start;
    prev[start] = start;
    while (head < tail) {
      let cell = queue[head++];
      if (goal(seat, cell)) {
        const path = [cell];
        while (cell !== start) { cell = prev[cell]; path.push(cell); }
        return routes[seat] = path.reverse();
      }
      for (let d = 0; d < 4; d++) {
        const to = edges[cell * 4 + d];
        if (to >= 0 && prev[to] < 0) { prev[to] = cell; queue[tail++] = to; }
      }
    }
    return routes[seat] = [];
  }

  function over(state) { return state.winner !== null || state.draw; }

  function pawnMoves(state, seat = state.turn) {
    const from = state.pawns[seat];
    if (from === undefined || from < 0 || over(state)) return [];
    const edges = graph(state), occupied = new Set(state.pawns.filter(p => p >= 0)), result = new Set();
    for (let d = 0; d < 4; d++) {
      const adjacent = edges[from * 4 + d];
      if (adjacent < 0) continue;
      if (!occupied.has(adjacent)) { result.add(adjacent); continue; }
      const beyond = edges[adjacent * 4 + d];
      if (beyond >= 0 && !occupied.has(beyond)) { result.add(beyond); continue; }
      // A wall, the board edge or a second pawn stops a straight jump.
      for (const side of [(d + 1) % 4, (d + 3) % 4]) {
        const around = edges[adjacent * 4 + side];
        if (around >= 0 && !occupied.has(around)) result.add(around);
      }
    }
    return [...result];
  }

  function wallCheck(state, dir, index) {
    if ((dir !== 'h' && dir !== 'v') || !Number.isInteger(index) || index < 0 || index >= 64) return 'outside';
    if (over(state)) return 'over';
    if (!state.remaining[state.turn]) return 'empty';
    const own = state[dir], other = state[dir === 'h' ? 'v' : 'h'];
    if (other[index]) return 'cross';
    const axis = dir === 'h' ? index % SLOTS : Math.floor(index / SLOTS);
    const stride = dir === 'h' ? 1 : SLOTS;
    if (own[index] || (axis > 0 && own[index - stride]) || (axis < 7 && own[index + stride])) return 'overlap';
    return null;
  }

  function withWall(state, dir, index) {
    const wall = state[dir].slice();
    wall[index] = state.turn + 1;
    const next = {...state, [dir]: wall};
    return state.pawns.every((cell, seat) => cell < 0 || route(next, seat).length) ? next : null;
  }

  function wallError(state, dir, index) {
    return wallCheck(state, dir, index) || (withWall(state, dir, index) ? null : 'blocked');
  }

  function nextSeat(state, seat) {
    const order = ORDER[state.count], from = order.indexOf(seat);
    for (let n = 1; n <= order.length; n++) {
      const next = order[(from + n) % order.length];
      if (state.pawns[next] >= 0) return next;
    }
    return seat;
  }

  function canMove(state) {
    if (pawnMoves(state).length) return true;
    if (state.remaining[state.turn]) {
      for (const dir of ['h', 'v']) for (let i = 0; i < 64; i++) {
        if (!wallCheck(state, dir, i) && withWall(state, dir, i)) return true;
      }
    }
    return false;
  }

  function passTrapped(state) {
    if (over(state) || canMove(state)) return state;
    const first = state.turn;
    do {
      state.turn = nextSeat(state, state.turn);
      if (canMove(state)) return state;
    } while (state.turn !== first);
    state.draw = true;
    return state;
  }

  function commit(previous, next, key) {
    next.last = key;
    next.ply++;
    next.turn = nextSeat(next, previous.turn);
    return passTrapped(next);
  }

  function play(state, key) {
    if (over(state) || typeof key !== 'string' || !/^[phv]:(0|[1-9]\d?)$/.test(key)) return null;
    const dir = key[0], index = Number(key.slice(2)), by = state.turn;
    if (dir === 'p') {
      if (!pawnMoves(state).includes(index)) return null;
      const pawns = state.pawns.slice();
      pawns[by] = index;
      return commit(state, {...state, pawns, winner: goal(by, index) ? by : null}, key);
    }
    if (wallCheck(state, dir, index)) return null;
    const next = withWall(state, dir, index);
    if (!next) return null;
    next.remaining = state.remaining.slice();
    next.remaining[by]--;
    return commit(state, next, key);
  }

  function settle(state, type, seat) {
    if (over(state)) return null;
    if (type === 'draw') return {...state, draw: true, ply: state.ply + 1, last: 'draw'};
    if (type !== 'resign' && type !== 'time') return null;
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.count || state.pawns[seat] < 0) return null;
    const pawns = state.pawns.slice();
    pawns[seat] = -1;
    const active = pawns.map((cell, i) => cell < 0 ? -1 : i).filter(i => i >= 0);
    const next = {...state, pawns, ply: state.ply + 1, last: type + ':' + seat, winner: active.length === 1 ? active[0] : null};
    if (next.turn === seat) next.turn = nextSeat(next, seat);
    return passTrapped(next);
  }

  function replay(count, keys) {
    if (!Array.isArray(keys) || keys.length > 2000) throw new Error('Некорректная запись партии.');
    let state = create(count);
    const line = [{s: state, mv: null, by: null}];
    for (const key of keys) {
      const by = state.turn;
      let next;
      if (key === 'draw') next = settle(state, 'draw');
      else if (typeof key === 'string' && /^(resign|time):[0-3]$/.test(key)) {
        const [type, seat] = key.split(':');
        next = settle(state, type, Number(seat));
      } else next = play(state, key);
      if (!next) throw new Error('В записи есть недопустимый ход.');
      line.push({s: next, mv: key, by});
      state = next;
    }
    return line;
  }

  function coord(cell) { return 'ABCDEFGHI'[cell % SIZE] + (SIZE - Math.floor(cell / SIZE)); }
  function notation(key) {
    if (key === 'draw') return 'Ничья';
    if (key.startsWith('resign:')) return 'Сдача';
    if (key.startsWith('time:')) return 'Время вышло';
    const [dir, raw] = key.split(':'), index = Number(raw);
    if (dir === 'p') return coord(index);
    return (dir === 'h' ? '↔ ' : '↕ ') + coord(Math.floor(index / SLOTS) * SIZE + index % SLOTS);
  }

  // Walls are assessed by the routes they change. A short lookahead accounts
  // for legal jumps and the opponent's best immediate reply.
  function score(state, seat) {
    if (over(state)) return state.draw ? 0 : state.winner === seat ? 10000 : -10000;
    if (state.pawns[seat] < 0) return -10000;
    const rival = Math.min(...state.pawns.flatMap((cell, other) =>
      other === seat || cell < 0 ? [] : [route(state, other).length - .26 * state.remaining[other]]));
    if (pawnMoves(state).some(cell => goal(state.turn, cell))) return state.turn === seat ? 8000 : -8000;
    return (rival - route(state, seat).length + .30 * state.remaining[seat]) * 3;
  }

  function rank(state, deadline) {
    const seat = state.turn, candidates = [];
    function add(key) {
      const child = play(state, key);
      if (child) candidates.push({key, child, value: score(child, seat) - (key[0] === 'p' ? 0 : .85)});
    }
    pawnMoves(state).forEach(cell => add('p:' + cell));
    if (state.remaining[seat]) {
      for (const dir of ['h', 'v']) for (let i = 0; i < 64 && Date.now() < deadline; i++) {
        if (!wallCheck(state, dir, i)) add(dir + ':' + i);
      }
    }
    return candidates.sort((a, b) => b.value - a.value);
  }

  function think(state, level = 1) {
    if (over(state)) return {best: null};
    const deadline = Date.now() + [80, 240, 520][level];
    const choices = rank(state, deadline);
    if (!choices.length) return {best: null};
    if (!level || choices[0].child.winner === state.turn) return {best: choices[0].key};
    let best = choices[0].key, bestValue = -Infinity;
    for (const option of choices.slice(0, level === 2 ? 9 : 4)) {
      if (Date.now() >= deadline) break;
      const reply = over(option.child) ? null : rank(option.child, deadline)[0];
      const value = reply ? score(reply.child, state.turn) - (option.key[0] === 'p' ? 0 : .85) : option.value;
      if (value > bestValue) { best = option.key; bestValue = value; }
    }
    return {best};
  }

  return {SIZE, SLOTS, create, goal, route, pawnMoves, wallError, play, settle, replay, over, coord, notation, think};
})();
if (typeof module !== 'undefined') module.exports = Quoridor;
