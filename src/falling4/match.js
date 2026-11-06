var MA = MatchActions.attach({id:'falling4',resultModal:false,
  state:function(){return G?{ref:G,version:G.moves.length,turn:G.s.turn,over:G.over,analysis:G.analysis,players:[1,2].map(function(i){return{id:i,label:NAME[i],kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,2].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(result){
    finishGame({
      title:result.type==='draw'?'Ничья':result.winnerLabel+' победили',
      description:result.type==='draw'?'По соглашению игроков.':result.title+'.'
    });
  }
});
