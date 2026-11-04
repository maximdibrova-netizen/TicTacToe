(function () {
 'use strict';
 var A=Abalone,$=function(id){return document.getElementById(id);},NAME=['','Чёрные','Белые'];
 var S={mode:'bot',level:1,side:1,setup:0,evalOn:true};
 try{Object.assign(S,JSON.parse(localStorage.getItem('abalone-set')||'{}'));}catch(e){}
 if(!/^(bot|duo|net)$/.test(S.mode))S.mode='bot';
 if(!Number.isInteger(S.setup)||!A.setups[S.setup])S.setup=0;
 if(!A.levels[S.level])S.level=1;if(S.side!==2)S.side=1;
 function save(){try{localStorage.setItem('abalone-set',JSON.stringify(S));}catch(e){}}
 var G=null,token=0,CONT=null,pendingContinuation=null,lastJoin=null,hostSide=0,toastTimer=null;
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('toast').hidden=true;},2600);}
 function net(){return Net2P.active();}
 function mySide(){return G.kind[1]==='me'&&G.kind[2]!=='me'?1:G.kind[2]==='me'&&G.kind[1]!=='me'?2:0;}
 function point(i){var c=A.cells[i];return[300+50*(c.q+c.r/2),260+43.30127019*c.r];}
 function boardMarkup(s,preview,hint){
  var prefix=preview?'prev':'play',out=['<defs><radialGradient id="'+prefix+'Black" cx=".32" cy=".23" r=".85"><stop stop-color="#87909a"/><stop offset=".24" stop-color="#3c424b"/><stop offset=".67" stop-color="#11151c"/><stop offset="1" stop-color="#05070b"/></radialGradient><radialGradient id="'+prefix+'White" cx=".32" cy=".23" r=".85"><stop stop-color="#fff"/><stop offset=".4" stop-color="#f8f4eb"/><stop offset=".8" stop-color="#c5c1b6"/><stop offset="1" stop-color="#99988f"/></radialGradient><linearGradient id="'+prefix+'Tray" x2=".4" y2="1"><stop stop-color="#46505e"/><stop offset=".5" stop-color="#252d37"/><stop offset="1" stop-color="#141b23"/></linearGradient><marker id="'+prefix+'Arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#62a7ff"/></marker></defs>'];
  out.push('<polygon points="52,260 176,45 424,45 548,260 424,475 176,475" fill="#0a0e16" stroke="#121820" stroke-width="16" stroke-linejoin="round"/><polygon points="52,254 176,39 424,39 548,254 424,469 176,469" fill="url(#'+prefix+'Tray)" stroke="#9a876a" stroke-width="3" stroke-linejoin="round"/><polygon points="72,254 187,56 413,56 528,254 413,452 187,452" fill="none" stroke="#111922" stroke-width="2"/>');
  var hm=hint&&A.legal(s,hint),selected=!preview&&G?G.sel:[];
  A.cells.forEach(function(c,i){var p=point(i),v=s.b[i],classes=(selected.indexOf(i)>=0?'selected ':'')+(hm&&hm.cells.indexOf(i)>=0?'hint-source':'');out.push('<g data-i="'+i+'" data-name="'+c.name+'" data-v="'+v+'" class="'+classes+'" transform="translate('+p[0]+','+p[1]+')"'+(preview?'':' role="button" tabindex="0" aria-label="'+c.name+(v?', '+NAME[v].toLowerCase():' — пусто')+'" aria-pressed="'+(selected.indexOf(i)>=0)+'"')+'><circle class="hole" r="22.5" fill="#10161f" stroke="#58616b" stroke-width="1.2"/><circle cy="2" r="19.5" fill="#050a10" opacity=".7"/>');if(v)out.push('<circle class="marble-svg" cy="-1.4" r="19.4" fill="url(#'+prefix+(v===1?'Black':'White')+')" stroke="'+(v===1?'#6d747d':'#ede7dc')+'" stroke-width=".65"/>');if(!preview)out.push('<text class="coord" x="22" y="23">'+c.name+'</text>');out.push('</g>');});
  if(hm){var x=0,y=0;hm.cells.forEach(function(i){var p=point(i);x+=p[0];y+=p[1];});x/=hm.cells.length;y/=hm.cells.length;var d=A.dirs[hm.dir],dx=50*(d[0]+d[1]/2),dy=43.30127019*d[1];out.push('<path class="best-arrow" d="M'+x+','+y+' l'+dx+','+dy+'" fill="none" stroke="#62a7ff" stroke-width="7" stroke-linecap="round" opacity=".85" marker-end="url(#'+prefix+'Arrow)"/>');}
  return out.join('');
 }
 A.levels.forEach(function(l,i){var b=document.createElement('button');b.id='lv-'+i;b.dataset.v=i;b.textContent=l.name;b.onclick=function(){S.level=i;save();renderMenu();};$('levelSeg').appendChild(b);});
 ['mode','side','eval'].forEach(function(name){$(''+name+'Seg').addEventListener('click',function(e){var b=e.target.closest('[data-v]');if(!b)return;if(name==='mode')S.mode=b.dataset.v;else if(name==='side')S.side=+b.dataset.v;else S.evalOn=b.dataset.v==='1';save();renderMenu();});});
 function renderMenu(){
  ['mode','side','eval','level'].forEach(function(name){Array.prototype.forEach.call($(name+'Seg').querySelectorAll('[data-v]'),function(b){var value=name==='eval'?(S.evalOn?'1':'0'):String(S[name]);b.setAttribute('aria-pressed',String(b.dataset.v===value));});});
  $('levelCard').hidden=S.mode!=='bot';$('sideCard').hidden=S.mode==='duo';$('netCard').hidden=S.mode!=='net';$('playBtn').hidden=S.mode==='net';
  $('setupSlider').value=S.setup;$('setupName').textContent=A.setups[S.setup].name;$('setupCount').textContent=(S.setup+1)+' / 10';$('setupPreview').innerHTML=boardMarkup(A.create(S.setup),true);$('setupPrev').disabled=S.setup===0;$('setupNext').disabled=S.setup===9;
 }
 $('setupSlider').oninput=function(){S.setup=+this.value;save();renderMenu();};
 $('setupPrev').onclick=function(){if(S.setup>0){S.setup--;save();renderMenu();}};$('setupNext').onclick=function(){if(S.setup<9){S.setup++;save();renderMenu();}};
 function makeWorker(){var obj={w:null,id:0,cb:{}};try{obj.w=new Worker(URL.createObjectURL(new Blob([$('core').textContent+'\nonmessage=function(e){var d=e.data;try{postMessage({id:d.id,r:Abalone.think(Abalone.clone(d.s),d.level,d.ms)});}catch(err){postMessage({id:d.id,r:null});}}'],{type:'text/javascript'})));obj.w.onmessage=function(e){var cb=obj.cb[e.data.id];delete obj.cb[e.data.id];if(cb)cb(e.data.r);};obj.w.onerror=function(){var callbacks=obj.cb;obj.cb={};obj.w=null;Object.keys(callbacks).forEach(function(id){callbacks[id](null);});};}catch(e){}return obj;}
 var bot=makeWorker(),analyzer=makeWorker();
 function ask(worker,s,level,ms,cb){if(worker.w){var id=++worker.id;worker.cb[id]=cb;try{worker.w.postMessage({id:id,s:s,level:level,ms:ms});return;}catch(e){delete worker.cb[id];worker.w=null;}}setTimeout(function(){cb(A.think(s,level,Math.min(ms||150,180)));},20);}
 function lineFor(setup,list){if(!Number.isInteger(setup)||!A.setups[setup]||!Array.isArray(list)||list.length>2000)throw Error('Некорректная партия Абалона.');var s=A.create(setup),line=[{s:s,mv:null,by:0}];list.forEach(function(m){var n=A.play(s,m);if(!n)throw Error('В записи есть недопустимый ход.');line.push({s:n,mv:n.last,by:s.turn});s=n;});return line;}
 function newGame(kind,opts){
  opts=opts||{};var setup=opts.setup==null?S.setup:opts.setup,line=lineFor(setup,opts.moves||[]);token++;clearVote();
  G={kind:kind,setup:setup,level:S.level,evalOn:!!S.evalOn,analysis:!!opts.analysis,line:line,s:line[line.length-1].s,moves:line.slice(1).map(function(e){return e.mv;}),sel:[],over:!!line[line.length-1].s.winner,busy:false,endShown:false,netPending:false};
  if(G.analysis)G.evalOn=true;pendingContinuation=null;$('menu').hidden=true;$('game').hidden=false;['endOv','lobbyOv','askOv','toast'].forEach(function(id){$(id).hidden=true;});RV.reset();render();turnLoop();
 }
 function startLocal(){Net2P.close();var kind={1:'me',2:'me'};if(S.mode==='bot')kind[3-S.side]='bot';newGame(kind);}
 function engineAllowed(){return !!G&&(!net()||G.over)&&(G.evalOn||G.analysis||G.over);}
 function canTap(){return !!G&&!G.over&&!G.busy&&!G.netPending&&!G.vote&&G.kind[G.s.turn]==='me'&&!RV.viewing();}
 var RV=Review({
  mount:$('rvMount'),status:$('status'),line:function(){return G?G.line:[{s:A.create(0),mv:null,by:0}];},
  play:function(s,m){return A.play(s,m);},over:function(s){return !!s.winner;},toMove:function(s){return s.turn;},me:function(){return mySide()||1;},meName:function(){return mySide()?'Ты':'Чёрные';},side:function(side){return NAME[side]||'';},same:function(a,b){return a===b;},moveText:function(e){return A.notation(e.mv);},overText:function(s){return NAME[s.winner]+' победили';},engine:engineAllowed,evalOn:function(){return !!G&&(G.evalOn||G.analysis||G.over);},
  analyze:function(s,cb){ask(analyzer,s,2,350,function(r){if(!r)r=A.think(s,0,40);cb(r);if(G)setTimeout(renderEngine,0);});},overEval:function(s){return{p:s.winner===s.turn?1:0,v:s.winner===s.turn?100000:-100000,best:null};},
  redraw:function(){if(!G)return;G.sel=[];render();if(!RV.viewing())turnLoop();},relayout:function(){},active:function(){return !!G&&!$('game').hidden&&$('endOv').hidden&&$('lobbyOv').hidden;}
 });
 function render(){
  if(!G)return;if(GC)GC.sync();if(CONT)CONT.refresh();var d=RV.display(),s=d.s;
  $('board').innerHTML=boardMarkup(s,false,d.hint);$('setupTitle').textContent=A.setups[G.setup].name;$('modeTitle').textContent=G.analysis?'Анализ без часов':net()?'Онлайн':mySide()?'С ботом':'Вдвоём';
  [1,2].forEach(function(side){var id=side===1?'Black':'White',kind=G.kind[side];$('name'+id).textContent=(kind==='bot'?'Бот · ':kind==='net'?'Друг · ':mySide()?'Ты · ':'')+NAME[side].toLowerCase();$('score'+id).textContent='выбито '+s.lost[3-side]+' / 6';$('rack'+id).innerHTML=Array.from({length:6},function(_,i){return'<i class="'+(i<s.lost[3-side]?'full':'')+'"></i>';}).join('');$('pl'+id).classList.toggle('turn',!s.winner&&s.turn===side);});
  if(d.mode==='live')$('status').textContent=G.vote?'Ждём согласия на отмену хода':G.analysis?'Анализ · ходят '+NAME[s.turn].toLowerCase():G.over?(s.winner?NAME[s.winner]+' победили':'Партия завершена'):G.busy?'Бот думает…':G.kind[s.turn]==='net'?'Ходит друг…':'Ходят '+NAME[s.turn].toLowerCase();
  var allowed=d.mode==='live'?canTap():RV.canPlay();$('selectionCount').textContent=G.sel.length;$('selectionText').textContent=G.sel.length?G.sel.map(function(i){return A.cells[i].name;}).join(' · '):'Выбери 1–3 шара в одной линии';
  Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'),function(b){b.disabled=!allowed||!A.legal(s,{cells:G.sel,dir:+b.dataset.dir});});$('clearSelection').disabled=!G.sel.length;$('hintBtn').hidden=!engineAllowed();$('hintBtn').disabled=!!s.winner;$('againBtn').hidden=net()&&Net2P.role()==='guest';$('undoBtn').disabled=!!G.vote||(d.mode==='live'?undoTarget()<0:false);renderNotation();renderEngine();
 }
 function renderNotation(){if(!G)return;var d=RV.display(),at=d.s.path.length,html='<button data-go="0">Начало</button>';G.line.slice(1).forEach(function(e,i){html+='<button data-go="'+(i+1)+'" class="'+(d.mode!=='var'&&at===i+1?'current':'')+'">'+(i%2===0?(i/2+1)+'. ':'')+A.notation(e.mv)+'</button>';});if(d.mode==='var')html+='<div class="branch">Вариант: '+RV.pathHere().map(A.notation).join(' · ')+'</div>';$('notation').innerHTML=html;}
 function renderEngine(){
  if(!G)return;var allowed=engineAllowed();$('enginePanel').hidden=!allowed;if(!allowed)return;var d=RV.display(),r=RV.evalOf(d.s),v=r&&Number.isFinite(r.v)?r.v*(d.s.turn===1?1:-1)/100:null;
  $('engineScore').textContent=d.s.winner?(d.s.winner===1?'1–0':'0–1'):v==null?'…':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);$('engineNote').textContent=r?'Позиция оценена'+(r.depth?' · глубина '+r.depth:''):'Анализирую позицию…';$('bestMove').textContent=r&&r.best?'Лучший ход: '+A.notation(r.best):d.s.winner?'Партия завершена':'Лучший ход…';$('bestMove').dataset.move=r&&r.best||'';$('bestMove').disabled=!r||!r.best||!(d.mode==='live'?canTap():RV.canPlay());
 }
 function selectCell(i){
  if(!G)return;var d=RV.display(),s=d.s;if(!(d.mode==='live'?canTap():RV.canPlay()))return;
  if(s.b[i]===s.turn){var j=G.sel.indexOf(i);if(j>=0)G.sel.splice(j,1);else{var proposed=G.sel.concat([i]);if(proposed.length<=3&&A.groupAxis(proposed)!==-2)G.sel=proposed;else if(G.sel.length===1){var first=G.sel[0],fill=null;for(var dir=0;dir<6&&!fill;dir++){var group=[first],to=first;for(var k=0;k<2;k++){to=A.next[to][dir];if(to<0||s.b[to]!==s.turn)break;group.push(to);if(to===i){fill=group;break;}}}G.sel=fill||[i];}else G.sel=[i];}render();return;}
  if(!G.sel.length)return;var options=[];for(var dir=0;dir<6;dir++){var m=A.legal(s,{cells:G.sel,dir:dir});if(m&&m.cells.some(function(c){return A.next[c][dir]===i;}))options.push(m);}if(options.length===1)tryMove(options[0].key);else if(options.length>1)toast('Уточни направление кнопкой со стрелкой.');
 }
 function tryMove(key){if(!G)return;var d=RV.display();if(d.mode!=='live'){if(RV.canPlay()&&RV.play(key))G.sel=[];return;}if(canTap())submit(key);}
 Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'),function(b){b.onclick=function(){var m=G&&A.legal(RV.display().s,{cells:G.sel,dir:+b.dataset.dir});if(m)tryMove(m.key);};});
 $('clearSelection').onclick=function(){if(G){G.sel=[];render();}};$('notation').onclick=function(e){var b=e.target.closest('[data-go]');if(b)RV.go(+b.dataset.go);};$('bestMove').onclick=function(){if(engineAllowed())tryMove(this.dataset.move);};$('hintBtn').onclick=function(){if(G&&engineAllowed()){G.sel=[];RV.hint();}};
 var drag=null;
 $('board').addEventListener('pointerdown',function(e){if(!G||e.pointerType==='mouse'&&e.button!==0)return;var el=e.target.closest('[data-i]');if(!el)return;var d=RV.display();if(!(d.mode==='live'?canTap():RV.canPlay()))return;e.preventDefault();var i=+el.dataset.i;drag={id:e.pointerId,x:e.clientX,y:e.clientY,i:i,ready:d.s.b[i]===d.s.turn};});
 document.addEventListener('pointerup',function(e){var d=drag;if(!d||d.id!==e.pointerId)return;drag=null;if(!G)return;var dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)<12){selectCell(d.i);return;}if(!d.ready)return;if(G.sel.indexOf(d.i)<0)G.sel=[d.i];var dir=0,best=-Infinity;A.dirs.forEach(function(v,k){var vx=v[0]+v[1]/2,vy=Math.sqrt(3)*v[1]/2,n=vx*dx+vy*dy;if(n>best){best=n;dir=k;}});var m=A.legal(RV.display().s,{cells:G.sel,dir:dir});if(m)tryMove(m.key);else{render();toast('В эту сторону сдвинуть нельзя.');}});
 document.addEventListener('pointercancel',function(){drag=null;});$('board').addEventListener('keydown',function(e){var el=e.target.closest('[data-i]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectCell(+el.dataset.i);}if(e.key==='Escape'&&G){G.sel=[];render();}});
 function submit(key){if(!GC.before())return;if(net()&&Net2P.role()==='guest'){G.netPending=true;Net2P.send({t:'try',key:key,n:G.moves.length});render();}else decide(key);}
 function decide(key){if(!GC.before())return;var m=A.legal(G.s,key);if(!m)return;if(net()&&Net2P.role()==='host')Net2P.send({t:'move',key:m.key,n:G.moves.length});apply(m.key);}
 function apply(key){if(!G||G.over||!GC.before())return;var n=A.play(G.s,key);if(!n)return;var by=G.s.turn;G.s=n;G.moves.push(n.last);G.line.push({s:n,mv:n.last,by:by});G.sel=[];G.busy=false;G.netPending=false;G.over=!!n.winner;RV.sync();render();if(G.over){if(!G.analysis)showEnd();if(net()&&Net2P.role()==='host')GC.publish();}else turnLoop();}
 function turnLoop(){
  if(!G||G.over||G.analysis||G.busy||G.vote||RV.viewing()&&!net()||G.kind[G.s.turn]!=='bot'||net()&&Net2P.role()!=='host')return;
  var g=G,my=token,n=G.moves.length,s=G.s;G.busy=true;render();var ck=GC.info(),budget=A.levels[G.level].ms;if(ck)budget=Math.max(30,Math.min(budget,ck.left[s.turn-1]/25));
  ask(bot,s,G.level,budget,function(r){if(G!==g||token!==my||G.over||G.moves.length!==n)return;G.busy=false;var key=r&&r.best;if(!key){var legal=A.moves(G.s);key=legal[0]&&legal[0].key;}if(key)decide(key);else render();});
 }
 function undoTargetFor(side){for(var k=G.line.length-1;k>=1;k--)if(G.line[k].by===side)return k-1;return-1;}
 function undoTarget(){if(!G)return-1;return mySide()?undoTargetFor(mySide()):G.moves.length-1;}
 function restoreAt(n){token++;clearVote();G.moves=G.moves.slice(0,n);G.line=lineFor(G.setup,G.moves);G.s=G.line[G.line.length-1].s;G.over=!!G.s.winner;G.busy=false;G.netPending=false;G.sel=[];G.endShown=false;$('endOv').hidden=true;RV.reset();render();turnLoop();}
 function clearVote(){if(G&&G.vote){clearTimeout(G.vote.timer);G.vote=null;}$('askOv').hidden=true;}
 function askUndo(){if(!G||G.vote||undoTarget()<0)return;if(!net()){if(RV.viewing()){restoreFromReview();return;}restoreAt(undoTarget());return;}if(Net2P.role()==='host')startVote('host');else Net2P.send({t:'undoReq'});}
 function restoreFromReview(){var list=RV.pathHere();token++;G.moves=list.slice();G.line=lineFor(G.setup,list);G.s=G.line[G.line.length-1].s;G.over=!!G.s.winner;G.busy=false;G.sel=[];RV.reset();render();turnLoop();}
 function startVote(by){if(!G||G.vote||!Net2P.online())return;var side=by==='host'?hostSide:3-hostSide,to=undoTargetFor(side);if(to<0)return;var vote={by:by,to:to,n:G.moves.length};G.vote=vote;vote.timer=setTimeout(function(){if(G&&G.vote===vote)endVote(false);},30000);Net2P.send({t:by==='host'?'undoAsk':'undoWait'});if(by==='friend')$('askOv').hidden=false;render();}
 function endVote(ok){if(!G||!G.vote)return;var vote=G.vote,valid=ok&&vote.n===G.moves.length;clearVote();if(valid){Net2P.send({t:'undo',to:vote.to});restoreAt(vote.to);}else{Net2P.send({t:'undoNo'});render();}}
 $('askYes').onclick=function(){if(Net2P.role()==='host')endVote(true);else Net2P.send({t:'undoVote',ok:true});};$('askNo').onclick=function(){if(Net2P.role()==='host')endVote(false);else Net2P.send({t:'undoVote',ok:false});};$('askText').textContent='Вернуть партию к позиции перед последним ходом друга?';$('undoBtn').onclick=askUndo;
 function showEnd(){if(!G||G.endShown||G.analysis)return;G.endShown=true;$('endTitle').textContent=NAME[G.s.winner]+' победили';$('endText').textContent='Выбито шесть шаров соперника. Можно разобрать партию с движком.';$('endAgain').hidden=net()&&Net2P.role()==='guest';$('endOv').hidden=false;}
 function analyzeFinished(){if(!G)return;token++;clearVote();Net2P.close();G.analysis=true;G.evalOn=true;G.kind={1:'me',2:'me'};G.over=!!G.s.winner;G.busy=false;G.sel=[];G.netPending=false;G.endShown=true;$('endOv').hidden=true;RV.reset();RV.go(0);GC.sync();render();}
 function toMenu(){token++;pendingContinuation=null;clearVote();Net2P.close();G=null;drag=null;$('game').hidden=true;$('menu').hidden=false;['endOv','lobbyOv','askOv','toast'].forEach(function(id){$(id).hidden=true;});GC.sync();renderMenu();}
 function again(){if(net()){if(Net2P.role()==='host')hostStart(true);}else startLocal();}
 $('homeBtn').onclick=toMenu;$('endMenu').onclick=toMenu;$('endLook').onclick=analyzeFinished;$('endAgain').onclick=again;$('againBtn').onclick=again;$('playBtn').onclick=startLocal;$('analyzeBtn').onclick=function(){Net2P.close();newGame({1:'me',2:'me'},{analysis:true});};
 function lobby(title,text,opts){opts=opts||{};$('lbTitle').textContent=title;$('lbText').textContent=text||'';$('lbCode').hidden=!opts.code;$('lbCode').textContent=opts.code||'';$('lbLinkRow').hidden=!opts.link;$('lbLink').value=opts.link||'';$('lbErr').hidden=!opts.err;$('lbErr').textContent=opts.err||'';$('lbRetry').hidden=!opts.err;$('lobbyOv').hidden=false;}
 function packet(){return{t:'sync',side:hostSide,seed:{setup:G.setup,moves:G.moves.slice()},over:G.over,coords:false};}
 function hostGame(){lastJoin=null;hostSide=0;lobby('Создаю игру','Подключаюсь к серверу связи…');Net2P.host({prefix:'abalone-v1-',onReady:function(code,link){lobby('Игра создана','Отправь другу ссылку или код. Партия начнётся, как только он зайдёт.',{code:code,link:link});},onJoin:function(o){if(o.returning&&G&&!pendingContinuation){Net2P.send(packet());GC.publish();}else hostStart(false);},onPeer:function(on){if(G)render();if(!on&&G&&G.vote)endVote(false);},onLeave:function(){toast('Друг вышел из игры.');},onData:hostData,onFail:function(m){lobby('Онлайн с другом','',{err:m});}});}
 function hostStart(swap){if(!hostSide)hostSide=S.side;else if(swap)hostSide=3-hostSide;var seed=pendingContinuation||{setup:swap&&G?G.setup:S.setup,moves:[]};Net2P.send({t:'start',side:hostSide,seed:seed});var kind={};kind[hostSide]='me';kind[3-hostSide]='net';newGame(kind,seed);GC.publish();}
 function hostData(d){if(!d||typeof d!=='object'||GC.receive(d))return;if(d.t==='try'){if(!GC.before())return;var ok=G&&!G.over&&!G.vote&&G.kind[G.s.turn]==='net'&&d.n===G.moves.length&&A.legal(G.s,d.key);if(ok)decide(ok.key);else Net2P.send({t:'nack'});}else if(d.t==='undoReq')startVote('friend');else if(d.t==='undoVote')endVote(!!d.ok);else if(d.t==='needsync'&&G){Net2P.send(packet());GC.publish();}}
 function joinGame(code){lastJoin=code;lobby('Онлайн с другом','Подключаюсь к игре '+Net2P.cleanCode(code)+'…');Net2P.join(code,{prefix:'abalone-v1-',onOpen:function(){lobby('Онлайн с другом','Подключено. Ждём начала…');},onPeer:function(){if(G)render();},onData:guestData,onFail:function(m){lobby('Онлайн с другом','',{err:m});}});}
 function guestData(d){
  if(!d||typeof d!=='object'||GC.receive(d))return;
  if(d.t==='start'||d.t==='sync'){try{var kind={};kind[d.side]='net';kind[3-d.side]='me';newGame(kind,d.seed);if(d.over){G.over=true;G.endShown=true;}render();}catch(e){lobby('Не удалось открыть партию','',{err:e.message});}return;}
  if(!G)return;
  if(d.t==='move'){if(!GC.before())return;G.netPending=false;if(d.n===G.moves.length)apply(d.key);else if(d.n>G.moves.length)Net2P.send({t:'needsync'});}
  else if(d.t==='nack'){G.netPending=false;render();}
  else if(d.t==='undoAsk'){G.vote={};$('askOv').hidden=false;render();}
  else if(d.t==='undoWait'){G.vote={};render();}
  else if(d.t==='undoNo'){clearVote();toast('Ход оставили.');render();}
  else if(d.t==='undo'&&Number.isInteger(d.to)&&d.to>=0&&d.to<=G.moves.length)restoreAt(d.to);
 }
 $('netCreate').onclick=hostGame;$('netJoinBtn').onclick=function(){$('joinRow').hidden=!$('joinRow').hidden;if(!$('joinRow').hidden)$('joinCode').focus();};$('joinCode').oninput=function(){this.value=Net2P.cleanCode(this.value);};$('joinCode').onkeydown=function(e){if(e.key==='Enter')$('joinGo').click();};$('joinGo').onclick=function(){var code=Net2P.cleanCode($('joinCode').value);if(code.length===5)joinGame(code);};$('lbCancel').onclick=toMenu;$('lbRetry').onclick=function(){if(lastJoin)joinGame(lastJoin);else hostGame();};$('lbCopy').onclick=function(){if(navigator.clipboard)navigator.clipboard.writeText($('lbLink').value).catch(function(){$('lbLink').select();});else $('lbLink').select();};
 var GC=GameClock.attach({id:'abalone',labels:['Чёрные','Белые'],state:function(){return G&&!G.analysis?{game:G,turn:G.s.turn-1,moves:G.moves.length,over:G.over,ready:true}:null;},role:function(){return Net2P.role();},send:function(m){Net2P.send(m);},menu:toMenu,analyze:analyzeFinished,expire:function(i){if(!G)return;token++;G.over=true;G.busy=false;G.sel=[];clearVote();render();}});
 CONT=ContinueGame.attach({mount:$('game'),clock:GC,available:function(){return !!G&&!$('game').hidden&&(!net()||G.over)&&(G.analysis||G.over||RV.viewing());},evalOn:function(){return S.evalOn;},level:function(){return S.level;},levels:A.levels.map(function(l){return{label:l.name};}),sides:function(){return[{value:1,label:'Чёрные'},{value:2,label:'Белые'}];},notify:toast,capture:function(){if(RV.display().s.winner)throw Error('Позиция завершена. Вернись на ход назад в анализе.');return{setup:G.setup,moves:RV.pathHere().slice()};},start:function(seed,o){token++;Net2P.close();G.analysis=true;G.busy=false;GC.sync();S.mode=o.mode;S.side=+o.side;S.level=o.level;S.evalOn=o.evalOn;S.setup=seed.setup;save();if(o.mode==='net'){pendingContinuation=seed;hostGame();return;}var kind={1:'me',2:'me'};if(o.mode==='bot')kind[3-S.side]='bot';newGame(kind,seed);}});
 renderMenu();if(window.GAMES_ONLINE&&Net2P.hashCode()){S.mode='net';renderMenu();joinGame(Net2P.hashCode());}
})();
