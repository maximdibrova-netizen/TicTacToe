const match = MatchActions.attach({
  id:ID, resultModal:false,
  events:{eliminated:()=>game?game.state.pawns.map((p,i)=>p<0?i:-1).filter(i=>i>=0):[],fullPlayers:()=>game?game.roles.map((kind,id)=>({id,kind,label:name(id)})):[],result:()=>game&&Q.over(game.state)?{draw:game.state.draw,winners:game.state.draw?[]:[game.state.winner],reason:/^time:/.test(game.state.last||'')?'time':'normal'}:null,evaluation:()=>false,continued:()=>!!game&&game.keys.length>0,clockSeats:()=>[0,1],botLevel:()=>game&&game.level},
  state:() => {
    if (!game) return null;
    const active = game.state.pawns.map((cell,i) => cell >= 0 ? i : -1).filter(i => i >= 0);
    return {
      ref:game, version:game.state.ply, turn:game.state.turn, over:Q.over(game.state), analysis:game.analysis,
      players:active.map(i => ({id:i,label:name(i),kind:game.roles[i]})),
      mine:active.filter(i => game.roles[i] === 'human')
    };
  },
  role:Net2P.role, send:Net2P.send, online:Net2P.online, notify:toast, menu:home, again, analyze,
  finish:result => finish(result.type,result.actor)
});
