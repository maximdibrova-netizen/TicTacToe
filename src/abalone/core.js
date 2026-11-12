// Abalone classic: radius-four hexagon, 14 marbles per side, six ejections to win.
var Abalone = (function () {
  'use strict';
  var dirs=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]],cells=[],lookup={};
  for(var r=-4;r<=4;r++)for(var q=-4;q<=4;q++)if(Math.abs(q+r)<=4){lookup[q+','+r]=cells.length;cells.push({q:q,r:r,name:'IHGFEDCBA'[r+4]+(q+5)});}
  function index(q,r){var n=lookup[q+','+r];return n==null?-1:n;}
  var next=cells.map(function(c){return dirs.map(function(d){return index(c.q+d[0],c.r+d[1]);});});
  function rows(spec){var out=[];Object.keys(spec).forEach(function(r){spec[r].forEach(function(q){out.push(index(q,+r));});});return out;}
  var setups=[
    {name:'Стандартная',black:rows({4:[-4,-3,-2,-1,0],3:[-4,-3,-2,-1,0,1],2:[-2,-1,0]})},
    {name:'Клин',black:rows({4:[-2],3:[-3,-2,-1],2:[-4,-3,-2,-1,0],1:[-4,-3,-2,-1,0]})},
    {name:'Широкий фронт',black:rows({1:[-4,-3,-2,-1,0,1,2,3],2:[-4,-3,-2,-1,0,1]})},
    {name:'Крепость',black:rows({4:[-4,-3,-2,-1,0],3:[-4,-3,0,1],2:[-4,-3,-2,0,1]})},
    {name:'Двойное крыло',black:rows({4:[-4,-3,-1,0],3:[-4,-3,0,1],2:[-4,-3,1,2],1:[-4,3]})},
    {name:'Ступени',black:rows({4:[-4,-3,-2],3:[-3,-2,-1,0],2:[-2,-1,0,1],1:[-1,0,1]})},
    {name:'Полумесяц',black:rows({4:[-4,-3,-2,-1,0],3:[-4,1],2:[-4,-3,1,2],1:[-4,-3,3]})},
    {name:'Косой клин',black:[]},
    {name:'Лестница',black:rows({4:[-4,-3],3:[-4,-3,-2,-1],2:[-3,-2,-1,0],1:[-2,-1,0,1]})},
    {name:'Центральный остров',black:rows({1:[-3,-2,-1,0,1],2:[-3,-2,-1,0,1],3:[-3,-2,-1,0]})}
  ];
  setups[7].black=setups[1].black.map(function(i){var c=cells[i];return index(-c.r,c.q+c.r);});
  function create(setup){var n=Number.isInteger(setup)&&setup>=0&&setup<setups.length?setup:0,b=new Int8Array(61);setups[n].black.forEach(function(i){b[i]=1;var c=cells[i];b[index(-c.q,-c.r)]=2;});return{b:b,turn:1,lost:[0,0,0],winner:0,plies:0,path:[],setup:n};}
  function clone(s){return{b:Int8Array.from(s.b),turn:s.turn,lost:s.lost.slice(),winner:s.winner||0,plies:s.plies||0,path:(s.path||[]).slice(),setup:s.setup||0};}
  function groupAxis(group){
    if(group.length===1)return -1;
    for(var d=0;d<3;d++){var start=group.find(function(i){return group.indexOf(next[i][d+3])<0;}),i=start,n=0;while(i>=0&&group.indexOf(i)>=0){n++;i=next[i][d];}if(n===group.length)return d;}
    return -2;
  }
  function decode(m){if(typeof m==='string'){if(!/^\d+(?:,\d+){0,2}:[0-5]$/.test(m))return null;var parts=m.split(':');return{cells:parts[0].split(',').map(Number),dir:+parts[1]};}return m&&Array.isArray(m.cells)?{cells:m.cells.slice(),dir:m.dir}:null;}
  function legal(s,input){
    var m=decode(input);if(!m||s.winner||!Number.isInteger(m.dir)||m.dir<0||m.dir>5||!m.cells.length||m.cells.length>3)return null;
    var group=m.cells.sort(function(a,b){return a-b;});if(group.some(function(i,k){return !Number.isInteger(i)||i<0||i>=61||s.b[i]!==s.turn||k&&i===group[k-1];}))return null;
    var axis=groupAxis(group);if(axis===-2)return null;
    var d=m.dir,push=[],out=false,inline=axis===-1||d%3===axis;
    if(inline){
      var front=group.find(function(i){return group.indexOf(next[i][d])<0;}),to=next[front][d];if(to<0)return null;
      if(s.b[to]===s.turn)return null;
      while(to>=0&&s.b[to]===3-s.turn){push.push(to);to=next[to][d];}
      if(push.length&&(push.length>=group.length||to>=0&&s.b[to]!==0))return null;
      out=push.length>0&&to<0;
    }else if(group.some(function(i){var to=next[i][d];return to<0||s.b[to]!==0;}))return null;
    return{cells:group,dir:d,push:push,out:out,key:group.join(',')+':'+d};
  }
  function applyKnown(s,m,history){
    var n=clone(s),side=s.turn;
    m.cells.forEach(function(i){n.b[i]=0;});m.push.forEach(function(i){n.b[i]=0;});
    m.push.forEach(function(i){var to=next[i][m.dir];if(to>=0)n.b[to]=3-side;});
    m.cells.forEach(function(i){n.b[next[i][m.dir]]=side;});
    if(m.out){n.lost[3-side]++;if(n.lost[3-side]>=6)n.winner=side;}
    n.turn=3-side;n.plies++;n.last=m.key;n.path=history?(s.path||[]).concat([m.key]):[];return n;
  }
  function play(s,input){var m=legal(s,input);return m?applyKnown(s,m,true):null;}
  function moves(s){
    if(s.winner)return[];var groups=[],out=[];
    for(var i=0;i<61;i++)if(s.b[i]===s.turn){groups.push([i]);for(var d=0;d<3;d++){var j=next[i][d];if(j>=0&&s.b[j]===s.turn){groups.push([i,j]);var k=next[j][d];if(k>=0&&s.b[k]===s.turn)groups.push([i,j,k]);}}}
    groups.forEach(function(g){for(var d=0;d<6;d++){var m=legal(s,{cells:g,dir:d});if(m)out.push(m);}});return out;
  }
  function key(s){return s.turn+':'+s.lost.join(',')+':'+Array.prototype.join.call(s.b,'');}
  function notation(input){var m=decode(input);if(!m)return'';var group=m.cells.slice().sort(function(a,b){return a-b;});return group.map(function(i){return cells[i].name;}).join('·')+' '+['→','↘','↙','←','↖','↗'][m.dir];}
  function value(s,side){
    if(s.winner)return s.winner===side?100000:-100000;
    var score=(s.lost[3-side]-s.lost[side])*950;
    for(var i=0;i<61;i++)if(s.b[i]){var c=cells[i],dist=Math.max(Math.abs(c.q),Math.abs(c.r),Math.abs(c.q+c.r)),friends=0;for(var d=0;d<6;d++)if(next[i][d]>=0&&s.b[next[i][d]]===s.b[i])friends++;var v=(4-dist)*14+friends*5-(dist===4?28:0)-(friends===0?18:0);score+=(s.b[i]===side?1:-1)*v;}
    return score;
  }
  // Бот: перебор с отсечениями на одной изменяемой доске, таблица позиций, продление по выталкиваниям.
  // Оценка: вытолкнутые шары, близость к центру, сплочённость и шары, которые можно вытолкнуть прямо сейчас.
  var engine=(function(A){
var N = 61, next = A.next, cells = A.cells, WIN = 1000000;
  var DIST = cells.map(function (c) { return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)); });
  var P = { off: 1000, center: 13, coh: 3.5, danger: 260, threat: 120 };
  var Z = new Int32Array(N * 3), Z2 = new Int32Array(N * 3), seed = 0x2545f491;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  for (var i = 0; i < Z.length; i++) { Z[i] = rnd(); Z2[i] = rnd(); }
  var TB = 20, TS = 1 << TB, TM = TS - 1;
  var tk = new Int32Array(TS), tv = new Int32Array(TS), td = new Int8Array(TS), tf = new Int8Array(TS), tmv = new Int32Array(TS);
  var b = new Int8Array(N), lost = [0, 0, 0], h1 = 0, h2 = 0, nodes = 0, deadline = 0, stop = false;
  // move encoding (int): cells c0,c1,c2 (+1, 0 = none) 6 bits each, dir 3 bits, flags
  function enc(c0, c1, c2, d) { return ((c0 + 1) | ((c1 + 1) << 6) | ((c2 + 1) << 12) | (d << 18)); }
  function gen(p, out) {
    var q = 3 - p, n = 0, i, d, a, j, k, to;
    for (i = 0; i < N; i++) {
      if (b[i] !== p) continue;
      for (d = 0; d < 6; d++) { to = next[i][d]; if (to >= 0 && b[to] === 0) out[n++] = enc(i, -1, -1, d); }
      for (a = 0; a < 3; a++) {
        j = next[i][a]; if (j < 0 || b[j] !== p) continue;
        for (var len = 2; len <= 3; len++) {
          var g0 = i, g1 = j, g2 = -1;
          if (len === 3) { k = next[j][a]; if (k < 0 || b[k] !== p) break; g2 = k; }
          var last = len === 3 ? g2 : g1;
          for (d = 0; d < 6; d++) {
            if (d === a || d === a + 3) {
              var front = d === a ? last : g0; to = next[front][d];
              if (to < 0 || b[to] === p) continue;
              if (b[to] === 0) { out[n++] = enc(g0, g1, g2, d); continue; }
              var m = 0, t = to; while (t >= 0 && b[t] === q && m < 3) { m++; t = next[t][d]; }
              if (m < len && (t < 0 || b[t] === 0)) out[n++] = enc(g0, g1, g2, d);
            } else {
              if (next[g0][d] >= 0 && b[next[g0][d]] === 0 && next[g1][d] >= 0 && b[next[g1][d]] === 0 && (g2 < 0 || (next[g2][d] >= 0 && b[next[g2][d]] === 0))) out[n++] = enc(g0, g1, g2, d);
            }
          }
        }
      }
    }
    return n;
  }
  var undoBuf = new Int32Array(64 * 16), undoTop = 0;
  function setCell(x, v) { var o = b[x]; if (o) { h1 ^= Z[x * 3 + o]; h2 ^= Z2[x * 3 + o]; } b[x] = v; if (v) { h1 ^= Z[x * 3 + v]; h2 ^= Z2[x * 3 + v]; } }
  // returns number of undo entries written; ejected marble recorded with x = -1
  function make(mv, p) {
    var c0 = (mv & 63) - 1, c1 = ((mv >> 6) & 63) - 1, c2 = ((mv >> 12) & 63) - 1, d = (mv >> 18) & 7, q = 3 - p, start = undoTop;
    var grp = c1 < 0 ? [c0] : c2 < 0 ? [c0, c1] : [c0, c1, c2];
    var inline = grp.length === 1 || (next[grp[0]][d] === grp[1] || next[grp[1]][(d + 3) % 6] === grp[0]);
    if (grp.length > 1) { var ax = -1; for (var aa = 0; aa < 3; aa++) if (next[grp[0]][aa] === grp[1]) ax = aa; inline = d === ax || d === ax + 3; }
    function rec(x) { undoBuf[undoTop++] = x; undoBuf[undoTop++] = b[x]; }
    if (inline) {
      var front = grp[0]; for (var gi = 0; gi < grp.length; gi++) { var c = grp[gi], nx = next[c][d]; if (grp.indexOf(nx) < 0) front = c; }
      var t = next[front][d], chain = [];
      while (t >= 0 && b[t] === q) { chain.push(t); t = next[t][d]; }
      // shift opponents from the far end
      for (var ci = chain.length - 1; ci >= 0; ci--) {
        var from = chain[ci], dest = next[from][d];
        if (dest < 0) { undoBuf[undoTop++] = -1; undoBuf[undoTop++] = q; lost[q]++; rec(from); setCell(from, 0); }
        else { rec(dest); setCell(dest, q); rec(from); setCell(from, 0); }
      }
      // move own line: tail → empty, front+1 → own
      var tail = grp[0]; for (gi = 0; gi < grp.length; gi++) { var cc = grp[gi], pv = next[cc][(d + 3) % 6]; if (grp.indexOf(pv) < 0) tail = cc; }
      var dst = next[front][d]; rec(dst); setCell(dst, p); rec(tail); setCell(tail, 0);
    } else {
      for (gi = 0; gi < grp.length; gi++) { rec(grp[gi]); setCell(grp[gi], 0); }
      for (gi = 0; gi < grp.length; gi++) { var to = next[grp[gi]][d]; rec(to); setCell(to, p); }
    }
    return start;
  }
  function unmake(start) {
    while (undoTop > start) { var v = undoBuf[--undoTop], x = undoBuf[--undoTop]; if (x < 0) lost[v]--; else setCell(x, v); }
  }
  // marbles of side p that the opponent could push off the board with one move
  function exposed(p) {
    var q = 3 - p, n = 0;
    for (var i = 0; i < N; i++) {
      if (b[i] !== p || DIST[i] !== 4) continue;
      for (var d = 0; d < 6; d++) {
        if (next[i][d] >= 0) continue;               // direction off the board
        var back = (d + 3) % 6, own = 1, t = next[i][back];
        while (t >= 0 && b[t] === p && own < 3) { own++; t = next[t][back]; }
        if (own >= 3 || (t >= 0 && b[t] === p)) continue;
        var opp = 0; while (t >= 0 && b[t] === q && opp < 3) { opp++; t = next[t][back]; }
        if (opp > own) { n++; break; }
      }
    }
    return n;
  }
  function evaluate(p) {
    var q = 3 - p, v = (lost[q] - lost[p]) * P.off, coh = 0;
    for (var i = 0; i < N; i++) {
      var x = b[i]; if (!x) continue;
      var s = (4 - DIST[i]) * P.center;
      for (var d = 0; d < 3; d++) { var j = next[i][d]; if (j >= 0 && b[j] === x) s += P.coh * 2; }
      v += x === p ? s : -s;
    }
    // side to move can cash in on its own threats; the opponent's threats against us are only potential
    v += exposed(q) * P.threat * 2 - exposed(p) * P.danger;
    return v | 0;
  }
  var killers = new Int32Array(64 * 2);
  function search(depth, alpha, beta, p, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    var q = 3 - p;
    if (lost[p] >= 6) return -(WIN - ply);
    if (lost[q] >= 6) return WIN - ply;
    if (depth <= 0) return quiesce(alpha, beta, p, ply, 2);
    var slot = h1 & TM, ttMove = 0, a0 = alpha;
    if (tk[slot] === (h2 ^ p)) {
      ttMove = tmv[slot];
      if (td[slot] >= depth) { var val = tv[slot], f = tf[slot]; if (f === 0) return val; if (f === 1 && val > alpha) alpha = val; else if (f === 2 && val < beta) beta = val; if (alpha >= beta) return val; }
    }
    var list = new Int32Array(160), n = gen(p, list), sc = new Float64Array(n);
    var before = lost[q];
    for (var i = 0; i < n; i++) {
      var mv = list[i], s = 0;
      if (mv === ttMove) s = 1e9; else if (mv === killers[ply * 2] || mv === killers[ply * 2 + 1]) s = 1e8;
      else {
        var st = make(mv, p);
        s = (lost[q] - before) * 1e7;
        // cheap ordering: centre gain of the moved group
        s += -exposed(p) * 1000 + groupCenter(mv);
        unmake(st);
      }
      sc[i] = s;
    }
    // selection sort as we go
    var best = -Infinity, bestMv = 0;
    for (i = 0; i < n; i++) {
      var bi = i; for (var j = i + 1; j < n; j++) if (sc[j] > sc[bi]) bi = j;
      var tmp = list[i]; list[i] = list[bi]; list[bi] = tmp; var ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts;
      mv = list[i];
      var st2 = make(mv, p);
      var v = -search(depth - 1, -beta, -alpha, q, ply + 1);
      unmake(st2);
      if (stop) return 0;
      if (v > best) { best = v; bestMv = mv; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) { if (killers[ply * 2] !== mv) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = mv; } break; }
    }
    if (!n) return evaluate(p);
    tk[slot] = h2 ^ p; tv[slot] = best; td[slot] = depth; tmv[slot] = bestMv; tf[slot] = best <= a0 ? 2 : best >= beta ? 1 : 0;
    return best;
  }
  function groupCenter(mv) {
    var c0 = (mv & 63) - 1, c1 = ((mv >> 6) & 63) - 1, c2 = ((mv >> 12) & 63) - 1, d = (mv >> 18) & 7, s = 0;
    [c0, c1, c2].forEach(function (c) { if (c >= 0) { var t = next[c][d]; if (t >= 0) s += DIST[c] - DIST[t]; } });
    return s * 10 + (c2 >= 0 ? 3 : c1 >= 0 ? 1 : 0);
  }
  // only ejections are searched past the horizon
  function quiesce(alpha, beta, p, ply, left) {
    var stand = evaluate(p);
    if (left <= 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    var q = 3 - p, list = new Int32Array(160), n = gen(p, list), before = lost[q];
    for (var i = 0; i < n; i++) {
      var st = make(list[i], p);
      if (lost[q] > before) {
        var v = lost[q] >= 6 ? WIN - ply : -quiesce(-beta, -alpha, q, ply + 1, left - 1);
        unmake(st);
        if (v > alpha) alpha = v;
        if (alpha >= beta) return alpha;
      } else unmake(st);
    }
    return alpha;
  }
  function keyOf(mv) {
    var c = [(mv & 63) - 1, ((mv >> 6) & 63) - 1, ((mv >> 12) & 63) - 1].filter(function (x) { return x >= 0; }).sort(function (x, y) { return x - y; });
    return c.join(',') + ':' + ((mv >> 18) & 7);
  }
  function think(s, maxDepth, ms, noise, progress) {
    b.set(s.b); lost = s.lost.slice(); h1 = 0; h2 = 0;
    for (var i = 0; i < N; i++) if (b[i]) { h1 ^= Z[i * 3 + b[i]]; h2 ^= Z2[i * 3 + b[i]]; }
    var p = s.turn, list = new Int32Array(160), n = gen(p, list);
    if (s.winner || !n) return { best: null, v: 0, depth: 0, nodes: 0 };
    nodes = 0; stop = false; deadline = Date.now() + ms; killers.fill(0);
    var order = Array.prototype.slice.call(list, 0, n), best = order[0], bestV = 0, depthDone = 0, lastScores = [];
    for (var depth = 1; depth <= maxDepth; depth++) {
      var alpha = -Infinity, cur = best, curV = -Infinity, scored = [];
      order.sort(function (x, y) { return x === best ? -1 : y === best ? 1 : 0; });
      for (i = 0; i < order.length; i++) {
        var st = make(order[i], p);
        var v = lost[3 - p] >= 6 ? WIN : -search(depth - 1, -Infinity, -alpha, 3 - p, 1);
        unmake(st);
        if (stop) break;
        scored.push([order[i], v]);
        if (v > curV) { curV = v; cur = order[i]; }
        if (v > alpha) alpha = v;
      }
      if (stop && depthDone) break;
      best = cur; bestV = curV; depthDone = depth; lastScores = scored;
      if (progress) progress({ best: keyOf(best), v: bestV, depth: depth, nodes: nodes });
      if (Math.abs(bestV) > WIN - 1000 || stop) break;
    }
    if (noise && lastScores.length && Math.abs(bestV) < WIN - 1000) { var pool = lastScores.filter(function (x) { return x[1] >= bestV - noise; }); best = pool[Math.floor(Math.random() * pool.length)][0]; }
    // the legal key in the core's format; verify against the core's rules
    var key = keyOf(best);
    if (!A.legal(s, key)) { var ms2 = A.moves(s); key = ms2.length ? ms2[0].key : null; }
    return { best: key, v: bestV, depth: depthDone, nodes: nodes };
  }
  function keys(s) { b.set(s.b); lost = s.lost.slice(); var l = new Int32Array(160), n = gen(s.turn, l), out = []; for (var i = 0; i < n; i++) out.push(keyOf(l[i])); return out; }
  function check(s, key) { b.set(s.b); lost = s.lost.slice(); var l = new Int32Array(160), n = gen(s.turn, l); for (var i = 0; i < n; i++) if (keyOf(l[i]) === key) { make(l[i], s.turn); var o = { b: Int8Array.from(b), lost: lost.slice() }; return o; } return null; }
  return { keys: keys, check: check, think: think, evaluate: function (s) { b.set(s.b); lost = s.lost.slice(); return evaluate(s.turn); } };
  })({next:next,cells:cells,legal:legal,moves:moves});
  var levels=[{name:'Лёгкий',ms:300,depth:1,noise:220},{name:'Средний',ms:800,depth:3,noise:40},{name:'Сильный',ms:2000,depth:30},{name:'Эксперт',ms:4000,depth:30},{name:'Мастер',ms:6000,depth:30},{name:'Максимум',ms:8500,depth:30}];
  function think(s,level,ms,progress){
    var L=levels[level]||levels[1];
    if(s.winner)return{p:s.winner===s.turn?1:0,v:s.winner===s.turn?100000:-100000,best:null,depth:0,nodes:0,target:L.depth};
    var wrap=function(r){var v=r.v||0;return{best:r.best,v:v,p:v>90000?1:v< -90000?0:1/(1+Math.exp(-v/650)),depth:r.depth,nodes:r.nodes,target:L.depth};};
    var r=engine.think(s,L.depth,ms||L.ms,L.noise||0,progress&&function(x){progress(wrap(x));});
    if(!r.best){var m=moves(s);return{p:.5,v:0,best:m.length?m[0].key:null,depth:0,nodes:0,target:L.depth};}
    return wrap(r);
  }
  return{cells:cells,dirs:dirs,next:next,index:index,setups:setups,create:create,clone:clone,groupAxis:groupAxis,legal:legal,play:play,moves:moves,key:key,notation:notation,levels:levels,think:think};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Abalone;
