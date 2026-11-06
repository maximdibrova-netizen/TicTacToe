const match = MatchActions.attach({
  id:ID, resultModal:false,
  state:() => {
    if (!game) return null;
    const v = game.view;
    const active = v.counts.map((_,i)=>isOut(v,i)?-1:i).filter(i=>i>=0);
    return {
      ref:game, version:v.version, turn:v.actor, over:!!v.result, analysis:false,
      players:active.map(i=>({id:i,label:playerName(i),kind:i===game.seat?'human':game.online?'remote':'bot'})),
      mine:active.includes(game.seat)?[game.seat]:[]
    };
  },
  role:Net2P.role, send:Net2P.send, online:Net2P.online, notify:toast, menu:home, again,
  analyze:() => {}, finish
});
