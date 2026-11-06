// Resignations are history events, so replay/continuation also remove that seat.
function resignSeat(seat){
  if(!G||G.over||!(G.mask&(1<<seat)))return false;
  for(var i=0;i<G.own.length;i++)if(G.own[i]===seat){G.own[i]=-1;G.cnt[i]=0;}
  G.mask&=~(1<<seat);G.over=bitCount(G.mask)===1;
  G.winner=G.over?[0,1,2,3].filter(function(p){return G.mask&(1<<p);})[0]:-1;
  if(G.turn===seat)G.turn=nextAlive(G.mask,seat);
  G.moves++;G.hist.push(snap(-2,seat));return true;
}
var MA = MatchActions.attach({id:'tochki',
  events:{eliminated:function(){return G?[0,1,2,3].filter(function(i){return (G.start&(1<<i))&&!(G.mask&(1<<i));}):[];},fullPlayers:function(){return G?[0,1,2,3].filter(function(i){return G.start&(1<<i);}).map(function(i){return {id:i,label:COLORS_GEN[i],kind:G.kinds[i]==='bot'?'bot':G.kinds[i]==='net'?'remote':'human'};}):[];},result:function(){if(!G||!G.over)return null;return G.winner>=0?{draw:false,winners:[G.winner],reason:'normal'}:G.adjudication&&G.adjudication.type==='draw'?{draw:true,winners:[],reason:'agreement'}:null;},evaluation:function(){return !!(G&&G.evalOn);},continued:function(){return !!G&&G.moves>0;},clockSeats:function(){return [0,1,2,3];},botLevel:function(){return G&&G.level;}},
  state:function(){return G?{ref:G,version:G.moves,turn:G.turn,over:G.over,analysis:G.analysis,players:[0,1,2,3].filter(function(i){return G.mask&(1<<i);}).map(function(i){return{id:i,label:COLORS_GEN[i],kind:G.kinds[i]==='bot'?'bot':G.kinds[i]==='net'?'remote':'human'};}),mine:[0,1,2,3].filter(function(i){return G.kinds[i]==='human'&&(G.mask&(1<<i));})}:null;},
  role:function(){return NET&&NET.role;},send:function(m){if(NET&&NET.role==='host')netBroadcast(m);else netSend(m);},online:function(){return NET&&[0,1,2,3].every(function(i){return !(G.mask&(1<<i))||G.kinds[i]!=='net'||NET.online[i]!==false;});},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;if(r.type==='resign'&&!(G.mask&(1<<r.actor)))return;token++;stopAnims();clearHint();G.thinkingAt=-1;G.view=-1;G.watching=true;G.outShown=true;G.endShown=true;if(r.type==='draw'){G.over=true;G.winner=-1;}else resignSeat(r.actor);if(G.over)G.adjudication=r;$('endOv').hidden=true;GC.sync();idle();}
});
