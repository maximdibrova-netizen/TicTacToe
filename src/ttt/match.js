var MA = MatchActions.attach({id:'ttt',
  state:function(){return G?{ref:G,version:G.moves.length,turn:G.s.turn,over:G.over,analysis:G.analysis,players:[1,2].map(function(i){return{id:i,label:NAME[i],kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,2].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return NET&&NET.role;},send:function(m){netSend(m);},online:function(){return NET&&NET.peerOnline!==false;},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;G.over=true;G.busy=false;G.endShown=true;G.adjudication=r;$('endOv').hidden=true;$('askOv').hidden=true;GC.sync();render(true);}
});
