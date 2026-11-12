(function () {
  'use strict';
  const $ = id => document.getElementById('poker' + id);
  const settingsFields = {smallBlind: 'Small', bigBlind: 'Big', ante: 'Ante', stack: 'Stack', seconds: 'Seconds', reserve: 'Reserve', blindMinutes: 'BlindMinutes'};
  const streets = ['Префлоп', 'Флоп', 'Тёрн', 'Ривер'];
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let room;
  try { if (parent !== window) room = parent.ROOM?.frameContext(window); } catch (_) {}
  let clockAt = 0, clock = null, blindLeft = null, raiseTurn = '';
  let lastView = null, revealAt = 0, revealTimer;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const table = new PokerTable(render, code => {
    if (room?.role === 'host') parent.ROOM.pokerReady(window, code);
  }, peerOptions());

  function peerOptions() {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const endpoint = new URLSearchParams(room ? parent.location.search : location.search).get('peer');
    const match = local && /^(127\.0\.0\.1|localhost):(\d{1,5})$/.exec(endpoint || '');
    return match ? {host: match[1], port: Number(match[2]), path: '/', secure: false, debug: 1} : {debug: 1};
  }

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function saveStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }
  function setSettings(config) {
    for (const [key, id] of Object.entries(settingsFields)) $(id).value = config[key];
  }
  function getSettings() {
    return Holdem.settings(Object.fromEntries(Object.entries(settingsFields).map(([key, id]) => [key, $(id).valueAsNumber])));
  }
  function note(message) {
    $('Notice').textContent = message;
    $('Notice').hidden = !message;
  }
  function chosenName() {
    const name = PokerTable.name($('Name').value);
    if (name) saveStorage('poker-name', name);
    return name;
  }
  function tag(name, text, css) {
    const element = document.createElement(name);
    if (text !== undefined) element.textContent = text;
    if (css) element.className = css;
    return element;
  }
  function card(value, state) {
    const element = tag('span', undefined, 'poker-card' + (state ? ' ' + state : ''));
    if (state) { element.setAttribute('aria-hidden', 'true'); return element; }
    const rank = ranks[value % 13];
    const suit = Math.floor(value / 13);
    element.dataset.card = String(value);
    if (suit === 1 || suit === 2) element.classList.add('red');
    element.setAttribute('aria-label', rank + ' ' + ['пики', 'червы', 'бубны', 'трефы'][suit]);
    const turn = tag('span', undefined, 'poker-card-turn');
    const face = tag('span', undefined, 'poker-card-face');
    const back = tag('span', undefined, 'poker-card-back');
    back.setAttribute('aria-hidden', 'true');
    face.append(tag('span', rank), tag('span', suits[suit]));
    turn.append(face, back);
    element.append(turn);
    return element;
  }

  function fromPot(element) {
    const pot = $('Pot').getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return 'translate(' + (pot.left + pot.width / 2 - bounds.left - bounds.width / 2) + 'px,' +
      (pot.top + pot.height / 2 - bounds.top - bounds.height / 2) + 'px)';
  }

  function drawCards(container, values, timing) {
    if (timing?.fold && container.children.length && !container.firstChild.classList.contains('poker-folding')) {
      for (const element of container.children) {
        const transform = fromPot(element);
        element.classList.add('poker-folding');
        element.setAttribute('aria-hidden', 'true');
        delete element.dataset.card;
        const animation = element.animate([
          {transform: 'none', opacity: 1},
          {transform: transform + ' scale(.5) rotate(12deg)', opacity: 0}
        ], {duration: 270, easing: 'ease-in', fill: 'forwards'});
        animation.finished.then(() => element.remove(), () => element.remove());
      }
      return 270;
    }
    if (timing?.keepFold && container.firstChild?.classList.contains('poker-folding')) return 0;
    let end = 0;
    values.forEach((value, index) => {
      const existing = container.children[index];
      const hidden = typeof value === 'string';
      if (hidden ? existing?.classList.contains(value) : existing?.dataset.card === String(value)) return;
      const element = card(hidden ? null : value, hidden ? value : null);
      if (existing) existing.replaceWith(element); else container.append(element);
      if (!timing || value === 'empty') return;
      const delay = timing.delay + (timing.offsets ? timing.offsets[index] : index * timing.step);
      const flip = element.querySelector('.poker-card-turn');
      if (timing.slide) {
        element.animate([
          {transform: fromPot(element) + ' scale(.66)', opacity: 0},
          {transform: 'none', opacity: 1}
        ], {duration: 300, delay, easing: 'cubic-bezier(.19,.8,.3,1)', fill: 'backwards'});
      }
      if (flip) flip.animate([
        {transform: 'rotateY(180deg)'}, {transform: 'rotateY(0)'}
      ], {duration: 300, delay: delay + (timing.slide ? 65 : 0), easing: 'ease-in-out', fill: 'backwards'});
      end = Math.max(end, delay + (timing.slide && flip ? 365 : 300));
    });
    while (container.children.length > values.length) container.lastChild.remove();
    return end;
  }

  function drawSeat(view, index, transition) {
    const seat = view?.seats[index];
    const hand = view?.hand;
    const player = hand?.players[index];
    const mine = view?.me === index;
    let tile = $('Seats').querySelector('[data-seat="' + index + '"]');
    if (!tile) {
      tile = tag('div', undefined, 'poker-seat');
      tile.dataset.seat = index;
      const gift = tag('button', '+15 с', 'poker-gift');
      gift.type = 'button';
      gift.onclick = () => table.gift(table.session?.view?.me, index);
      tile.append(tag('div', undefined, 'poker-seat-name'), tag('div', undefined, 'poker-seat-meta'),
        tag('div', undefined, 'poker-cards'), tag('div', undefined, 'poker-seat-badges'), gift);
      $('Seats').append(tile);
    }
    tile.classList.toggle('is-empty', !seat);
    tile.classList.toggle('is-mine', mine);
    tile.classList.toggle('is-turn', hand?.turn === index);
    tile.classList.toggle('is-folded', !!player?.folded);
    const [name, meta, cards, badges, gift] = tile.children;
    name.textContent = seat?.name || 'Свободно';
    name.title = seat?.name || '';
    name.toggleAttribute('data-seat-name', !!seat);
    if (mine && seat) name.setAttribute('aria-label', seat.name + ', вы');
    else name.removeAttribute('aria-label');
    meta.hidden = badges.hidden = !seat;
    gift.hidden = !seat?.online || mine || !hand?.clock || !hand.players[view.me] || !player?.stack || player.folded;
    const title = seat ? 'Добавить 15 секунд: ' + seat.name : '';
    gift.title = title;
    gift.setAttribute('aria-label', title);

    const chips = !hand?.result && player ? player.stack : seat?.stack;
    meta.textContent = seat ? chips + ' фишек' : '';
    if (player?.bet) meta.append(' · ', tag('b', String(player.bet)));
    badges.replaceChildren();
    if (hand?.button === index && player) {
      const button = tag('span', 'D', 'dealer');
      button.title = 'Дилер';
      button.setAttribute('aria-label', 'Дилер');
      badges.append(button);
    }
    if (hand?.small === index && player) badges.append(tag('span', 'SB'));
    if (hand?.big === index && player) badges.append(tag('span', 'BB'));
    if (seat && !seat.online) badges.append(tag('span', 'Нет связи'));
    else if (player?.folded) badges.append(tag('span', player.timedOut ? 'Время вышло' : 'Фолд'));
    else if (player && !hand.result && !player.stack) badges.append(tag('span', 'Олл-ин'));
    else if (seat && hand && !hand.result && !player) badges.append(tag('span', 'Ожидает'));
    const values = player && !player.folded ? player.cards.length ? player.cards : !hand.result ? ['back', 'back'] : [] : [];
    const prior = transition?.prior?.players[index];
    let timing = null;
    if (transition) {
      if (hand.result?.showdown && !mine && !prior?.cards.length && values.length) {
        timing = {slide: false, delay: transition.reveal, step: 75};
      } else if (transition.deal) {
        const order = (index - hand.button + Holdem.SEATS - 1) % Holdem.SEATS;
        timing = {slide: true, delay: order * 48, step: 115};
      } else if (player?.folded) {
        timing = {fold: !!prior && !prior.folded, keepFold: true};
      }
    } else if (player?.folded && !reduceMotion.matches) timing = {keepFold: true};
    return drawCards(cards, values, timing);
  }

  function drawActions(view) {
    const options = view?.hand?.options;
    $('Actions').hidden = !options;
    if (!options) return;
    $('Call').textContent = options.check ? 'Чек' : 'Колл ' + options.call;
    $('AllIn').hidden = !options.allIn;
    $('RaiseForm').hidden = !options.raise;
    if (!options.raise) return;
    const key = view.number + ':' + view.hand.revision;
    $('RaiseTo').min = options.minimum;
    $('RaiseTo').max = options.maximum;
    if (raiseTurn !== key) $('RaiseTo').value = options.minimum;
    raiseTurn = key;
    $('RaiseLabel').textContent = options.bet ? 'Ставка' : 'Рейз до';
    $('Raise').textContent = options.bet ? 'Поставить' : 'Поднять';
  }

  function drawResult(hand, view) {
    const result = hand?.result;
    $('Result').hidden = !result;
    if (!result) return;
    const name = seat => hand.players[seat]?.name || view.seats[seat]?.name || 'Игрок ' + (seat + 1);
    const pots = result.pots.map((pot, i) => {
      const winners = pot.winners.map(seat => name(seat) + (result.ranks[seat] ? ' (' + result.ranks[seat] + ')' : ''));
      return (i ? 'Побочный банк' : 'Банк') + ' ' + pot.amount + ' — ' + winners.join(', ');
    });
    const refunds = result.refunds.map(({seat, amount}) => name(seat) + ' получает обратно ' + amount);
    $('Result').textContent = [...pots, ...refunds].join('. ');
  }

  function updateClock() {
    const elapsed = performance.now() - clockAt;
    $('BlindClock').hidden = blindLeft === null;
    if (blindLeft !== null) {
      const seconds = Math.max(0, Math.ceil((blindLeft - elapsed) / 1000));
      $('BlindClock').textContent = seconds ? 'Рост блайндов через ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') :
        'Новые блайнды со следующей раздачи';
    }
    $('Clock').hidden = !clock;
    if (!clock) return;
    const reserve = elapsed >= clock.base && clock.left > clock.base;
    const left = Math.max(0, Math.ceil(((reserve ? clock.left : clock.base) - elapsed) / 1000));
    const text = left ? (reserve ? 'Резерв ' : '') + left + ' с' : '…';
    if ($('Clock').textContent !== text) $('Clock').textContent = text;
  }

  function render() {
    const session = table.session;
    const view = session?.ready ? session.view : null;
    const hand = view?.hand;
    const active = hand && !hand.result;
    const host = session?.role === 'host';
    const me = view?.me ?? 0;
    const ordered = [2, 3, 4, 1, 0, 5].map(offset => (me + offset) % Holdem.SEATS);
    const online = view?.seats.filter(seat => seat?.online) || [];
    const sameTable = !!view && lastView?.code === view.code && lastView.me === me;
    const newHand = !!hand && sameTable && lastView.number !== view.number;
    const animate = sameTable && !!hand && !reduceMotion.matches;
    const prior = sameTable && !newHand ? lastView.hand : null;
    if (!sameTable) {
      $('Seats').replaceChildren();
      $('Board').replaceChildren();
      revealAt = 0;
    }
    if (newHand) {
      $('Board').replaceChildren();
      for (const cards of $('Seats').querySelectorAll('.poker-cards')) cards.replaceChildren();
    }
    const boardStart = prior?.board.length ?? 0;
    const boardDelay = newHand ? 430 : 0;
    const runout = !!hand?.result?.showdown && hand.board.length > boardStart;
    const offsets = runout ? [0, 75, 150, 480, 820] : [0, 85, 170, 255, 340];
    const boardEnd = drawCards($('Board'), Array.from({length: 5}, (_, i) => hand?.board[i] ?? 'empty'),
      animate && hand.board.length > boardStart ? {slide: true, delay: boardDelay - offsets[boardStart], offsets} : null);
    const transition = animate ? {deal: newHand, prior, reveal: boardEnd ? boardEnd + 60 : 0} : null;
    const seatsEnd = Math.max(...ordered.map(index => drawSeat(view, index, transition)));
    if (animate && hand.result && (!prior?.result || newHand) && Math.max(boardEnd, seatsEnd)) {
      const wait = Math.max(boardEnd, seatsEnd);
      revealAt = performance.now() + wait;
      clearTimeout(revealTimer);
      revealTimer = setTimeout(render, wait + 20);
    }
    const revealing = !reduceMotion.matches && !!hand?.result && performance.now() < revealAt;
    $('Count').textContent = (view?.seats.filter(Boolean).length || 0) + ' / 6 мест';
    $('Street').textContent = hand ? hand.result ? hand.result.showdown ? revealing ? 'Вскрываем карты…' : 'Вскрытие' : 'Раздача завершена' : streets[hand.street] : 'Ожидание игроков';
    $('Pot').textContent = 'Банк ' + (hand?.pot || 0);
    $('Turn').textContent = active ? hand.turn === me ? 'Ваш ход' : 'Ходит ' + hand.players[hand.turn].name :
      revealing ? 'Завершаем раздачу' : hand?.result ? 'Раздача ' + view.number + ' завершена' : view ? online.length < 2 ? 'Ждём второго игрока' : 'Готово к раздаче' :
      room?.role === 'guest' ? 'Ждём, пока друг откроет стол' : 'Создайте стол или введите код друга';
    if (view !== lastView) {
      clock = hand?.clock || null;
      blindLeft = view?.blinds?.left ?? null;
      clockAt = performance.now();
    }
    lastView = view;
    updateClock();
    drawActions(view);
    drawResult(revealing ? null : hand, view);
    $('Entry').hidden = !!session || room?.role === 'guest';
    $('JoinForm').hidden = !!room;
    $('Room').hidden = !view;
    $('Connecting').hidden = (!session && room?.role !== 'guest') || !!view;
    $('ConnectionTitle').textContent = session?.error ? 'Связь со столом' : host ? 'Открываем стол' : 'Подключаемся к столу';
    $('Retry').hidden = !session?.error && !(room?.role === 'guest' && !session && parent.ROOM.context().pokerCode);
    $('Cancel').hidden = !!room;
    $('Settings').hidden = session?.role === 'guest' || room?.role === 'guest';
    for (const field of Object.values(settingsFields)) $(field).disabled = !!active;
    $('DealerRow').hidden = !view || !host || view.number > 0;
    if (!$('DealerRow').hidden) {
      const previous = $('Dealer').value;
      const seats = view.seats.flatMap((seat, index) => seat?.online ? [new Option(seat.name, index)] : []);
      $('Dealer').replaceChildren(...seats);
      if (seats.some(option => option.value === previous)) $('Dealer').value = previous;
    }
    $('Save').hidden = !view || !host || !!active;
    $('Deal').hidden = !view || !host || !!active;
    $('Deal').disabled = revealing || online.filter(seat => seat.stack > 0).length < 2;
    $('Deal').textContent = hand ? 'Следующая раздача' : 'Начать раздачу';
    $('Rebuy').hidden = !view || !!active || view.seats[me].stack > 0;
    $('Code').textContent = view?.code || '';
    const config = view?.config;
    $('Summary').textContent = config ? 'Блайнды ' + (view.blinds?.smallBlind ?? config.smallBlind) + ' / ' + (view.blinds?.bigBlind ?? config.bigBlind) + ' · Анте ' + config.ante +
      (config.seconds ? ' · ' + config.seconds + ' с на ход + ' + config.reserve + ' с резерва' : ' · Без таймера') : '';
    if (session?.error) note(session.error);
  }

  function openTable() {
    const name = chosenName();
    if (!name) { note('Введите имя за столом.'); $('Name').focus(); return; }
    try {
      const config = getSettings();
      saveStorage('poker-settings', JSON.stringify(config));
      note('');
      $('Settings').open = false;
      table.host(name, config);
    } catch (error) { note(error.message); $('Settings').open = true; }
  }
  function joinTable(code, name) {
    if (!code) { note('Введите код из восьми символов.'); $('JoinCode').focus(); return; }
    if (!name) { note('Введите имя за столом.'); $('Name').focus(); return; }
    note('');
    if (!room) history.replaceState(null, '', location.pathname + location.search + '#' + code);
    $('JoinCode').value = code;
    table.join(code, name);
  }
  function leaveTable() {
    if (table.session?.role === 'host' && table.session.ready && !confirm('Закрыть стол для всех игроков?')) return;
    table.leave();
    note('');
    $('Link').hidden = true;
    if (!room) history.replaceState(null, '', location.pathname + location.search);
    else if (room.role === 'host') parent.ROOM.pokerReady(window, '');
    render();
    if (room) parent.ROOM.home();
  }
  function retry() {
    const session = table.session;
    if (session?.role === 'host') openTable();
    else if (session) joinTable(session.code, session.name);
    else if (room?.role === 'guest') window.openInvitedPokerTable(parent.ROOM.context().pokerCode);
  }
  $('Create').onclick = openTable;
  $('JoinForm').onsubmit = event => { event.preventDefault(); joinTable(PokerTable.code($('JoinCode').value), chosenName()); };
  $('Cancel').onclick = $('Leave').onclick = leaveTable;
  $('Retry').onclick = retry;
  $('SettingsForm').onsubmit = event => {
    event.preventDefault();
    try {
      const config = getSettings();
      if (table.configure(config)) { saveStorage('poker-settings', JSON.stringify(config)); note('Настройки сохранены.'); }
    } catch (error) { note(error.message); }
  };
  $('Deal').onclick = () => {
    note('');
    try { table.deal(Number($('Dealer').value)); } catch (error) { note(error.message); }
  };
  $('Rebuy').onclick = () => table.rebuy(0);
  $('Fold').onclick = () => table.act({type: 'fold'});
  $('Call').onclick = () => table.act({type: table.session.view.hand.options.check ? 'check' : 'call'});
  $('AllIn').onclick = () => {
    const options = table.session.view.hand.options;
    table.act(options.raise ? {type: 'raise', to: options.maximum} : {type: 'call'});
  };
  $('RaiseForm').onsubmit = event => { event.preventDefault(); table.act({type: 'raise', to: $('RaiseTo').valueAsNumber}); };
  $('Copy').onclick = async () => {
    const code = table.session?.view?.code;
    if (!code) return;
    const link = new URL(location.pathname + '#' + code, location.origin).href;
    try { await navigator.clipboard.writeText(link); note('Ссылка скопирована.'); }
    catch (_) {
      $('Link').hidden = false;
      $('Link').value = link;
      $('Link').focus();
      $('Link').select();
    }
  };

  setInterval(updateClock, 100);
  try { setSettings(Holdem.settings(JSON.parse(readStorage('poker-settings')))); }
  catch (_) { setSettings(Holdem.defaults); }
  const invite = PokerTable.code(location.hash.slice(1));
  const savedName = PokerTable.name(readStorage('poker-name'));
  const profileName = room && PokerTable.name(parent.GameAccount?.currentUser()?.displayName);
  $('Name').value = profileName || savedName || '';
  $('JoinCode').value = invite;
  if (invite) $('Settings').open = false;
  if (room) {
    document.documentElement.classList.add('in-poker-room');
    $('Leave').hidden = true;
    window.closeRoomPokerTable = () => table.leave();
    $('Name').value ||= room.role === 'host' ? 'Хозяин' : 'Друг';
    window.openInvitedPokerTable = code => {
      if (room.role !== 'guest') return;
      if (!code) { table.leave(); render(); return; }
      if (PokerTable.code(code) && table.session?.code !== code) joinTable(code, chosenName());
    };
    if (room.role === 'host') openTable();
    else if (room.pokerCode) window.openInvitedPokerTable(room.pokerCode);
  } else if (invite && savedName) {
    // Only returning seats connect immediately. A new player confirms their name first.
    let returning;
    try { returning = sessionStorage.getItem('poker-seat-' + invite); } catch (_) {}
    if (returning) joinTable(invite, savedName);
  }
  render();
})();
