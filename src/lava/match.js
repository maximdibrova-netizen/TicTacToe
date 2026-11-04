var MA = MatchActions.attach({id:'lava',
  state:function(){return state?{ref:net()?'net:'+net().code+':'+netRound:gameSetup,version:state.ply,turn:state.turn,over:state.over,analysis:false,players:state.players.map(function(p,i){return{id:i,label:C[p.corner].name,kind:roles[i]==='bot'?'bot':roles[i]==='net'?'remote':'human'};}).filter(function(p){return state.players[p.id].alive;}),mine:state.players.map(function(p,i){return i;}).filter(function(i){return state.players[i].alive&&(net()&&net().role==='guest'?i===net().seat:roles[i]==='human');})}:null;},
  role:function(){return net()&&net().role;},send:function(m){if(net()&&net().role==='host')LavaLink.tellAll(m);else LavaLink.tell(m);},online:function(){return LavaLink.ready();},notify:toast,menu:home,again:restart,
  analyze:function(){if($('result').open)$('result').close();rv.go(0);render();},
  finish:function(r){if(!state||r.type==='draw'&&state.draw||r.type==='resign'&&!state.players[r.actor].alive)return;stopTimers();var n=L.apply(state,r.type==='draw'?44:40+r.actor);if(!n)return;state=n;state.settlement=r;armed=-1;rv.sync();saveGame();render();if(net()&&net().role==='host')LavaLink.update(state);schedule();}
});
