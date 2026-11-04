var MA = MatchActions.attach({id:'falling4',
  state:function(){return G?{ref:G,version:G.moves.length,turn:G.s.turn,over:G.over,analysis:G.analysis,players:[1,2].map(function(i){return{id:i,label:NAME[i],kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,2].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;clearVote();G.over=true;G.busy=false;G.animating=false;G.netPending=false;G.sel=[];G.endShown=true;G.adjudication=r;$('endOv').hidden=true;GC.sync();render();}
});
