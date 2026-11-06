var MA = MatchActions.attach({id:'ttt',
  events:{result:function(){if(!G)return null;if(G.adjudication&&G.adjudication.type==='draw')return {draw:true,winners:[],reason:'agreement'};return G.s.winner?{draw:G.s.winner===3,winners:G.s.winner===3?[]:[G.s.winner],reason:'normal'}:null;},evaluation:function(){return !!(G&&G.evalOn);},continued:function(){return !!G&&G.moves.length>0;},clockSeats:function(){return [1,2];},botLevel:function(){return S.level;}},
  state:function(){return G?{ref:G,version:G.moves.length,turn:G.s.turn,over:G.over,analysis:G.analysis,players:[1,2].map(function(i){return{id:i,label:NAME[i],kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,2].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return NET&&NET.role;},send:function(m){netSend(m);},online:function(){return NET&&NET.peerOnline!==false;},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;G.over=true;G.busy=false;G.endShown=true;G.adjudication=r;$('endOv').hidden=true;$('askOv').hidden=true;GC.sync();render(true);}
});
