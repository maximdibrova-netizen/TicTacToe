var MA = MatchActions.attach({id:'go',
  events:{result:function(){if(!G)return null;if(G.adjudication&&G.adjudication.type==='draw')return {draw:true,winners:[],reason:'agreement'};if(G.s.resign)return {draw:false,winners:[3-G.s.resign],reason:'resign'};if(!G.s.over||!G.dead)return null;var score=goScore(G.s,G.dead);return {draw:score.diff===0,winners:score.diff===0?[]:[score.diff>0?1:2],reason:'score'};},evaluation:function(){return !!(G&&G.evalOn);},continued:function(){return !!G&&G.line.length>1;},clockSeats:function(){return [1,2];},botLevel:function(){return G&&G.level;}},
  state:function(){return G?{ref:G,version:G.line.length-1,turn:G.s.turn,over:G.s.over,analysis:G.analysis,players:[1,2].map(function(i){return{id:i,label:i===1?'Чёрные':'Белые',kind:G.kind[i]==='bot'?'bot':G.kind[i]==='net'?'remote':'human'};}),mine:[1,2].filter(function(i){return G.kind[i]==='me';})}:null;},
  role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},online:function(){return Net2P.online();},notify:toast,menu:toMenu,again:again,analyze:analyzeFinished,
  resume:function(){if(G){G.adjudication=null;}},
  finish:function(r){if(!G)return;token++;G.busy=false;G.netPending=false;G.endShown=true;G.adjudication=r;G.dead=null;G.s=Object.assign({},G.s,{over:true});$('endOv').hidden=true;$('askOv').hidden=true;$('confirmOv').hidden=true;GC.sync();render();}
});
