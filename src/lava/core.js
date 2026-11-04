// Лава: deterministic rules, shared by the UI, bots and the host referee.
var Lava = (function () {
  'use strict';
  var SIZE = 6;
  var DIRS = [{dr:-1,dc:0,label:'↑'},{dr:0,dc:1,label:'→'},{dr:1,dc:0,label:'↓'},{dr:0,dc:-1,label:'←'}];
  // Corner order matches «Точки»: upper left, upper right, lower right, lower left.
  var MAPS = [
    {id:'classic',name:'Классика',size:6,note:'Поле из примера · 6 × 6',rows:['121121','211112','112211','112211','211112','121121']},
    {id:'ring',name:'Кольцо',size:6,note:'Обходи лаву в центре · 6 × 6',rows:['122221','211112','210012','210012','211112','122221']},
    {id:'cross',name:'Крест',size:6,note:'Четыре крыла и прочный центр · 6 × 6',rows:['001100','012210','122221','122221','012210','001100']},
    {id:'bridges',name:'Мосты',size:8,note:'Узкие переходы между четырьмя зонами · 8 × 8',rows:['11100111','12100121','11211211','00222200','00222200','11211211','12100121','11100111']},
    {id:'fortress',name:'Крепость',size:8,note:'Прочный центр, хрупкие подходы · 8 × 8',rows:['11111111','12111121','11122111','11222211','11222211','11122111','12111121','11111111']},
    {id:'arena',name:'Арена',size:8,note:'Большое поле для длинной партии · 8 × 8',rows:['12122121','21111112','11211211','21122112','21122112','11211211','21111112','12122121']}
  ];
  function map(id) { return MAPS.find(function(m){return m.id===id;}) || null; }
  function startCells(size) {return [size+1,size*2-2,size*(size-1)-2,size*(size-2)+1];}
  function corner(s, seat) {
    var p=s.players[seat];
    return Number.isInteger(p.corner)?p.corner:(s.players.length===2?[0,2]:s.players.length===3?[0,1,2]:[0,1,3,2])[seat];
  }
  function setup(input) {
    if(Number.isInteger(input)){
      if(input<2||input>4)throw new Error('Нужно 2–4 игрока');
      return {mapId:'classic',corners:input===2?[0,2]:input===3?[0,1,2]:[0,1,3,2],first:0};
    }
    if(!input||typeof input!=='object'||!map(input.mapId||'classic'))throw new Error('Неизвестная карта');
    var corners=input.corners;
    if(!Array.isArray(corners)||corners.length<2||corners.length>4||new Set(corners).size!==corners.length||!corners.every(function(c){return Number.isInteger(c)&&c>=0&&c<4;}))throw new Error('Выбери 2–4 разных угла');
    var first=input.first===undefined?0:input.first;
    if(!Number.isInteger(first)||first<0||first>=corners.length)throw new Error('Неверный первый игрок');
    return {mapId:input.mapId||'classic',corners:corners.slice(),first:first};
  }
  function create(input) {
    var cfg=setup(input),m=map(cfg.mapId),starts=startCells(m.size);
    return {v:2,size:m.size,mapId:m.id,tiles:m.rows.join('').split('').map(Number),players:cfg.corners.map(function(c){return {pos:starts[c],corner:c,back:-1,alive:true};}),turn:cfg.first,ply:0,over:false,winner:null,last:null};
  }
  function target(pos, dir, size) {
    size=size||SIZE;
    if (dir === 4) return pos;
    if (!Number.isInteger(dir) || dir < 0 || dir > 3) return -1;
    var r = Math.floor(pos / size) + DIRS[dir].dr, c = pos % size + DIRS[dir].dc;
    return r >= 0 && r < size && c >= 0 && c < size ? r * size + c : -1;
  }
  function occupied(s, pos, except) {
    return s.players.some(function(p,i){return i !== except && p.alive && p.pos === pos;});
  }
  function moves(s, seat, safeOnly) {
    if (s.over || !s.players[seat] || !s.players[seat].alive) return [];
    var p=s.players[seat], result=[];
    for (var d=0;d<4;d++) {
      var to=target(p.pos,d,s.size);
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
    n.tiles[from]--; p.pos=target(from,dir,n.size); p.back=dir === 4 ? -1 : (dir+2)%4;
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
      for(var d=0;d<4;d++){var to=target(i,d,s.size);if(to>=0 && s.tiles[to]>0 && !seen.has(to) && !occupied(s,to,seat))todo.push(to);}
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
    if(!s || (s.v!==1&&s.v!==2))return false;
    var size=s.v===1?6:s.size,total=size*size;
    if((size!==6&&size!==8)||s.v===2&&(!map(s.mapId)||map(s.mapId).size!==size)||!Array.isArray(s.tiles) || s.tiles.length!==total || !s.tiles.every(function(n){return Number.isInteger(n)&&n>=0&&n<=2;}) || !Array.isArray(s.players) || s.players.length<2 || s.players.length>4 || !Number.isInteger(s.ply) || s.ply<0 || s.ply>total*2 || typeof s.over!=='boolean')return false;
    var positions=new Set(),corners=new Set();
    for(var p of s.players){
      if(!p || !Number.isInteger(p.pos)||p.pos<0||p.pos>=total || !Number.isInteger(p.back)||p.back < -1||p.back>3 || typeof p.alive!=='boolean')return false;
      if(s.v===2){if(!Number.isInteger(p.corner)||p.corner<0||p.corner>3||corners.has(p.corner))return false;corners.add(p.corner);}
      if(p.alive){if(!s.tiles[p.pos]||positions.has(p.pos))return false;positions.add(p.pos);}
    }
    if(s.last!==null){var l=s.last;if(!l||!Number.isInteger(l.seat)||l.seat<0||l.seat>=s.players.length||!Number.isInteger(l.dir)||l.dir<0||l.dir>4||!Number.isInteger(l.from)||l.from<0||l.from>=total||!Number.isInteger(l.to)||l.to<0||l.to>=total||!Array.isArray(l.eliminated)||!l.eliminated.every(function(i){return Number.isInteger(i)&&i>=0&&i<s.players.length;}))return false;}
    if(s.over)return s.turn===-1 && positions.size<=1 && (positions.size===0 ? s.winner===null : Number.isInteger(s.winner)&&!!s.players[s.winner]&&s.players[s.winner].alive);
    return positions.size>=2 && Number.isInteger(s.turn)&&!!s.players[s.turn]&&s.players[s.turn].alive && s.winner===null;
  }
  return {SIZE:SIZE,DIRS:DIRS,MAPS:MAPS,map:map,setup:setup,startCells:startCells,corner:corner,create:create,target:target,moves:moves,apply:apply,bot:bot,valid:valid};
})();
if(typeof module!=='undefined' && module.exports)module.exports=Lava;
