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
  var levels=[{name:'Лёгкий',ms:350,depth:2},{name:'Средний',ms:900,depth:3},{name:'Сильный',ms:2000,depth:5},{name:'Эксперт',ms:4000,depth:10},{name:'Мастер',ms:6000,depth:15},{name:'Максимум',ms:8500,depth:64}];
  function think(s,level,ms,progress){
    var L=levels[level]||levels[1],deadline=Date.now()+(ms||L.ms),nodes=0,ABORT={},depthDone=0,table=new Map();
    if(s.winner)return{p:s.winner===s.turn?1:0,v:value(s,s.turn),best:null,depth:0,nodes:0,target:L.depth};
    function ordered(pos,preferred){return moves(pos).map(function(m){var n=applyKnown(pos,m,false);return{m:m,n:n,v:value(n,pos.turn)+(m.key===preferred?200000:0)};}).sort(function(a,b){return b.v-a.v;});}
    var root=ordered(s);if(!root.length)return{p:.5,v:0,best:null,depth:0,nodes:0,target:L.depth};var best=root[0].m.key,score=root[0].v;
    function result(){return{best:best,v:score,p:score>90000?1:score< -90000?0:1/(1+Math.exp(-score/650)),depth:depthDone,nodes:nodes,target:L.depth};}
    function neg(pos,depth,alpha,beta){nodes++;if(Date.now()>deadline)throw ABORT;if(!depth||pos.winner)return value(pos,pos.turn);var hash=key(pos),hit=table.get(hash),oldAlpha=alpha,oldBeta=beta;if(hit&&hit.depth>=depth){if(hit.flag===0)return hit.v;if(hit.flag===1)alpha=Math.max(alpha,hit.v);else beta=Math.min(beta,hit.v);if(alpha>=beta)return hit.v;}var list=ordered(pos,hit&&hit.best);if(!list.length)return value(pos,pos.turn);var v=-Infinity,pick=list[0].m.key;for(var i=0;i<list.length;i++){var n=-neg(list[i].n,depth-1,-beta,-alpha);if(n>v){v=n;pick=list[i].m.key;}alpha=Math.max(alpha,n);if(alpha>=beta)break;}if(table.size>100000)table.clear();table.set(hash,{depth:depth,v:v,best:pick,flag:v<=oldAlpha?2:v>=oldBeta?1:0});return v;}
    for(var depth=1;depth<=L.depth;depth++){
      try{var top=-Infinity,pick=best,rows=[];for(var i=0;i<root.length;i++){if(Date.now()>deadline)throw ABORT;var v=-neg(root[i].n,depth-1,-Infinity,-top);rows.push({m:root[i].m,n:root[i].n,v:v});if(v>top){top=v;pick=root[i].m.key;}}best=pick;score=top;depthDone=depth;root=rows.sort(function(a,b){return b.v-a.v;});if(progress)progress(result());if(Math.abs(score)>90000)break;}
      catch(e){if(e!==ABORT)throw e;break;}
    }
    return result();
  }
  return{cells:cells,dirs:dirs,next:next,index:index,setups:setups,create:create,clone:clone,groupAxis:groupAxis,legal:legal,play:play,moves:moves,key:key,notation:notation,levels:levels,think:think};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Abalone;
