(function () {
  'use strict';

  const D = Durak, $ = id => document.getElementById(id);
  const ID = 'durak', PREFIX = 'durak-v1-';
  const SUIT_NAME = ['трефы','бубны','червы','пики'];
  const SUIT_CARD = ['треф','бубен','червей','пик'];
  const RANK_NAME = ['6','7','8','9','10','Валет','Дама','Король','Туз'];
  const prefs = {mode:'bot',count:2};
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(ID+'-settings') || '{}')); } catch (e) {}
  if (prefs.mode !== 'net') prefs.mode = 'bot';
  if (![2,3,4].includes(prefs.count)) prefs.count = 2;

  let game = null, botTimer = 0, pauseTimer = 0, toastTimer = 0, lastJoin = null;
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
  function cardMarkup(card, trump, opts = {}) {
    const s = D.suit(card), glyph = D.SUITS[s], rank = D.RANKS[D.rank(card)];
    const face = 'card-face'+(s === 1 || s === 2 ? ' red' : '')+(s === trump ? ' trump' : '')+(opts.cls ? ' '+opts.cls : '');
    const label = cardName(card)+(s === trump ? ' · козырь' : '');
    const content = '<span class="corner" aria-hidden="true">'+rank+'<small>'+glyph+'</small></span>'
      +'<span class="pip" aria-hidden="true">'+glyph+'</span>'
      +'<span class="corner bottom" aria-hidden="true">'+rank+'<small>'+glyph+'</small></span>';
    if (opts.button) return '<button type="button" class="'+face+(opts.legal?' legal':'')+'" data-card="'+card+'" aria-label="'+label+'"'+(opts.legal?'':' disabled')+'>'+content+'</button>';
    return '<div class="'+face+'" role="img" aria-label="'+label+'">'+content+'</div>';
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
  function currentStatus(v, actions) {
    if (v.result) return [resultTitle(v), v.result.reason === 'cards' ? 'Раздача закончена.' : ''];
    if (game.online && !Net2P.online()) return ['Связь с другом потеряна',''];
    if (game.paused && v.resolved) {
      return v.resolved.taking ? ['Карты взяты',playerName(v.resolved.defender)+' забирает карты со стола.']
        : ['Бито','Карты уходят в отбой.'];
    }
    if (game.pending) return ['Отправляем ход…',''];
    if (v.actor === game.seat) {
      if (v.phase === 'lead') return ['Твой ход','Выбери карту для атаки.'];
      if (v.phase === 'defend') return ['Тебе отбиваться',actions.cards.length ? 'Побей выделенную карту или возьми.' : 'Побить нечем. Возьми карты.'];
      return ['Можешь подкинуть',v.taking ? 'Соперник берёт. Подкинь карту или пропусти.' : 'Подкинь карту того же достоинства или закончи заход.'];
    }
    if (isOut(v,game.seat)) return ['Ты вышел','Остальные доигрывают раздачу.'];
    const who = playerName(v.actor);
    if (v.phase === 'lead') return [who+' ходит',''];
    if (v.phase === 'defend') return [who+' отбивается',''];
    return [who+' может подкинуть',v.taking ? 'Карты на столе будут взяты.' : ''];
  }
  function render() {
    if (!game) return;
    const v = game.view, act = canAct(), options = act ? D.legal(v) : {cards:[],take:false,pass:false};
    $('modeTitle').textContent = (game.online ? 'Онлайн' : 'С ботами')+' · '+v.count+' игрока';
    $('players').style.setProperty('--opponents',v.count-1);
    $('players').innerHTML = v.counts.map((n,i) => {
      if (i === game.seat) return '';
      const out = isOut(v,i);
      const role = v.result || game.paused ? '' : i === v.defender ? ' · отбивается' : i === v.attacker ? ' · атакует' : '';
      return '<div class="player'+(out?' out':'')+(v.actor===i&&!game.paused?' turn':'')+'"><strong>'+playerName(i)
        +'</strong><small>'+(out?'Вышел':cardsLabel(n)+role)+'</small></div>';
    }).join('');

    const [status,detail] = currentStatus(v,options);
    $('status').textContent = status;
    $('detail').textContent = detail;
    $('stock').innerHTML = v.deckCount
      ? '<div class="stock-art">'+cardMarkup(v.trumpCard,v.trump)+(v.deckCount>1?'<i class="card-back" aria-hidden="true"></i>':'')+'</div><span>'+cardsLabel(v.deckCount)+' · '+D.SUITS[v.trump]+'</span>'
      : '<div class="empty-stock" aria-hidden="true">'+D.SUITS[v.trump]+'</div><span>Колода пуста</span>';
    $('stock').setAttribute('aria-label','Козырь — '+SUIT_NAME[v.trump]+'. В колоде '+cardsLabel(v.deckCount));
    $('discard').innerHTML = (v.discardCount ? '<i class="card-back" aria-hidden="true"></i>' : '<i class="empty-discard" aria-hidden="true">↘</i>')
      +'<span>Отбой · '+v.discardCount+'</span>';

    const past = (game.paused || (v.result && !v.table.length)) && v.resolved;
    const table = past ? past.table : v.table;
    const latest = v.last?.type === 'card' ? v.last.card : -1;
    $('pairs').innerHTML = table.length ? table.map(pair =>
      '<div class="pair'+(pair.cover===null&&!past?' uncovered':'')+'">'
      +cardMarkup(pair.attack,v.trump,{cls:pair.attack===latest?'attack latest':'attack'})
      +(pair.cover===null?'':cardMarkup(pair.cover,v.trump,{cls:pair.cover===latest?'cover latest':'cover'}))+'</div>').join('')
      : '<p class="empty-table">'+(v.result?'Стол пуст':'Карты появятся после первого хода')+'</p>';
    $('tableNote').textContent = past ? (v.result?'Последний заход':past.taking?'Взято':'Бито')
      : v.taking ? 'Отбивающийся берёт карты' : 'Заход '+v.round+' · атака '+v.table.length+' из '+v.limit;
    $('takeBtn').hidden = !options.take;
    $('passBtn').hidden = !options.pass;
    $('passBtn').textContent = v.taking ? 'Не подкидывать' : v.count === 2 ? 'Бито' : 'Не подкидывать';
    $('handInfo').textContent = cardsLabel(v.hand.length)+' · козырь '+D.SUITS[v.trump];
    const order = card => (D.suit(card) === v.trump ? 4 : D.suit(card))*9 + D.rank(card);
    $('hand').innerHTML = v.hand.length ? v.hand.slice().sort((a,b)=>order(a)-order(b)).map(card =>
      cardMarkup(card,v.trump,{button:true,legal:options.cards.includes(card)})).join('') : '<p class="hint">На руках пусто.</p>';

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
  function showView(next, animate) {
    clearTimers();
    const previous = game.view;
    game.view = next;
    game.pending = false;
    game.paused = !!(animate && previous && !next.result && next.resolved && next.resolved.round !== previous.resolved?.round);
    render();
    if (game.paused) {
      const current = game;
      pauseTimer = setTimeout(() => {
        if (game !== current) return;
        game.paused = false; render(); scheduleBot();
      },560);
    } else scheduleBot();
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
    if (!canAct()) return;
    if (game.online && Net2P.role() === 'guest') {
      game.pending = Net2P.send({t:'try',id:game.id,version:game.view.version,action});
      render();
    } else update(D.play(game.state,game.seat,action));
  }
  $('hand').onclick = e => {
    const button = e.target.closest('[data-card]');
    if (button && !button.disabled) act({type:'card',card:Number(button.dataset.card)});
  };
  $('takeBtn').onclick = () => act({type:'take'});
  $('passBtn').onclick = () => act({type:'pass'});

  function startLocal(count = prefs.count) {
    Net2P.close();
    const state = D.create(count);
    enter({state,seat:0,online:false},D.view(state,0));
  }
  function home() {
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
    if (!connected) game.pending = false;
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
        if (d.view.version === game.view.version) { game.pending = false; render(); }
        else showView(d.view,true);
      }
    } else if (d.t === 'nack' && game && d.id === game.id) {
      game.pending = false; render();
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
