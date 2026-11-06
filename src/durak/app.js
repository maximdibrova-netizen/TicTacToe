(function () {
  'use strict';

  const D = Durak, $ = id => document.getElementById(id);
  const ID = 'durak', PREFIX = 'durak-v1-';
  const SUIT_NAME = ['трефы','бубны','червы','пики'];
  const SUIT_CARD = ['треф','бубен','червей','пик'];
  const RANK_NAME = ['6','7','8','9','10','Валет','Дама','Король','Туз'];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionLayer = $('cardMotion');
  const deckImage = new Image();
  deckImage.src = 'cards/deck.webp';
  const artReady = deckImage.decode().catch(() => {});
  const prefs = {mode:'bot',count:2};
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(ID+'-settings') || '{}')); } catch (e) {}
  if (prefs.mode !== 'net') prefs.mode = 'bot';
  if (![2,3,4].includes(prefs.count)) prefs.count = 2;

  let game = null, drag = null, botTimer = 0, pauseTimer = 0, toastTimer = 0, lastJoin = null;
  function save() {
    try { localStorage.setItem(ID+'-settings',JSON.stringify(prefs)); } catch (e) {}
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2400);
  }
  function renderMenu() {
    const online = prefs.mode === 'net';
    $('modeSeg').querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.mode === prefs.mode)));
    $('countSeg').querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed',String(Number(b.dataset.count) === prefs.count)));
    $('countCard').hidden = online;
    $('netCard').hidden = !online;
    $('playBtn').hidden = online;
  }
  $('modeSeg').onclick = e => {
    const b = e.target.closest('[data-mode]');
    if (b) { prefs.mode = b.dataset.mode; save(); renderMenu(); }
  };
  $('countSeg').onclick = e => {
    const b = e.target.closest('[data-count]');
    if (b) { prefs.count = Number(b.dataset.count); save(); renderMenu(); }
  };

  function cardName(card) { return RANK_NAME[D.rank(card)]+' '+SUIT_CARD[D.suit(card)]; }
  function cardsLabel(n) {
    const one = n % 10, tens = n % 100;
    return n + (tens >= 11 && tens <= 14 ? ' карт' : one === 1 ? ' карта' : one >= 2 && one <= 4 ? ' карты' : ' карт');
  }
  function playerName(seat) {
    if (seat === game.seat) return 'Ты';
    return game.online ? 'Друг' : game.view.count === 2 ? 'Бот' : 'Бот '+seat;
  }
  function cardMarkup(card, cls = '', button = false) {
    const tag = button ? 'button' : 'div';
    const position = (D.rank(card)*100/9)+'% '+(D.suit(card)*100/3)+'%';
    return '<'+tag+' '+(button?'type="button"':'role="img"')+' class="card-face '+cls+'" style="background-position:'+position
      +'" data-card="'+card+'" aria-label="'+cardName(card)+'"></'+tag+'>';
  }
  function isOut(v, seat) {
    return !v.deckCount && !v.counts[seat] && (v.phase === 'lead' || v.phase === 'end' || seat !== v.defender);
  }
  function canAct() {
    return !!game && !game.moving && !game.pending && !game.view.result && game.view.actor === game.seat
      && (!game.online || Net2P.online());
  }
  function resultTitle(v) {
    if (v.result.loser === null) return 'Ничья';
    if (v.result.reason === 'resign') return v.result.loser === game.seat ? 'Ты сдался' : playerName(v.result.loser)+' сдался';
    return v.result.loser === game.seat ? 'Ты проиграл' : 'Ты вышел из игры';
  }
  function currentStatus(v) {
    if (v.result) return resultTitle(v);
    if (game.online && !Net2P.online()) return 'Связь с другом потеряна';
    if (game.dealing) return 'Раздача';
    if (game.paused) return v.resolved.taking ? 'Карты взяты' : 'Бито';
    if (game.pending) return 'Отправляем ход…';
    if (v.actor === game.seat) {
      if (v.phase === 'lead') return 'Твой ход';
      if (v.phase === 'defend') return 'Ты отбиваешься';
      return v.taking ? 'Соперник берёт' : 'Твой ход · подкидывание';
    }
    if (isOut(v,game.seat)) return 'Ты вышел из игры';
    const who = playerName(v.actor);
    if (v.phase === 'lead') return who+' ходит';
    if (v.phase === 'defend') return who+' отбивается';
    return who+' · подкидывание';
  }
  function render() {
    if (!game) return;
    if (drag) releaseDrag(false);
    const v = game.view, act = canAct();
    $('modeTitle').textContent = 'Подкидной · '+(game.online ? 'онлайн' : v.count+' игрока');
    $('players').innerHTML = Array.from({length:v.count-1},(_,offset) => {
      const i = (game.seat+1+offset)%v.count, n = v.counts[i];
      const out = isOut(v,i);
      return '<div class="player'+(out?' out':'')+(v.actor===i&&!game.paused?' turn':'')+'" data-seat="'+i+'">'
        +'<span class="rival-stack" aria-hidden="true">'+'<i class="card-back"></i>'.repeat(Math.min(n,3))+'</span>'
        +'<span class="player-name">'+playerName(i)+'</span><small>'+(out?'Вышел':cardsLabel(n))+'</small></div>';
    }).join('');
    $('status').textContent = currentStatus(v);
    $('status').classList.toggle('my-turn',act);
    $('stock').innerHTML = v.deckCount
      ? '<div class="stock-art'+(v.deckCount>1?' piled':'')+'">'+cardMarkup(v.trumpCard,'stock-trump')+(v.deckCount>1?'<i class="card-back" aria-hidden="true"></i>':'')+'</div><span>'+cardsLabel(v.deckCount)+'</span>'
      : '<span class="empty-pile" aria-hidden="true">'+D.SUITS[v.trump]+'</span><span>Пусто</span>';
    $('stock').setAttribute('aria-label','Козырь — '+SUIT_NAME[v.trump]+'. В колоде '+cardsLabel(v.deckCount));
    const trumpLabel = (v.deckCount ? D.RANKS[D.rank(v.trumpCard)]+' ' : '')+D.SUITS[v.trump];
    $('stock').insertAdjacentHTML('afterbegin','<span class="pile-label">Козырь <b class="'+(v.trump===1||v.trump===2?'red-suit':'')+'">'+trumpLabel+'</b></span>');
    $('discard').setAttribute('aria-label','Отбой · '+cardsLabel(v.discardCount));
    $('discard').innerHTML = '<span class="pile-label">Отбой</span>'+(v.discardCount ? '<i class="card-back" aria-hidden="true"></i>' : '<i class="empty-pile" aria-hidden="true"></i>')
      +'<span>'+v.discardCount+'</span>';

    const past = (game.paused || (v.result && !v.table.length)) && v.resolved;
    const table = past ? past.table : v.table;
    const pairs = $('pairs'), tableKey = table.map(pair => pair.attack+':'+pair.cover).join(',');
    if (pairs.dataset.cards !== tableKey) {
      pairs.dataset.cards = tableKey;
      pairs.innerHTML = table.length ? table.map(pair => '<div class="pair">'+cardMarkup(pair.attack,'attack')
        +(pair.cover===null?'':cardMarkup(pair.cover,'cover'))+'</div>').join('') : '<div class="table-mark" aria-hidden="true">♠</div>';
    }
    $('takeBtn').hidden = !act || v.phase !== 'defend';
    $('passBtn').hidden = !act || v.phase !== 'throw';
    $('passBtn').textContent = v.taking ? 'Не подкидывать' : v.count === 2 ? 'Бито' : 'Не подкидывать';
    $('handInfo').textContent = cardsLabel(v.hand.length);
    const order = card => (D.suit(card) === v.trump ? 4 : D.suit(card))*9 + D.rank(card);
    const hand = $('hand');
    hand.classList.toggle('can-play',act);
    hand.classList.toggle('crowded',v.hand.length>6);
    const cards = v.hand.slice().sort((a,b)=>order(a)-order(b));
    if (hand.dataset.cards !== cards.join(',')) {
      hand.dataset.cards = cards.join(',');
      hand.innerHTML = cards.length ? cards.map(card => cardMarkup(card,'',true)).join('') : '<p class="hint">На руках пусто</p>';
    }
    for (const button of hand.querySelectorAll('button')) button.setAttribute('aria-disabled',String(!act));

    $('endOv').hidden = !v.result;
    $('againBtn').hidden = !!v.result || (game.online && Net2P.role() === 'guest');
    $('endAgain').hidden = game.online && Net2P.role() === 'guest';
    if (v.result) {
      $('endTitle').textContent = resultTitle(v);
      $('endText').textContent = v.result.reason === 'cards'
        ? v.result.loser === game.seat ? 'У остальных больше нет карт.' : 'С картами остался '+playerName(v.result.loser).toLowerCase()+'.'
        : v.result.reason === 'draw' ? 'Никто не проиграл.' : 'Партия закончилась сдачей.';
    }
  }

  function clearTimers() {
    clearTimeout(botTimer); clearTimeout(pauseTimer);
    botTimer = pauseTimer = 0;
    for (const layer of [motionLayer,$('pairs')]) {
      layer.getAnimations({subtree:true}).forEach(animation => animation.cancel());
    }
    motionLayer.replaceChildren();
    for (const card of $('game').querySelectorAll('.motion-hidden')) card.classList.remove('motion-hidden');
  }
  function seatOrigin(seat) {
    return (seat === game.seat ? $('hand') : $('players').querySelector('[data-seat="'+seat+'"] .rival-stack'))?.getBoundingClientRect();
  }
  function flyCard(card, origin, {duration, delay = 0, faceDown = false}) {
    if (!origin || !card) return 0;
    const target = card.getBoundingClientRect();
    const width = card.offsetWidth, height = card.offsetHeight;
    const dx = target.left+target.width/2-origin.left-origin.width/2;
    const dy = target.top+target.height/2-origin.top-origin.height/2;
    const flying = document.createElement('div');
    flying.className = (faceDown?'card-back':'card-face')+' card-in-flight';
    if (!faceDown) flying.style.backgroundPosition = card.style.backgroundPosition;
    Object.assign(flying.style,{width:width+'px',height:height+'px',left:origin.left+(origin.width-width)/2+'px',top:origin.top+(origin.height-height)/2+'px'});
    motionLayer.append(flying);
    card.classList.add('motion-hidden');
    const scale = Math.max(.62,Math.min(1.3,origin.width/width));
    const angle = card.classList.contains('cover') ? 7 : 0;
    const frames = [
      {transform:'scale('+scale+') rotate(-8deg)',opacity:delay?0:1},
      {transform:'translate3d('+dx*.53+'px,'+(dy*.47-22)+'px,0) scale(1.08) rotate(4deg)',opacity:1,offset:.46},
      {transform:'translate3d('+dx+'px,'+dy+'px,0) rotate('+angle+'deg)',opacity:1}
    ];
    if (delay) frames.splice(1,0,{transform:frames[0].transform,opacity:1,offset:.035});
    const flight = flying.animate(frames,{duration,delay,fill:'both',easing:'cubic-bezier(.36,.18,.28,1)'});
    flight.onfinish = () => { flying.remove(); card.classList.remove('motion-hidden'); };
    return duration+delay;
  }
  function collectTable({taking,defender}, delay) {
    const target = taking ? seatOrigin(defender) : $('discard').querySelector('.card-back,.empty-pile')?.getBoundingClientRect();
    if (!target) return delay;
    const cards = $('pairs').querySelectorAll('.card-face');
    const duration = reducedMotion.matches ? 140 : 440;
    cards.forEach((card,index) => {
      const r = card.getBoundingClientRect();
      const x = target.left + (target.width-r.width)/2 - r.left;
      const y = target.top + (target.height-r.height)/2 - r.top;
      const base = getComputedStyle(card).transform;
      const end = reducedMotion.matches ? base : 'translate3d('+x+'px,'+y+'px,0) scale(.42) '+(base==='none'?'':base);
      card.animate([{transform:base,opacity:1},{transform:end,opacity:0}],
        {delay:delay + index*10,duration,fill:'forwards',easing:'cubic-bezier(.48,0,.76,.5)'});
    });
    return delay+duration+cards.length*10;
  }
  function afterMotion(duration) {
    const current = game;
    pauseTimer = setTimeout(() => {
      if (game !== current) return;
      game.moving = game.paused = game.dealing = false;
      render(); scheduleBot();
    },duration);
  }
  function dealCards() {
    const stock = $('stock').querySelector('.stock-art .card-back')?.getBoundingClientRect();
    const hand = $('hand').querySelectorAll('button');
    const opponents = Array.from($('players').querySelectorAll('.rival-stack'), stack => stack.children);
    const destinations = [...opponents,hand];
    let step = 0;
    for (let index=0;index<hand.length;index++) {
      for (const cards of destinations) {
        if (cards[index]) flyCard(cards[index],stock,{duration:430,delay:step++*46,faceDown:true});
      }
    }
    afterMotion(430+step*46);
  }
  function showView(next, animate) {
    clearTimers();
    const previous = game.view;
    const last = next.last;
    const played = animate && previous.version < next.version && last?.type === 'card' && D.isCard(last.card)
      && Number.isInteger(last.seat) && (last.card !== previous.last?.card || last.seat !== previous.last.seat);
    const origin = played && (game.cardOrigin || seatOrigin(last.seat));
    game.paused = !!(animate && !next.result && next.resolved && next.resolved.round !== previous.resolved?.round);
    game.moving = !!(game.paused || played);
    game.dealing = false;
    game.cardOrigin = null;
    game.view = next;
    game.pending = false;
    render();
    let duration = 0;
    if (played) {
      const card = $('pairs').querySelector('[data-card="'+last.card+'"]');
      if (card && reducedMotion.matches) {
        duration = 150;
        card.animate([{opacity:0},{opacity:1}],duration);
      } else duration = flyCard(card,origin,{duration:last.seat===game.seat?380:620});
    }
    if (game.paused) duration = collectTable(next.resolved,duration+190);
    if (game.moving) afterMotion(duration);
    else scheduleBot();
  }
  function enter(options, initial) {
    clearTimers();
    const dealing = initial.version===0 && !reducedMotion.matches;
    game = {...options,view:initial,pending:false,paused:false,moving:dealing,dealing};
    if ($('lobby').open) $('lobby').close();
    if ($('restartDialog').open) $('restartDialog').close();
    $('menu').hidden = true; $('game').hidden = false;
    $('game').scrollTop = 0;
    render();
    if (dealing) {
      const current = game;
      artReady.then(() => { if (game === current && game.dealing) dealCards(); });
    } else scheduleBot();
  }
  function sendState() {
    return Net2P.send({t:'state',id:game.id,view:D.view(game.state,1)});
  }
  function update(next) {
    if (!next) return false;
    game.state = next;
    showView(D.view(next,game.seat),true);
    if (game.online) sendState();
    return true;
  }
  function scheduleBot() {
    clearTimeout(botTimer);
    if (!game || game.online || game.moving || game.view.result || game.state.actor === game.seat) return;
    const current = game, state = game.state;
    botTimer = setTimeout(() => {
      if (game !== current || game.state !== state || game.moving) return;
      const seat = state.actor;
      update(D.play(state,seat,D.bot(D.view(state,seat))));
    },isOut(game.view,game.seat)?180:300);
  }
  function act(action) {
    if (!canAct()) return false;
    if (game.online && Net2P.role() === 'guest') {
      game.pending = Net2P.send({t:'try',id:game.id,version:game.view.version,action});
      if (game.pending) render();
      return game.pending;
    }
    return update(D.play(game.state,game.seat,action));
  }

  function playCard(card, origin) {
    if (!canAct() || !D.legal(game.view).cards.includes(card)) return false;
    game.cardOrigin = origin;
    if (act({type:'card',card})) return true;
    game.cardOrigin = null;
    return false;
  }
  const hand = $('hand');
  const dropZone = $('pairs');
  function overTable(e) {
    const bounds = dropZone.getBoundingClientRect();
    return e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom;
  }
  function releaseDrag(returnToHand) {
    if (!drag) return;
    const {id, button, ghost} = drag;
    drag = null;
    dropZone.classList.remove('drag-over');
    button.classList.remove('drag-origin');
    if (hand.hasPointerCapture(id)) hand.releasePointerCapture(id);
    if (!ghost) return;
    if (!returnToHand || reducedMotion.matches) { ghost.remove(); return; }
    const target = button.getBoundingClientRect();
    const animation = ghost.animate([{left:ghost.style.left,top:ghost.style.top}, {left:target.left+'px',top:target.top+'px'}],
      {duration:180,easing:'ease-out'});
    animation.onfinish = () => ghost.remove();
  }
  hand.onpointerdown = e => {
    const button = e.target.closest('button[data-card]');
    if (!button || !e.isPrimary || e.button !== 0 || drag) return;
    drag = {id:e.pointerId,button,x:e.clientX,y:e.clientY,scroll:hand.scrollLeft,mode:null,ghost:null};
    hand.setPointerCapture(e.pointerId);
  };
  hand.onpointermove = e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
    if (!drag.mode) {
      if (Math.hypot(dx,dy) < 7) return;
      if (hand.scrollWidth > hand.clientWidth && Math.abs(dx) > Math.abs(dy)*1.25) drag.mode = 'scroll';
      else if (canAct()) {
        drag.mode = 'card';
        drag.bounds = drag.button.getBoundingClientRect();
        drag.ghost = drag.button.cloneNode(true);
        drag.ghost.tabIndex = -1;
        drag.ghost.setAttribute('aria-hidden','true');
        drag.ghost.classList.add('drag-card');
        drag.ghost.style.width = drag.bounds.width+'px';
        document.body.append(drag.ghost);
        drag.button.classList.add('drag-origin');
      } else return;
    }
    if (drag.mode === 'scroll') { hand.scrollLeft = drag.scroll-dx; return; }
    drag.ghost.style.left = drag.bounds.left+dx+'px';
    drag.ghost.style.top = drag.bounds.top+dy+'px';
    dropZone.classList.toggle('drag-over',overTable(e));
  };
  hand.onpointerup = e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.mode === 'card' && overTable(e)) {
      const card = Number(drag.button.dataset.card), origin = drag.ghost.getBoundingClientRect();
      if (playCard(card,origin)) { releaseDrag(false); return; }
    }
    releaseDrag(true);
  };
  hand.onpointercancel = hand.onlostpointercapture = e => { if (drag?.id === e.pointerId) releaseDrag(true); };
  hand.onclick = e => {
    // Keyboard and assistive activation use the same validation as a drop.
    const button = e.target.closest('button[data-card]');
    if (e.detail === 0 && button) playCard(Number(button.dataset.card),button.getBoundingClientRect());
  };
  $('takeBtn').onclick = () => act({type:'take'});
  $('passBtn').onclick = () => act({type:'pass'});

  function startLocal(count = prefs.count) {
    Net2P.close();
    const state = D.create(count);
    enter({state,seat:0,online:false},D.view(state,0));
  }
  function home() {
    releaseDrag(false);
    clearTimers(); Net2P.close(); game = null;
    for (const id of ['lobby','restartDialog']) if ($(id).open) $(id).close();
    $('game').hidden = true; $('menu').hidden = false;
    if (location.hash && !window.IN_ROOM) history.replaceState(null,'',location.pathname+location.search);
    renderMenu();
  }
  function again() {
    if (!game) return;
    if (game.online) {
      if (Net2P.role() === 'host' && Net2P.online()) hostStart();
    } else startLocal(game.view.count);
  }
  $('playBtn').onclick = () => startLocal();
  $('homeBtn').onclick = $('endMenu').onclick = home;
  $('endAgain').onclick = again;
  $('againBtn').onclick = () => $('restartDialog').showModal();
  $('restartNo').onclick = () => $('restartDialog').close();
  $('restartYes').onclick = () => { $('restartDialog').close(); again(); };

  function lobby(message, opts = {}) {
    $('lbText').textContent = message;
    $('lbCode').hidden = !opts.code; $('lbCode').textContent = opts.code || '';
    $('lbLinkRow').hidden = !opts.link; $('lbLink').value = opts.link || '';
    $('lbRetry').hidden = !opts.error;
    if (!$('lobby').open) $('lobby').showModal();
  }
  function hostStart() {
    const state = D.create(2);
    const id = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    enter({state,seat:0,online:true,id},D.view(state,0));
    sendState();
  }
  function onPeer(connected) {
    if (!game || !game.online) return;
    if (!connected) { game.pending = false; game.cardOrigin = null; }
    render();
  }
  function host() {
    lastJoin = null;
    lobby('Подключаюсь к серверу связи…');
    Net2P.host({
      prefix:PREFIX, onReady:(code,link) => lobby('Отправь другу ссылку или код. Раздача начнётся после подключения.',{code,link}),
      onJoin:() => game && game.online && game.state ? sendState() : hostStart(),
      onPeer,onData:hostData,onFail:message => lobby(message,{error:true})
    });
  }
  function join(code) {
    lastJoin = code;
    lobby('Подключаюсь к игре '+Net2P.cleanCode(code)+'…');
    Net2P.join(code,{prefix:PREFIX,onOpen:() => lobby('Подключено. Ждём раздачу…'),
      onPeer,onData:guestData,onFail:message => lobby(message,{error:true})});
  }
  function hostData(d) {
    if (match.receive(d,1) || !game || !game.online || !game.state || d.t !== 'try') return;
    if (d.id !== game.id || d.version !== game.state.version) { sendState(); return; }
    const next = D.play(game.state,1,d.action);
    if (!update(next)) Net2P.send({t:'nack',id:game.id});
  }
  function guestData(d) {
    if (match.receive(d,null)) return;
    if (d.t === 'state') {
      if (typeof d.id !== 'string' || d.id.length > 40 || !D.validView(d.view,1)) return;
      if (!game || game.id !== d.id) enter({seat:1,online:true,id:d.id},d.view);
      else if (d.view.version >= game.view.version) {
        if ($('lobby').open) $('lobby').close();
        if (d.view.version === game.view.version) { game.pending = false; game.cardOrigin = null; render(); }
        else showView(d.view,true);
      }
    } else if (d.t === 'nack' && game && d.id === game.id) {
      game.pending = false; game.cardOrigin = null; render();
    }
  }
  $('netCreate').onclick = host;
  $('netJoinBtn').onclick = () => { $('joinRow').hidden = !$('joinRow').hidden; if (!$('joinRow').hidden) $('joinCode').focus(); };
  $('joinCode').oninput = e => { e.target.value = Net2P.cleanCode(e.target.value); };
  $('joinCode').onkeydown = e => { if (e.key === 'Enter') $('joinGo').click(); };
  $('joinGo').onclick = () => {
    const code = Net2P.cleanCode($('joinCode').value);
    if (code.length === 5) join(code); else toast('Введи код из пяти символов.');
  };
  $('lbCancel').onclick = home;
  $('lobby').addEventListener('cancel', e => { e.preventDefault(); home(); });
  $('lbRetry').onclick = () => lastJoin ? join(lastJoin) : host();
  $('lbCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('lbLink').value); toast('Ссылка скопирована.'); }
    catch (e) { $('lbLink').focus(); $('lbLink').select(); }
  };

  function finish(result) {
    if (!game || game.view.result) return;
    if (game.state) update(D.settle(game.state,result.type,result.actor));
    else showView({...game.view,phase:'end',actor:-1,result:{reason:result.type,loser:result.type==='draw'?null:result.actor}},false);
  }
  /*MATCH_ACTIONS*/

  if (window.IN_ROOM || Net2P.hashCode()) prefs.mode = 'net';
  renderMenu();
  if (Net2P.hashCode()) join(Net2P.hashCode());
})();
