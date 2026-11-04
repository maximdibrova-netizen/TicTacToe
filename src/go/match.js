var MA = MatchActions.attach({id:'go',
  state:function(){return G?{ref:G,version:G.line.length-1,turn:G.s.turn,over:G.s.over,analysis:G.analysis,players:[1,2].map(function(i){return{id:i,label:i===1?'Чёрные':'Белые',kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,2].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;G.busy=false;G.netPending=false;G.endShown=true;G.adjudication=r;G.dead=null;G.s=Object.assign({},G.s,{over:true});$('endOv').hidden=true;$('askOv').hidden=true;$('confirmOv').hidden=true;GC.sync();render();}
});
