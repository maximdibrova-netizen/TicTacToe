// Лава: deterministic rules, shared by the UI, bots and the host referee.
var Lava = (function () {
  'use strict';
  var SIZE = 6;
  var DIRS = [{dr:-1,dc:0,label:'↑'},{dr:0,dc:1,label:'→'},{dr:1,dc:0,label:'↓'},{dr:0,dc:-1,label:'←'}];
  var LAYOUT = [1,2,1,1,2,1, 2,1,1,1,1,2, 1,1,2,2,1,1,
                1,1,2,2,1,1, 2,1,1,1,1,2, 1,2,1,1,2,1];
  function create(count) {
    if (!Number.isInteger(count) || count < 2 || count > 4) throw new Error('Нужно 2–4 игрока');
    var starts = count === 2 ? [7,28] : count === 3 ? [7,10,28] : [7,10,25,28];
    return {v:1,tiles:LAYOUT.slice(),players:starts.map(function(pos){return {pos:pos,back:-1,alive:true};}),turn:0,ply:0,over:false,winner:null,last:null};
  }
  function target(pos, dir) {
    if (dir === 4) return pos;
    if (!Number.isInteger(dir) || dir < 0 || dir > 3) return -1;
    var r = Math.floor(pos / SIZE) + DIRS[dir].dr, c = pos % SIZE + DIRS[dir].dc;
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1;
  }
  function occupied(s, pos, except) {
    return s.players.some(function(p,i){return i !== except && p.alive && p.pos === pos;});
  }
  function moves(s, seat, safeOnly) {
    if (s.over || !s.players[seat] || !s.players[seat].alive) return [];
    var p=s.players[seat], result=[];
    for (var d=0;d<4;d++) {
      var to=target(p.pos,d);
      if (d !== p.back && to >= 0 && s.tiles[to] > 0 && !occupied(s,to,seat)) result.push(d);
    }
    if (s.tiles[p.pos] > (safeOnly ? 1 : 0)) result.push(4);
    return result;
  }
  function finish(s) {
    var alive=s.players.map(function(p,i){return p.alive ? i : -1;}).filter(function(i){return i >= 0;});
    if (alive.length > 1) return false;
    s.over=true; s.winner=alive.length ? alive[0] : null; s.turn=-1; return true;
  }
  function apply(s, dir) {
    if (s.over || moves(s,s.turn,false).indexOf(dir) < 0) return null;
    var n=JSON.parse(JSON.stringify(s)), seat=n.turn, p=n.players[seat], from=p.pos;
    n.tiles[from]--; p.pos=target(from,dir); p.back=dir === 4 ? -1 : (dir+2)%4;
    n.ply++; n.last={seat:seat,dir:dir,from:from,to:p.pos,eliminated:[]};
    if (n.tiles[p.pos] === 0) { p.alive=false; n.last.eliminated.push(seat); }
    if (finish(n)) return n;
    // Only eliminate a trapped player when their turn arrives: an occupied exit
    // may become free before then. A two-layer tile permits a safe in-place jump.
    for (var step=1;step<=n.players.length;step++) {
      var next=(seat+step)%n.players.length;
      if (!n.players[next].alive) continue;
      if (moves(n,next,true).length) { n.turn=next; return n; }
      n.players[next].alive=false; n.last.eliminated.push(next);
      if (finish(n)) return n;
    }
    return n;
  }
  function territory(s, seat) {
    var seen=new Set(), todo=[s.players[seat].pos];
    while(todo.length) {
      var i=todo.pop(); if(seen.has(i))continue; seen.add(i);
      for(var d=0;d<4;d++){var to=target(i,d);if(to>=0 && s.tiles[to]>0 && !seen.has(to) && !occupied(s,to,seat))todo.push(to);}
    }
    return seen.size;
  }
  function bot(s) {
    var seat=s.turn, best=null, score=-Infinity;
    moves(s,seat,true).forEach(function(d){
      var n=apply(s,d), p=n.players[seat], v;
      if(!p.alive) v=-10000;
      else if(n.over) v=n.winner===seat ? 10000 : -10000;
      else {
        v=territory(n,seat)*2 + moves(n,seat,true).length*7 + n.tiles[p.pos]*2;
        n.players.forEach(function(other,i){if(i!==seat && other.alive)v-=moves(n,i,true).length*2;});
        if(d===4)v-=1;
      }
      if(v>score){score=v;best=d;}
    });
    return best;
  }
  function valid(s) {
    if(!s || s.v!==1 || !Array.isArray(s.tiles) || s.tiles.length!==36 || !s.tiles.every(function(n){return Number.isInteger(n)&&n>=0&&n<=2;}) || !Array.isArray(s.players) || s.players.length<2 || s.players.length>4 || !Number.isInteger(s.ply) || s.ply<0 || s.ply>72 || typeof s.over!=='boolean')return false;
    var positions=new Set();
    for(var p of s.players){
      if(!p || !Number.isInteger(p.pos)||p.pos<0||p.pos>=36 || !Number.isInteger(p.back)||p.back < -1||p.back>3 || typeof p.alive!=='boolean')return false;
      if(p.alive){if(!s.tiles[p.pos]||positions.has(p.pos))return false;positions.add(p.pos);}
    }
    if(s.last!==null){var l=s.last;if(!l||!Number.isInteger(l.seat)||l.seat<0||l.seat>=s.players.length||!Number.isInteger(l.dir)||l.dir<0||l.dir>4||!Number.isInteger(l.from)||l.from<0||l.from>=36||!Number.isInteger(l.to)||l.to<0||l.to>=36||!Array.isArray(l.eliminated)||!l.eliminated.every(function(i){return Number.isInteger(i)&&i>=0&&i<s.players.length;}))return false;}
    if(s.over)return s.turn===-1 && positions.size<=1 && (positions.size===0 ? s.winner===null : Number.isInteger(s.winner)&&!!s.players[s.winner]&&s.players[s.winner].alive);
    return positions.size>=2 && Number.isInteger(s.turn)&&!!s.players[s.turn]&&s.players[s.turn].alive && s.winner===null;
  }
  return {SIZE:SIZE,DIRS:DIRS,create:create,target:target,moves:moves,apply:apply,bot:bot,valid:valid};
})();
if(typeof module!=='undefined' && module.exports)module.exports=Lava;
