(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var A = LavaArt, C = A.colors;
  var CORNER_NAMES = ['↖ Слева сверху', '↗ Справа сверху', '↘ Справа снизу', '↙ Слева снизу'];
  var ROLE_NAMES = {human:'Игрок',bot:'Бот',net:'Друг',off:'Пусто'};
  var ROLE_ORDER = ['human','bot','net','off'];
  var PREFS = 'lava-settings-v2', SAVED = 'lava-local-v1';
  var presets = {
    local: ['off','human','off','human'],
    bots2: ['bot','bot','off','human'],
    bots3: ['bot','bot','bot','human'],
    net: ['off','net','off','human']
  };
  var S = {roles:presets.bots3.slice(),mapId:'classic',first:'3',sound:false};
  try {
    var prefs = JSON.parse(localStorage.getItem(PREFS));
    if (prefs && Array.isArray(prefs.roles) && prefs.roles.length === 4 && prefs.roles.every(function(r){return ROLE_ORDER.includes(r);}) && Lava.map(prefs.mapId)) {
      S = {roles:prefs.roles,mapId:prefs.mapId,first:String(prefs.first),sound:!!prefs.sound};
    }
  } catch (e) {}
  if (window.IN_ROOM) { S.roles = presets.net.slice(); S.first = '3'; }
  var state = null, roles = [], gameSetup = null, cells = [], tokens = [], corners = [];
  var busy = false, pending = false, botTimer = 0, animTimer = 0, toastTimer = 0;
  var epoch = 0, netRound = 0, shownResult = '', audio = null;

  $('artDefinitions').innerHTML = A.definitions();
  $('logoGem').innerHTML = A.gem(3,false);
  $('homeBtn').innerHTML = A.icon('home');
  $('againBtn').innerHTML = A.icon('restart');
  $('legend').innerHTML = '<span>'+A.tile(1,0)+'1 прыжок</span><span>'+A.tile(2,0)+'2 прыжка</span><span>'+A.tile(0,0)+'лава</span>';

  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){$('toast').hidden=true;},3000);
  }
  function savePrefs() { try { localStorage.setItem(PREFS,JSON.stringify(S)); } catch(e) {} }
  function beep(fall) {
    if (!S.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
      var o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
      o.type='triangle'; o.frequency.setValueAtTime(fall?150:380,t);
      o.frequency.exponentialRampToValueAtTime(fall?40:130,t+.18);
      g.gain.setValueAtTime(.065,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);
      o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.23);
    } catch(e) {}
  }
  function readSave() {
    try {
      var s=JSON.parse(localStorage.getItem(SAVED)),r=s&&(s.roles||s.kinds);
      if (s && Lava.valid(s.state) && Array.isArray(r) && r.length===s.state.players.length && r.every(function(k){return k==='human'||k==='bot';})) return {state:s.state,roles:r};
    } catch(e) {}
    return null;
  }
  function saveGame() {
    if (LavaLink.current() || !state) return;
    try {localStorage.setItem(SAVED,JSON.stringify({state:state,roles:roles}));}catch(e){}
  }
  function selectedSetup(randomize) {
    var active=[];
    S.roles.forEach(function(role,c){if(role!=='off')active.push(c);});
    if(active.length<2)throw new Error('Нужно минимум два игрока. Выбери людей или ботов в углах.');
    var first = active.indexOf(Number(S.first));
    if(S.first==='random')first=randomize?Math.floor(Math.random()*active.length):0;
    if(first<0)first=0;
    var cfg=Lava.setup({mapId:S.mapId,corners:active,first:first});
    cfg.roles=active.map(function(c){return S.roles[c];});
    return cfg;
  }
  function setupError() {
    try {
      var cfg=selectedSetup(false);
      if(window.IN_ROOM && (cfg.roles.length!==2 || cfg.roles.filter(function(r){return r==='human';}).length!==1 || cfg.roles.filter(function(r){return r==='net';}).length!==1))return 'В общей комнате выбери два угла: «Игрок» и «Друг». Остальные — «Пусто».';
      if(cfg.roles.includes('net')&&!cfg.roles.includes('human'))return 'Выбери хотя бы один угол «Игрок» для своего устройства.';
      return '';
    }catch(e){return e.message;}
  }

  for(var c=0;c<4;c++){
    var cornerButton=document.createElement('button');
    cornerButton.className='corner';cornerButton.dataset.corner=c;
    cornerButton.style.setProperty('--pc',C[c].face);
    cornerButton.onclick=(function(corner){return function(){
      if(state)return;
      var order=window.IN_ROOM?['human','net','off']:ROLE_ORDER;
      S.roles[corner]=order[(order.indexOf(S.roles[corner])+1)%order.length];
      savePrefs();renderMenu();
    };})(c);
    corners.push(cornerButton);$('corners').appendChild(cornerButton);
  }
  [0,1,3,2].forEach(function(c){
    var row=document.createElement('div');row.className='seat-choice';row.dataset.corner=c;
    row.innerHTML=A.gem(c,false)+'<div><label for="seat-'+c+'">'+CORNER_NAMES[c]+'</label><select id="seat-'+c+'" aria-label="'+C[c].name+' — '+CORNER_NAMES[c]+'"></select></div>';
    var select=row.querySelector('select');
    ROLE_ORDER.forEach(function(role){if(window.IN_ROOM&&role==='bot')return;var o=document.createElement('option');o.value=role;o.textContent=ROLE_NAMES[role];select.appendChild(o);});
    select.onchange=function(){S.roles[c]=select.value;savePrefs();renderMenu();};
    $('seatGrid').appendChild(row);
  });
  Lava.MAPS.forEach(function(m){
    var b=document.createElement('button');b.dataset.map=m.id;b.id='map-'+m.id;
    b.innerHTML='<span class="map-mini" style="--n:'+m.size+'" aria-hidden="true">'+m.rows.join('').split('').map(function(hp){return '<i class="'+(hp==='0'?'hole':hp==='2'?'strong':'')+'"></i>';}).join('')+'</span><span>'+m.name+'</span>';
    b.onclick=function(){S.mapId=m.id;savePrefs();renderMenu();};$('maps').appendChild(b);
  });
  document.querySelectorAll('[data-preset]').forEach(function(b){
    b.onclick=function(){S.roles=presets[b.dataset.preset].slice();S.first='3';savePrefs();renderMenu();};
    if(window.IN_ROOM && b.dataset.preset!=='net')b.disabled=true;
  });
  $('firstSelect').onchange=function(){S.first=this.value;savePrefs();};

  function renderMenu() {
    if(state)return;
    document.querySelectorAll('[data-preset]').forEach(function(b){b.setAttribute('aria-pressed',String(presets[b.dataset.preset].join()===S.roles.join()));});
    document.querySelectorAll('[data-map]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.map===S.mapId));});
    document.querySelectorAll('.seat-choice').forEach(function(el){var c=+el.dataset.corner;el.querySelector('select').value=S.roles[c];el.classList.toggle('off',S.roles[c]==='off');});
    $('mapDescription').textContent=Lava.map(S.mapId).note;
    $('firstSelect').replaceChildren();
    var random=document.createElement('option');random.value='random';random.textContent='Случайно';$('firstSelect').appendChild(random);
    S.roles.forEach(function(r,c){if(r==='off')return;var o=document.createElement('option');o.value=c;o.textContent=C[c].name;$('firstSelect').appendChild(o);});
    if(S.first!=='random'&&S.roles[Number(S.first)]==='off')S.first=String(S.roles.findIndex(function(r){return r==='human';}));
    if(S.first!=='random'&&(Number(S.first)<0||!S.roles[Number(S.first)]||S.roles[Number(S.first)]==='off'))S.first='random';
    $('firstSelect').value=S.first;
    var err=setupError(),net=S.roles.includes('net');
    $('playHint').textContent=err;$('playHint').hidden=!err;
    $('playBtn').disabled=!!err;$('playBtn').innerHTML=A.icon('play')+(net?(window.IN_ROOM?'С другом':'Создать игру'):'Играть');
    $('onCreate').disabled=!!err||!net;
    $('resumeBtn').hidden=!!window.IN_ROOM||!readSave();
    if(window.IN_ROOM)$('onlineHint').textContent='В общей комнате — двое. Углы и карту выбирает хозяин. Для 3–4 друзей открой «Лаву» отдельно.';
    renderCorners();
  }
  function playerName(seat) {return C[Lava.corner(state,seat)].name;}
  function playerRole(seat,n) {
    if(!state.players[seat].alive)return 'Выбыл';
    if(n && !n.online[seat])return 'Нет связи';
    if(roles[seat]==='bot')return 'Бот';
    if(n&&n.role==='guest')return seat===n.seat?'Ты':roles[seat]==='human'?'Хозяин':'Друг';
    if(roles[seat]==='net')return 'Друг';
    return roles.filter(function(r){return r==='human';}).length===1?'Ты':'Игрок';
  }
  function renderCorners() {
    var n=LavaLink.current();
    corners.forEach(function(el,c){
      var seat=state?state.players.findIndex(function(_,i){return Lava.corner(state,i)===c;}):-1;
      var role=state?(seat<0?'off':roles[seat]):S.roles[c];
      el.className='corner'+(role==='off'?' off':'')+(state&&seat>=0&&!state.players[seat].alive?' out':'')+(state&&state.turn===seat?' turn':'');
      el.setAttribute('aria-label',C[c].name+', '+CORNER_NAMES[c]+': '+(state?(seat<0?'не участвует':playerRole(seat,n)):ROLE_NAMES[role]));
      el.innerHTML='<span class="corner-content"><span class="corner-chip">'+A.gem(c,false)+'</span><span class="role-icon">'+A.icon(role)+'</span><span class="corner-kind">'+(state?(seat<0?'':playerRole(seat,n)):ROLE_NAMES[role])+'</span></span>';
    });
  }
  function stopTimers(){clearTimeout(botTimer);clearTimeout(animTimer);busy=false;pending=false;epoch++;}
  function showGame(){if($('lobby').open)$('lobby').close();$('menu').hidden=true;$('game').hidden=false;document.body.classList.add('in-game');resize();}
  function rebuildBoard() {
    cells=[];tokens=[];$('board').replaceChildren();
    var size=state.size||6;document.documentElement.style.setProperty('--N',size);
    $('board').setAttribute('aria-label','Поле '+size+' на '+size);
    state.tiles.forEach(function(_,i){
      var b=document.createElement('button');b.className='tile';b.dataset.cell=i;b.style.setProperty('--x',i%size);b.style.setProperty('--y',Math.floor(i/size));b.style.setProperty('--delay',-(i%7)*.4+'s');
      b.onclick=function(){if(!canAct())return;var p=state.players[state.turn];if(p.pos===i){act(4);return;}for(var d=0;d<4;d++)if(Lava.target(p.pos,d,size)===i){act(d);return;}};
      cells.push(b);$('board').appendChild(b);
    });
    state.players.forEach(function(_,i){
      var t=document.createElement('div');t.className='token no-motion';t.innerHTML='<span class="piece">'+A.gem(Lava.corner(state,i),true)+'</span>';t.setAttribute('aria-hidden','true');tokens.push(t);$('board').appendChild(t);
    });
  }
  function resize() {
    if($('game').hidden)return;
    var r=$('boardWrap').getBoundingClientRect();
    document.documentElement.style.setProperty('--B',Math.floor(Math.max(120,Math.min(r.width,r.height)))+'px');
  }
  window.addEventListener('resize',resize);
  if(document.fonts)document.fonts.ready.then(resize);
  function canAct() {
    if(!state||state.over||busy||pending||$('game').hidden)return false;
    var n=LavaLink.current();
    if(!n)return roles[state.turn]==='human';
    return LavaLink.ready()&&(n.role==='host'?roles[state.turn]==='human':state.turn===n.seat);
  }
  function coord(i){var size=state.size||6;return 'abcdefgh'[i%size]+(size-Math.floor(i/size));}
  function render() {
    if(!state)return;
    var n=LavaLink.current(),size=state.size||6,can=canAct(),p=state.over?null:state.players[state.turn];
    var legal=can?Lava.moves(state,state.turn,false):[],active=p?C[Lava.corner(state,state.turn)]:C[3];
    document.documentElement.style.setProperty('--active-color',active.face);document.documentElement.style.setProperty('--active-dark',active.dark);
    renderCorners();
    cells.forEach(function(b,i){
      var hp=state.tiles[i],dir=p&&p.pos===i?4:-1;
      if(p)for(var d=0;d<4;d++)if(Lava.target(p.pos,d,size)===i)dir=d;
      if(b.dataset.hp!==String(hp)){b.dataset.hp=hp;b.innerHTML=A.tile(hp,i)+'<span class="target" aria-hidden="true"></span>';}
      var allowed=legal.includes(dir),occupant=state.players.findIndex(function(q){return q.alive&&q.pos===i;});
      b.className='tile'+(hp===0?' hole':'')+(allowed?' can':'');b.disabled=!allowed;
      b.querySelector('.target').textContent=allowed&&dir<4?Lava.DIRS[dir].label:'';
      b.setAttribute('aria-label',coord(i)+': '+(hp===0?'лава':hp+' '+(hp===2?'слоя':'слой'))+(occupant>=0?', '+playerName(occupant):'')+(allowed?', '+(dir===4?(hp===1?'на месте: падение':'прыгнуть на месте'):'прыгнуть сюда'):''));
    });
    tokens.forEach(function(t,i){
      var q=state.players[i];t.hidden=!q.alive;t.classList.toggle('turn',state.turn===i);
      t.style.setProperty('--x',q.pos%size);t.style.setProperty('--y',Math.floor(q.pos/size));
      t.querySelectorAll('.gem-arrow').forEach(function(a,d){a.classList.toggle('blocked',q.back===d);});
    });
    var mine=p&&(n&&n.role==='guest'?state.turn===n.seat:roles.filter(function(r){return r==='human';}).length===1&&roles[state.turn]==='human');
    $('turnName').textContent=state.over?(state.winner===null?'Ничья':playerName(state.winner)+' победил!'):(mine?'Твой ход':playerName(state.turn)+(roles[state.turn]==='bot'?' думает…':' ходит'));
    $('turnName').style.color=state.over?(state.winner===null?'':C[Lava.corner(state,state.winner)].light):active.light;
    $('status').textContent=state.over?'Последний над лавой':n&&!LavaLink.ready()?'Ждём восстановления связи':pending?'Отправляем ход…':busy?'':p.back<0?'Прыжок в любую сторону':'Назад '+Lava.DIRS[p.back].label+' нельзя · на месте — разворот';
    $('turnNumber').textContent=state.over?'Прыжков: '+state.ply:'Ход '+(state.ply+1);
    $('mapName').textContent='· '+(Lava.map(state.mapId)||Lava.map('classic')).name+' '+size+'×'+size;
    $('jumpBtn').disabled=!can;$('jumpBtn').classList.toggle('danger',!!p&&state.tiles[p.pos]===1);
    $('jumpBtn').innerHTML=A.icon('jump')+'<span>На месте'+(p&&state.tiles[p.pos]===1?'<small>падение</small>':'')+'</span>';
    $('jumpBtn').title=p&&state.tiles[p.pos]===1?'Последний слой: этот прыжок приведёт к падению':'Прыгнуть на месте и снять запрет направления';
    $('soundBtn').innerHTML=A.icon(S.sound?'sound':'mute');$('soundBtn').setAttribute('aria-pressed',String(S.sound));$('soundBtn').setAttribute('aria-label',S.sound?'Выключить звук':'Включить звук');
    $('againBtn').disabled=!!n&&(!state.over||n.role!=='host'||!n.online.every(Boolean));
    $('netWarning').hidden=!n||LavaLink.ready();$('netWarningText').textContent=n?(n.error||'Ждём отключившегося игрока. Его угол сохранён.'):'';$('reconnectBtn').hidden=!n||n.role!=='guest';
    if(state.over){
      var key=(n?n.round:epoch)+':'+state.ply;
      if(shownResult!==key){shownResult=key;$('winnerGem').innerHTML=state.winner===null?'':A.gem(Lava.corner(state,state.winner),false);$('resultTitle').textContent=state.winner===null?'Ничья':playerName(state.winner)+' победил!';$('resultText').textContent='Прыжков: '+state.ply+'.'+(n&&n.role==='guest'?' Реванш начинает хозяин.':' Сыграем ещё?');$('resultAgain').hidden=!!n&&n.role==='guest';$('resultAgain').disabled=!!n&&!n.online.every(Boolean);$('result').showModal();}
    }
  }
  function animate(old) {
    if(!state||!old||!state.last||state.ply!==old.ply+1)return;
    var l=state.last,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,size=state.size||6;
    if(!reduced){
      var token=tokens[l.seat];
      if(!token.hidden)token.querySelector('.piece').animate([{transform:'scale(1)'},{transform:'translateY(-20%) scale(1.18)',offset:.45},{transform:'scale(1)'}],{duration:300,easing:'ease-out'});
      else {
        var ghost=token.cloneNode(true);ghost.hidden=false;ghost.className='token';ghost.style.setProperty('--x',l.from%size);ghost.style.setProperty('--y',Math.floor(l.from/size));$('board').appendChild(ghost);
        ghost.querySelector('.piece').animate([{transform:'scale(1)'},{transform:'translateY(18%) scale(.1)',opacity:0}],{duration:360,easing:'ease-in'}).onfinish=function(){ghost.remove();};
      }
      cells[l.from].querySelector('svg').animate([{filter:'brightness(1.6)'},{filter:'brightness(1)'}],{duration:350});
      var unit=$('board').clientWidth/size;
      for(var f=0;f<6;f++){
        var shard=document.createElement('i');shard.className='frag';shard.style.left=((l.from%size+.4)*unit)+'px';shard.style.top=((Math.floor(l.from/size)+.4)*unit)+'px';$('board').appendChild(shard);
        var angle=f*Math.PI/3,dx=Math.cos(angle)*unit*.65,dy=Math.sin(angle)*unit*.65;
        var anim=shard.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+dx+'px,'+dy+'px) rotate('+(f*73)+'deg) scale(.25)',opacity:0}],{duration:420,easing:'ease-out'});
        anim.onfinish=(function(el){return function(){el.remove();};})(shard);
      }
    }
    beep(l.eliminated.length>0);
  }
  function finishAnimation() {var captured=epoch;clearTimeout(animTimer);animTimer=setTimeout(function(){if(captured!==epoch)return;busy=false;render();schedule();},330);}
  function commit(dir,seat) {
    if(!state||state.turn!==seat||busy)return;
    var next=Lava.apply(state,dir);if(!next)return;
    var old=state;tokens.forEach(function(t){t.classList.remove('no-motion');});state=next;pending=false;busy=true;saveGame();
    if(LavaLink.current())LavaLink.update(state);else render();
    animate(old);finishAnimation();
  }
  function act(dir) {
    if(!canAct()||!Lava.moves(state,state.turn,false).includes(dir))return;
    var n=LavaLink.current();
    if(!n){commit(dir,state.turn);return;}
    if(n.role==='host'){LavaLink.act(dir);return;}
    pending=true;render();
    if(!LavaLink.act(dir)){pending=false;render();}
    else {clearTimeout(animTimer);animTimer=setTimeout(function(){pending=false;render();},4000);}
  }
  function schedule() {
    clearTimeout(botTimer);
    var n=LavaLink.current();
    if(!state||state.over||busy||$('game').hidden||roles[state.turn]!=='bot'||n&&(n.role!=='host'||!LavaLink.ready()))return;
    var captured=epoch;
    botTimer=setTimeout(function(){if(captured!==epoch||!state||state.over||LavaLink.current()&&!LavaLink.ready())return;var d=Lava.bot(state);if(d!==null)commit(d,state.turn);},650);
  }
  function localStart(saved) {
    LavaLink.close();stopTimers();
    if(saved){state=saved.state;roles=saved.roles.slice();gameSetup={mapId:state.mapId||'classic',corners:state.players.map(function(_,i){return Lava.corner(state,i);}),first:0,roles:roles.slice()};}
    else {gameSetup=selectedSetup(true);roles=gameSetup.roles.slice();state=Lava.create(gameSetup);}
    shownResult='';if($('result').open)$('result').close();rebuildBoard();showGame();saveGame();render();schedule();
  }
  $('playBtn').onclick=function(){if(setupError()){toast(setupError());return;}if(S.roles.includes('net'))host();else localStart();};
  $('resumeBtn').onclick=function(){var s=readSave();if(s)localStart(s);};
  $('jumpBtn').onclick=function(){act(4);};
  document.addEventListener('keydown',function(e){
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]')||e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
    var keys={ArrowUp:0,w:0,ц:0,ArrowRight:1,d:1,в:1,ArrowDown:2,s:2,ы:2,ArrowLeft:3,a:3,ф:3,' ':4},dir=keys[e.key];
    if(dir!==undefined&&!$('game').hidden){e.preventDefault();act(dir);}
  });
  $('soundBtn').onclick=function(){S.sound=!S.sound;savePrefs();beep(false);render();};
  function showRules() {$('rulesDialog').showModal();}
  $('rulesBtn').onclick=showRules;$('gameRulesBtn').onclick=showRules;$('rulesClose').onclick=function(){$('rulesDialog').close();};
  function home() {
    stopTimers();LavaLink.close();state=null;roles=[];
    document.querySelectorAll('dialog[open]').forEach(function(d){d.close();});
    $('game').hidden=true;$('menu').hidden=false;document.body.classList.remove('in-game');
    if(!window.IN_ROOM&&location.hash)history.replaceState(null,'',location.pathname+location.search);
    renderMenu();$('menu').scrollTop=0;
  }
  $('homeBtn').onclick=function(){var n=LavaLink.current();if(n&&state&&!state.over)$('leaveDialog').showModal();else home();};
  $('endMenu').onclick=home;$('leaveConfirm').onclick=home;$('leaveCancel').onclick=function(){$('leaveDialog').close();};
  function restart() {
    var n=LavaLink.current();
    if(n&&(!state.over||n.role!=='host'||!n.online.every(Boolean)))return;
    stopTimers();shownResult='';if($('result').open)$('result').close();if($('restartDialog').open)$('restartDialog').close();
    if(n){LavaLink.start(Lava.create(n.cfg));return;}
    state=Lava.create(gameSetup);roles=gameSetup.roles.slice();rebuildBoard();saveGame();render();schedule();
  }
  $('againBtn').onclick=function(){if(LavaLink.current()||state.over)restart();else $('restartDialog').showModal();};
  $('resultAgain').onclick=restart;$('restartConfirm').onclick=restart;$('restartCancel').onclick=function(){$('restartDialog').close();};
  $('viewBtn').onclick=function(){$('result').close();};

  function renderLobby(n) {
    $('lbCode').textContent=n.ready?n.code:'…';
    $('lbText').textContent=n.error||(n.role==='host'?(n.ready?'Отправь друзьям ссылку. Начнём, когда все на месте.':'Создаём игру…'):'Выбери свободный угол и дождись старта от хозяина.');
    $('lbLinkRow').hidden=n.role!=='host'||!n.ready||!!window.IN_ROOM;
    $('lbLink').value=location.origin+location.pathname+location.search+'#'+n.code;
    $('lbStart').hidden=n.role!=='host';$('lbStart').disabled=!LavaLink.ready();$('lbStart').textContent=LavaLink.ready()?'Играть':'Ждём друзей';$('lbRetry').hidden=!n.error;
    $('lobbyMap').textContent=n.cfg?'Карта: '+Lava.map(n.cfg.mapId).name+' · '+Lava.map(n.cfg.mapId).size+'×'+Lava.map(n.cfg.mapId).size:'';
    $('lobbyPlayers').replaceChildren();
    if(n.cfg)[0,1,3,2].forEach(function(c){
      var seat=n.cfg.corners.indexOf(c),role=seat<0?'off':n.cfg.roles[seat],mine=n.role==='host'?role==='human':seat===n.seat;
      var el=document.createElement('div');el.className='lobby-player'+(mine?' mine':'');el.innerHTML=A.gem(c,false);
      var body=document.createElement('div'),where=document.createElement('small'),label=document.createElement('b');where.textContent=CORNER_NAMES[c];label.textContent=role==='off'?'Пусто':mine?'Ты':role==='bot'?'Бот':n.online[seat]?(role==='human'?'Хозяин':'Друг'):'Свободно';body.append(where,label);
      if(n.role==='guest'&&role==='net'&&!n.online[seat]){var b=document.createElement('button');b.textContent='Занять';b.setAttribute('aria-label','Занять '+C[c].name.toLowerCase()+' угол');b.onclick=function(){LavaLink.chooseSeat(seat);};body.appendChild(b);}
      el.appendChild(body);$('lobbyPlayers').appendChild(el);
    });
    if(!$('lobby').open)$('lobby').showModal();
  }
  function netChange(n) {
    if(!n.state){renderLobby(n);return;}
    var old=state,fresh=!old||netRound!==n.round,moved=!!old&&!fresh&&n.state.ply===old.ply+1;
    netRound=n.round;state=n.state;roles=n.cfg.roles.slice();gameSetup=n.cfg;pending=false;
    if(fresh){stopTimers();shownResult='';if($('result').open)$('result').close();rebuildBoard();}
    else if(moved)tokens.forEach(function(t){t.classList.remove('no-motion');});
    if(moved&&n.role==='guest')busy=true;
    showGame();render();
    if(moved&&n.role==='guest'){animate(old);finishAnimation();}else if(!busy)schedule();
  }
  var handlers={change:netChange,move:function(d,seat){commit(d,seat);}};
  function host() {
    if(setupError()){toast(setupError());return;}
    try {var cfg=selectedSetup(true);if(!cfg.roles.includes('net'))throw new Error('Выбери место «Друг» для онлайн-игры.');stopTimers();state=null;netRound=0;shownResult='';LavaLink.host(cfg,handlers);}
    catch(e){toast(e.message);}
  }
  function join(code){stopTimers();state=null;netRound=0;shownResult='';LavaLink.join(code,handlers);}
  $('onCreate').onclick=host;
  $('onJoin').onclick=function(){$('joinRow').hidden=!$('joinRow').hidden;if(!$('joinRow').hidden)$('joinCode').focus();};
  $('joinCode').oninput=function(){this.value=LavaLink.clean(this.value);};
  $('joinCode').onkeydown=function(e){if(e.key==='Enter')$('joinGo').click();};
  $('joinGo').onclick=function(){var c=LavaLink.clean($('joinCode').value);if(c.length!==5){toast('В коде должно быть 5 символов');return;}join(c);};
  $('lbStart').onclick=function(){var n=LavaLink.current();if(n)LavaLink.start(Lava.create(n.cfg));};
  $('lbCancel').onclick=home;
  $('lobby').addEventListener('cancel',function(e){e.preventDefault();home();});
  function retry(){var n=LavaLink.current();if(!n)return;var c=n.code;if(n.role==='guest')join(c);else host();}
  $('lbRetry').onclick=retry;$('reconnectBtn').onclick=retry;
  $('copyBtn').onclick=async function(){try{await navigator.clipboard.writeText($('lbLink').value);toast('Ссылка скопирована');}catch(e){$('lbLink').focus();$('lbLink').select();toast('Выделил ссылку — скопируй её');}};
  renderMenu();var hash=/^#([A-Za-z0-9]{5})$/.exec(location.hash);if(hash)join(hash[1]);
})();
