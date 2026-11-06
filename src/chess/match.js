var MA = MatchActions.attach({id:'chess',
  events:{result:function(){if(!G||!G.result)return null;return {draw:G.result.w==='d',winners:G.result.w==='d'?[]:[G.result.w],reason:G.adjudication?G.adjudication.type:'normal'};},evaluation:function(){return !!(G&&G.evalOn);},continued:function(){return !!G&&(G.c.history().length>0||G.root.fen!==START);},clockSeats:function(){return ['w','b'];},botLevel:function(){return G&&G.level;}},
  state:function(){return G?{ref:G,version:G.c.history().length,turn:G.c.turn(),over:G.over,analysis:G.analysis,players:['w','b'].map(function(i){return{id:i,label:i==='w'?'Белые':'Чёрные',kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:['w','b'].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;G.result=null;}},
  finish:function(r){if(!G)return;token++;botEng.send('stop');G.over=true;G.busy=false;G.pre=null;G.sel=null;G.drawOffer=null;G.netPending=false;G.endShown=true;G.adjudication=r;G.result={w:r.type==='draw'?'d':other(r.actor),t:r.type==='draw'?'по соглашению':'сдача'};$('endOv').hidden=true;$('askOv').hidden=true;GC.sync();render();}
});
