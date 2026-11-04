// Device-local view state. Never enters game snapshots or network packets.
var BoardView=(function(){
 var views={};
 function defaults(s,save){if(s.localViewVersion!==1){s.evalOn=false;s.coords=false;s.localViewVersion=1;if(save)save();}}
 function attach(a){
  var pref={coords:false,moves:false};try{Object.assign(pref,JSON.parse(sessionStorage.getItem('view-'+a.id)||'{}'));}catch(e){}
    var bar=document.createElement('div');bar.className='local-views';bar.setAttribute('aria-label','Личный вид доски');bar.innerHTML='<button id="viewFlipBtn" title="Перевернуть доску" aria-label="Перевернуть доску">⇅</button><button id="viewCoordBtn" title="Координаты" aria-label="Координаты">a1</button><button id="viewMovesBtn" title="Показывать ходы" aria-label="Показывать ходы">Ходы</button>';document.body.appendChild(bar);
  if(a.horizontal){bar.querySelector('#viewFlipBtn').textContent='↔';bar.querySelector('#viewFlipBtn').title='Отразить доску слева направо: фишки падают сверху';}var ref=null,flipped=false;
  function save(){try{sessionStorage.setItem('view-'+a.id,JSON.stringify(pref));}catch(e){}}
  function paint(){document.body.classList.toggle('view-no-coords',!pref.coords);document.body.classList.toggle('view-no-history',!pref.moves);document.body.classList.toggle('view-analysis',!!(a.analysis&&a.analysis()));bar.querySelector('#viewFlipBtn').setAttribute('aria-pressed',String(flipped));bar.querySelector('#viewCoordBtn').setAttribute('aria-pressed',String(pref.coords));bar.querySelector('#viewMovesBtn').setAttribute('aria-pressed',String(pref.moves));(a.boards||[]).forEach(function(id){var el=document.getElementById(id);if(el){if(a.axes&&!el.querySelector('.view-axis-label')){for(var j=0;j<a.axes;j++){var f=document.createElement('span'),r=document.createElement('span');f.className=r.className='view-axis-label';f.textContent=String.fromCharCode(65+j);r.textContent=String(a.axes-j);f.style.cssText='left:'+((j+.5)/a.axes*100)+'%;top:100%;transform:translate(-50%,2px)';r.style.cssText='left:-12px;top:'+((j+.5)/a.axes*100)+'%;transform:translateY(-50%)';el.appendChild(f);el.appendChild(r);}}el.classList.toggle('local-rotated',flipped&&!a.flip&&!a.horizontal);el.classList.toggle('local-mirrored',flipped&&!!a.horizontal);}});}
  function setFlip(v){flipped=!!v;paint();if(a.flip)a.flip(flipped);}
  function refresh(){var g=a.ref();bar.hidden=!g||document.getElementById('game').hidden;if(g!==ref){ref=g;setFlip(g&&a.autoFlip?!!a.autoFlip():false);}if(a.coords&&pref.coords!==!!a.coords()){pref.coords=!!a.coords();save();}if(a.getFlip)flipped=!!a.getFlip();paint();}
  bar.querySelector('#viewFlipBtn').onclick=function(){setFlip(!flipped);};bar.querySelector('#viewCoordBtn').onclick=function(){pref.coords=!pref.coords;if(a.setCoords)a.setCoords(pref.coords);save();paint();};bar.querySelector('#viewMovesBtn').onclick=function(){pref.moves=!pref.moves;save();paint();window.dispatchEvent(new Event('resize'));};
  document.addEventListener('click',function(e){if(e.target.closest('#tab-nota,#ckTabNota')){pref.moves=true;save();paint();}});var game=document.getElementById('game');if(game)new MutationObserver(refresh).observe(game,{attributes:true,attributeFilter:['hidden']});
  if(a.setCoords)a.setCoords(pref.coords);views[a.id]={refresh:refresh,flipped:function(){return flipped;},setFlip:setFlip};refresh();return views[a.id];
 }
 return{defaults:defaults,attach:attach,isFlipped:function(id){return !!views[id]&&views[id].flipped();},refresh:function(id){if(views[id])views[id].refresh();}};
})();
