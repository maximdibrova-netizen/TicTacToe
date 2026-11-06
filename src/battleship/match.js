var MA = MatchActions.attach({id:'battleship',
  events:{result:function(){if(!G||G.phase!=='over')return null;if(G.adjudication&&G.adjudication.type==='draw')return {draw:true,winners:[],reason:'agreement'};var me=Net2P.role()==='guest'?1:0;return {draw:false,winners:[G.won?me:1-me],reason:'normal'};},evaluation:function(){return !!(G&&G.evalOn);},continued:function(){return !!G&&G.shots>0;},clockSeats:function(){return [0,1];},botLevel:function(){return S.level;}},
  state:function(){if(!G)return null;var i=Net2P.role()==='guest'?1:0;return{ref:G,version:(G.line||[]).length,turn:G.turn==='me'?i:1-i,over:G.phase==='over',ready:G.phase!=='place',analysis:G.analysis,players:[{id:i,label:i===0?'Хозяин':'Гость',kind:'human'},{id:1-i,label:G.opp==='bot'?'Бот':i===0?'Гость':'Хозяин',kind:G.opp==='bot'?'bot':'remote'}],mine:[i]};},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;G.phase='over';G.adjudication=r;G.won=r.type!=='draw'&&r.actor!==(Net2P.role()==='guest'?1:0);G.waiting=null;G.botWait=false;if(G.opp==='bot')G.reveal=G.bot.fleet;else Net2P.send({t:'reveal',fleet:G.fleet});$('endOv').hidden=true;save();GC.sync();renderAll();}
});
