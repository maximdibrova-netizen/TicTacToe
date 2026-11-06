const match = MatchActions.attach({
  id:ID, resultModal:false,
  events:{fullPlayers:()=>game?game.view.counts.map((_,id)=>({id,label:playerName(id),kind:id===game.seat?'human':game.online?'remote':'bot'})):[],result:()=>game&&game.view.result?{draw:game.view.result.loser===null,winners:game.view.result.loser===null?[]:game.view.counts.map((_,i)=>i).filter(i=>i!==game.view.result.loser),reason:game.view.result.reason}:null,evaluation:()=>false,continued:()=>!!game&&game.view.version>0,clockSeats:()=>[],botLevel:()=>null},
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
