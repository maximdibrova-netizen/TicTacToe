var FallingFour=(function(){
 var cells=Array.from({length:42},function(_,i){return{q:i%7,r:i/7|0,name:'ABCDEFG'[i%7]+(6-(i/7|0))};});
 function create(){return{b:new Int8Array(42),turn:1,winner:0,win:[],plies:0,path:[],lost:[0,0,0],setup:0};}
 function clone(s){return{b:Int8Array.from(s.b),turn:s.turn,winner:s.winner||0,win:(s.win||[]).slice(),plies:s.plies||0,path:(s.path||[]).slice(),lost:[0,0,0],setup:0};}
 function legal(s,input){if(input==null||typeof input==='boolean'||typeof input==='string'&&!/^[0-6]$/.test(input))return null;var col=typeof input==='object'&&input?input.col:Number(input);if(s.winner||!Number.isInteger(col)||col<0||col>6||s.b[col])return null;var row=5;while(s.b[row*7+col])row--;return{col:col,row:row,key:String(col)};}
 function play(s,input){var m=legal(s,input);if(!m)return null;var n=clone(s),i=m.row*7+m.col;n.b[i]=s.turn;n.turn=3-s.turn;n.plies++;n.last=m.key;n.lastCell=i;n.path.push(m.key);
  [[1,0],[0,1],[1,1],[1,-1]].some(function(d){var line=[i];[-1,1].forEach(function(sign){for(var k=1;k<4;k++){var r=m.row+d[1]*k*sign,c=m.col+d[0]*k*sign;if(r<0||r>5||c<0||c>6||n.b[r*7+c]!==s.turn)break;line.push(r*7+c);}});if(line.length>=4){n.winner=s.turn;n.win=line;return true;}return false;});if(!n.winner&&n.plies===42)n.winner=3;return n;}
 function moves(s){return[3,2,4,1,5,0,6].map(function(c){return legal(s,String(c));}).filter(Boolean);}
 function score(s,side){if(s.winner)return s.winner===3?0:s.winner===side?100000:-100000;var v=0;cells.forEach(function(c,i){if(s.b[i])v+=(s.b[i]===side?1:-1)*(3-Math.abs(c.q-3))*3;});for(var r=0;r<6;r++)for(var c=0;c<7;c++)[[1,0],[0,1],[1,1],[1,-1]].forEach(function(d){var a=0,b=0;for(var k=0;k<4;k++){var y=r+d[1]*k,x=c+d[0]*k;if(y<0||y>5||x<0||x>6)return;var p=s.b[y*7+x];if(p===side)a++;else if(p)b++;}if(!b)v+=[0,1,9,75,10000][a];if(!a)v-=[0,1,9,90,10000][b];});return v;}
 // Бот: перебор с отсечениями и таблицей позиций, оценка по угрозам (клетки, где замыкается четвёрка) с учётом чётности рядов.
 // Сильный уровень находит все форсированные выигрыши на 10–16 ходов вперёд, к концу партии считает до конца.
 var engine=(function(){
var W = 7, H = 6, N = 42, WIN = 100000;
  var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  // Zobrist keys (two independent 32-bit hashes)
  var Z1 = new Int32Array(N * 3), Z2 = new Int32Array(N * 3), seed = 0x9e3779b9;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  for (var i = 0; i < Z1.length; i++) { Z1[i] = rnd(); Z2[i] = rnd(); }
  var TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  var ttKey = new Int32Array(TT_SIZE), ttVal = new Int32Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE), ttMove = new Int8Array(TT_SIZE);
  // all 69 four-cell lines and, per cell, the lines through it
  var LINES = [], CELL_LINES = [];
  for (var c0 = 0; c0 < N; c0++) CELL_LINES.push([]);
  for (var r = 0; r < H; r++) for (var c = 0; c < W; c++) DIRS.forEach(function (d) {
    var cells = [];
    for (var k = 0; k < 4; k++) { var rr = r + d[0] * k, cc = c + d[1] * k; if (rr < 0 || rr >= H || cc < 0 || cc >= W) return; cells.push(rr * W + cc); }
    LINES.push(cells); cells.forEach(function (x) { CELL_LINES[x].push(LINES.length - 1); });
  });
  var ORDER = [3, 2, 4, 1, 5, 0, 6];
  var b = new Int8Array(N), h = new Int8Array(W), h1 = 0, h2 = 0, count = 0, nodes = 0, deadline = 0, stop = false;
  function cellOf(col) { return (H - 1 - h[col]) * W + col; }
  function place(col, p) { var x = cellOf(col); b[x] = p; h[col]++; count++; h1 ^= Z1[x * 3 + p]; h2 ^= Z2[x * 3 + p]; return x; }
  function unplace(col) { h[col]--; count--; var x = cellOf(col), p = b[x]; b[x] = 0; h1 ^= Z1[x * 3 + p]; h2 ^= Z2[x * 3 + p]; }
  // would p win by playing on empty cell x?
  function wins(x, p) {
    var r = (x / W) | 0, c = x % W;
    for (var di = 0; di < 4; di++) {
      var dr = DIRS[di][0], dc = DIRS[di][1], n = 1, rr, cc;
      rr = r + dr; cc = c + dc; while (rr >= 0 && rr < H && cc >= 0 && cc < W && b[rr * W + cc] === p) { n++; rr += dr; cc += dc; }
      rr = r - dr; cc = c - dc; while (rr >= 0 && rr < H && cc >= 0 && cc < W && b[rr * W + cc] === p) { n++; rr -= dr; cc -= dc; }
      if (n >= 4) return true;
    }
    return false;
  }
  // static evaluation for side p to move: threats (cells that complete four) weighted by parity, plus open lines
  function evaluate(p) {
    var q = 3 - p, v = 0;
    for (var li = 0; li < LINES.length; li++) {
      var L = LINES[li], a = 0, o = 0;
      for (var k = 0; k < 4; k++) { var t = b[L[k]]; if (t === p) a++; else if (t === q) o++; }
      if (a && !o) v += a === 1 ? 1 : a === 2 ? 6 : 0;
      else if (o && !a) v -= o === 1 ? 1 : o === 2 ? 6 : 0;
    }
    // threat cells: empty cells completing a four. Odd rows (from the bottom) favour the first player, even rows the second.
    var t1 = 0, t2 = 0;
    for (var col = 0; col < W; col++) for (var hh = h[col]; hh < H; hh++) {
      var x = (H - 1 - hh) * W + col, rowFromBottom = hh + 1, w1 = wins(x, 1), w2 = wins(x, 2);
      if (w1) t1 += rowFromBottom % 2 ? 60 : 30;
      if (w2) t2 += rowFromBottom % 2 ? 30 : 60;
      if (w1 || w2) { if (hh === h[col]) { /* immediately playable threat: handled by search */ } }
    }
    v += (p === 1 ? t1 - t2 : t2 - t1);
    for (var cc2 = 0; cc2 < W; cc2++) for (var r2 = 0; r2 < H; r2++) { var y = b[r2 * W + cc2]; if (y) v += (y === p ? 1 : -1) * (3 - Math.abs(cc2 - 3)); }
    return v;
  }
  function search(depth, alpha, beta, p, ply) {
    if ((++nodes & 4095) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    if (count === N) return 0;
    var q = 3 - p, col, x;
    for (col = 0; col < W; col++) if (h[col] < H && wins(cellOf(col), p)) return WIN - ply - 1;
    // opponent's immediate wins: must block; two → lost
    var forced = -1, nThreat = 0;
    for (col = 0; col < W; col++) if (h[col] < H && wins(cellOf(col), q)) { nThreat++; forced = col; }
    if (nThreat > 1) return -(WIN - ply - 2);
    if (count + 1 >= N) return 0;
    // mate-distance bounds
    var maxV = WIN - ply - 3; if (beta > maxV) { beta = maxV; if (alpha >= beta) return beta; }
    if (depth <= 0) return evaluate(p);
    var slot = h1 & TT_MASK, ttm = -1, a0 = alpha;
    if (ttKey[slot] === h2) {
      ttm = ttMove[slot];
      if (ttDepth[slot] >= depth) {
        var tv = ttVal[slot], f = ttFlag[slot];
        if (f === 0) return tv; if (f === 1 && tv > alpha) alpha = tv; else if (f === 2 && tv < beta) beta = tv;
        if (alpha >= beta) return tv;
      }
    }
    var list = [], scores = [];
    if (forced >= 0) list.push(forced);
    else for (var oi = 0; oi < W; oi++) {
      col = ORDER[oi]; if (h[col] >= H) continue;
      x = cellOf(col);
      // playing here lets the opponent win right above → losing move, try last
      var s = 0;
      if (h[col] + 1 < H && wins(x - W, q)) s = -1000;
      else {
        if (col === ttm) s += 10000;
        b[x] = p; for (var cc = 0; cc < W; cc++) if (h[cc] < H) { var y = cellOf(cc) - (cc === col ? W : 0); if (y >= 0 && wins(y, p)) s += 50; } b[x] = 0;
        s += 6 - Math.abs(col - 3);
        // own threat cells created anywhere (not only playable ones)
        b[x] = p; var lines = CELL_LINES[x];
        for (var li = 0; li < lines.length; li++) { var L = LINES[lines[li]], a = 0, o = 0; for (var k = 0; k < 4; k++) { var t = b[L[k]]; if (t === p) a++; else if (t) o++; } if (!o && a === 3) s += 20; }
        b[x] = 0;
      }
      list.push(col); scores.push(s);
    }
    if (forced < 0) { var idx = list.map(function (_, i) { return i; }).sort(function (i, j) { return scores[j] - scores[i]; }); list = idx.map(function (i) { return list[i]; }); }
    var best = -Infinity, bestCol = list[0];
    for (var mi = 0; mi < list.length; mi++) {
      col = list[mi]; place(col, p);
      var v = -search(depth - 1, -beta, -alpha, q, ply + 1);
      unplace(col);
      if (stop) return 0;
      if (v > best) { best = v; bestCol = col; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    ttKey[slot] = h2; ttVal[slot] = best; ttDepth[slot] = depth; ttMove[slot] = bestCol;
    ttFlag[slot] = best <= a0 ? 2 : best >= beta ? 1 : 0;
    return best;
  }
  function think(s, maxDepth, ms, noise) {
    b.set(s.b); count = 0; h1 = 0; h2 = 0;
    for (var col = 0; col < W; col++) { h[col] = 0; for (var r = H - 1; r >= 0 && s.b[r * W + col]; r--) h[col]++; }
    for (var x = 0; x < N; x++) if (b[x]) { count++; h1 ^= Z1[x * 3 + b[x]]; h2 ^= Z2[x * 3 + b[x]]; }
    var p = s.turn, legal = ORDER.filter(function (c) { return h[c] < H; });
    if (s.winner || !legal.length) return { best: null, v: 0, depth: 0, nodes: 0 };
    nodes = 0; stop = false; deadline = Date.now() + ms;
    var bestCol = legal[0], bestV = 0, depthDone = 0, rootScores = {};
    var limit = Math.min(maxDepth, N - count);
    for (var d = 1; d <= limit; d++) {
      var alpha = -Infinity, curBest = bestCol, curV = -Infinity, list = [bestCol].concat(legal.filter(function (c) { return c !== bestCol; }));
      var scoresHere = {};
      for (var i = 0; i < list.length; i++) {
        var c2 = list[i]; place(c2, p);
        var v = wins(cellOf(c2) + W, p) ? WIN - 1 : -search(d - 1, -Infinity, noise ? Infinity : -alpha, 3 - p, 1);
        unplace(c2);
        if (stop) break;
        scoresHere[c2] = v;
        if (v > curV) { curV = v; curBest = c2; }
        if (v > alpha) alpha = v;
      }
      if (stop && depthDone) break;
      bestCol = curBest; bestV = curV; depthDone = d; rootScores = scoresHere;
      if (Math.abs(bestV) > WIN - 100) break;
      if (stop) break;
    }
    if (noise && Math.abs(bestV) < WIN - 100) {
      var cands = legal.filter(function (c) { return rootScores[c] !== undefined && rootScores[c] >= bestV - noise && rootScores[c] > -(WIN - 100); });
      if (cands.length) bestCol = cands[Math.floor(Math.random() * cands.length)];
      bestV = rootScores[bestCol];
    }
    return { best: String(bestCol), v: bestV, depth: depthDone, nodes: nodes };
  }
  return { think: think };
 })();
 var levels=[{name:'Лёгкий',ms:150,depth:2,noise:60},{name:'Средний',ms:400,depth:6,noise:12},{name:'Сильный',ms:1200,depth:42},{name:'Максимум',ms:3000,depth:42}];
 function think(s,level,ms){var l=levels[level]||levels[1],r=engine.think(s,l.depth,ms||l.ms,l.noise||0),v=r.v||0;if(!r.best)return{best:null,v:v,p:s.winner===3?.5:s.winner===s.turn?1:0,depth:0};return{best:r.best,v:v,p:v>90000?1:v< -90000?0:1/(1+Math.exp(-v/100)),depth:r.depth,nodes:r.nodes};}
 return{cells:cells,create:create,clone:clone,legal:legal,play:play,moves:moves,think:think,levels:levels,setups:[{name:'Классическое поле 7 × 6'}],notation:function(m){return'ABCDEFG'[Number(m)];}};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FallingFour;
