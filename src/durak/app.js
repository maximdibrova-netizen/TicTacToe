(function () {
  'use strict';

  const D = Durak, $ = id => document.getElementById(id);
  const ID = 'durak', PREFIX = 'durak-v1-';
  const SUIT_NAME = ['трефы','бубны','червы','пики'];
  const SUIT_CARD = ['треф','бубен','червей','пик'];
  const RANK_NAME = ['6','7','8','9','10','Валет','Дама','Король','Туз'];
  const PIPS = [[0,2,6,8,12,14],[0,2,4,6,8,12,14],[0,2,4,6,8,10,12,14],
    [0,2,3,5,7,9,11,12,14],[0,2,3,5,6,8,9,11,12,14]];
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
    const suit = D.suit(card), glyph = D.SUITS[suit], rank = D.rank(card);
    const corner = D.RANKS[rank]+'<small>'+glyph+'</small>';
    const pips = PIPS[rank];
    const art = pips ? '<span class="pips" aria-hidden="true">'+pips.map(slot =>
      '<i style="grid-area:'+ (Math.floor(slot/3)+1) +' / '+ (slot%3+1) +'">'+glyph+'</i>').join('')+'</span>'
      : rank === 8 ? '<span class="ace" aria-hidden="true">'+glyph+'</span>'
      : '<svg class="court" aria-hidden="true" viewBox="0 0 40 54"><use href="#court-'+rank+'"/><text x="29" y="46">'+glyph+'</text></svg>';
    const tag = button ? 'button' : 'div';
    return '<'+tag+' '+(button?'type="button"':'role="img"')+' class="card-face '+cls+(suit===1||suit===2?' red':'')
      +'" data-card="'+card+'" aria-label="'+cardName(card)+'"><span class="corner" aria-hidden="true">'+corner+'</span>'
      +art+'<span class="corner bottom" aria-hidden="true">'+corner+'</span></'+tag+'>';
  }
  function isOut(v, seat) {
    return !v.deckCount && !v.counts[seat] && (v.phase === 'lead' || v.phase === 'end' || seat !== v.defender);
  }
  function canAct() {
    return !!game && !game.paused && !game.pending && !game.view.result && game.view.actor === game.seat
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
      ? '<div class="stock-art'+(v.deckCount>1?' piled':'')+'">'+cardMarkup(v.trumpCard)+(v.deckCount>1?'<i class="card-back" aria-hidden="true"></i>':'')+'</div><span>'+cardsLabel(v.deckCount)+'</span>'
      : '<span class="empty-pile" aria-hidden="true">'+D.SUITS[v.trump]+'</span><span>Пусто</span>';
    $('stock').setAttribute('aria-label','Козырь — '+SUIT_NAME[v.trump]+'. В колоде '+cardsLabel(v.deckCount));
    $('stock').insertAdjacentHTML('afterbegin','<span class="pile-label">Козырь <b class="'+(v.trump===1||v.trump===2?'red-suit':'')+'">'+D.SUITS[v.trump]+'</b></span>');
    $('discard').setAttribute('aria-label','Отбой · '+cardsLabel(v.discardCount));
    $('discard').innerHTML = '<span class="pile-label">Отбой</span>'+(v.discardCount ? '<i class="card-back" aria-hidden="true"></i>' : '<i class="empty-pile" aria-hidden="true"></i>')
      +'<span>'+v.discardCount+'</span>';

    const past = (game.paused || (v.result && !v.table.length)) && v.resolved;
    const table = past ? past.table : v.table;
    $('pairs').innerHTML = table.length ? table.map(pair => '<div class="pair">'+cardMarkup(pair.attack,'attack')
      +(pair.cover===null?'':cardMarkup(pair.cover,'cover'))+'</div>').join('') : '<div class="table-mark" aria-hidden="true">♠</div>';
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
  }
  function seatOrigin(seat) {
    return (seat === game.seat ? $('hand') : $('players').querySelector('[data-seat="'+seat+'"] .rival-stack'))?.getBoundingClientRect();
  }
  function animateCard(card, origin, duration) {
    if (!origin || !card || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = card.getBoundingClientRect();
    const dx = origin.left + (origin.width - target.width)/2 - target.left;
    const dy = origin.top + (origin.height - target.height)/2 - target.top;
    card.animate([{translate:dx+'px '+dy+'px',scale:.88},{translate:'0 0',scale:1}],
      {duration,easing:'cubic-bezier(.22,.78,.3,1)'});
  }
  function collectTable({taking,defender}) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = taking ? seatOrigin(defender) : $('discard').getBoundingClientRect();
    if (!target) return;
    const cards = $('pairs').querySelectorAll('.card-face');
    cards.forEach((card,index) => {
      const r = card.getBoundingClientRect();
      const x = target.left + (target.width-r.width)/2 - r.left;
      const y = target.top + (target.height-r.height)/2 - r.top;
      card.animate([{translate:'0 0',scale:1,opacity:1},{translate:x+'px '+y+'px',scale:.38,opacity:0}],
        {delay:370 + index*5,duration:230,fill:'forwards',easing:'cubic-bezier(.48,0,.76,.5)'});
    });
  }
  function showView(next, animate) {
    clearTimers();
    const previous = game.view;
    const last = next.last;
    const played = animate && previous.version < next.version && last?.type === 'card' && D.isCard(last.card)
      && Number.isInteger(last.seat) && (last.card !== previous.last?.card || last.seat !== previous.last.seat);
    const origin = played && (game.cardOrigin || seatOrigin(last.seat));
    game.paused = !!(animate && !next.result && next.resolved && next.resolved.round !== previous.resolved?.round);
    game.cardOrigin = null;
    game.view = next;
    game.pending = false;
    render();
    if (game.paused) {
      collectTable(next.resolved);
      const current = game;
      pauseTimer = setTimeout(() => {
        if (game !== current) return;
        game.paused = false; render(); scheduleBot();
      },660);
    } else scheduleBot();
    if (played) animateCard($('pairs').querySelector('[data-card="'+last.card+'"]'),origin,last.seat===game.seat?210:340);
  }
  function enter(options, initial) {
    clearTimers();
    game = {...options,view:initial,pending:false,paused:false};
    if ($('lobby').open) $('lobby').close();
    if ($('restartDialog').open) $('restartDialog').close();
    $('menu').hidden = true; $('game').hidden = false;
    $('game').scrollTop = 0;
    render(); scheduleBot();
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
    if (!game || game.online || game.paused || game.view.result || game.state.actor === game.seat) return;
    const current = game, state = game.state;
    botTimer = setTimeout(() => {
      if (game !== current || game.state !== state || game.paused) return;
      const seat = state.actor;
      update(D.play(state,seat,D.bot(D.view(state,seat))));
    },isOut(game.view,game.seat)?260:460);
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
    if (!returnToHand || matchMedia('(prefers-reduced-motion: reduce)').matches) { ghost.remove(); return; }
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
    const next = !game.paused && D.play(game.state,1,d.action);
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
