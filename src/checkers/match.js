var MA = MatchActions.attach({id:'checkers',
  events:{result:function(){if(!G)return null;if(G.adjudication&&G.adjudication.type==='draw')return {draw:true,winners:[],reason:'agreement'};return G.s.winner?{draw:G.s.winner===3,winners:G.s.winner===3?[]:[G.s.winner],reason:'normal'}:null;},evaluation:function(){return !!(G&&G.evalOn);},continued:function(){return !!G&&(G.moves.length>0||!!G.baseFen);},clockSeats:function(){return [1,-1];},botLevel:function(){return S.level;}},
  state:function(){return G?{ref:G,version:G.moves.length,turn:G.s.side,over:G.over||!!G.s.winner,analysis:G.analysis,players:[1,-1].map(function(i){return{id:i,label:NAME[i],kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,-1].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;G.over=true;G.busy=false;G.part=null;G.pre=null;G.netPending=false;G.endShown=true;G.adjudication=r;G.pdnHeaders=Object.assign({},G.pdnHeaders||{},{Result:r.type==='draw'?'1/2-1/2':r.actor===1?'0-1':'1-0'});G.pdnMain=G.moves.join(' ');$('endOv').hidden=true;$('askOv').hidden=true;GC.sync();render();}
});
