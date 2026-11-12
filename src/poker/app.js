(function () {
  'use strict';
  const $ = id => document.getElementById('poker' + id);
  const settingsFields = {smallBlind: 'Small', bigBlind: 'Big', ante: 'Ante', stack: 'Stack', seconds: 'Seconds', reserve: 'Reserve'};
  const streets = ['Префлоп', 'Флоп', 'Тёрн', 'Ривер'];
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let room;
  try { if (parent !== window) room = parent.ROOM?.frameContext(window); } catch (_) {}
  let clockAt = 0, clock = null, raiseTurn = '';
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
    element.append(tag('span', rank), tag('span', suits[suit]));
    return element;
  }

  function drawSeat(view, index) {
    const seat = view?.seats[index];
    const hand = view?.hand;
    const player = hand?.players[index];
    const mine = view?.me === index;
    const tile = tag('div', undefined, 'poker-seat');
    tile.dataset.seat = index;
    if (!seat) {
      tile.classList.add('is-empty');
      tile.append(tag('span', 'Свободно'));
      return tile;
    }
    if (mine) tile.classList.add('is-mine');
    if (hand?.turn === index) tile.classList.add('is-turn');
    if (player?.folded) tile.classList.add('is-folded');
    const name = tag('div', seat.name, 'poker-seat-name');
    name.dataset.seatName = '';
    name.title = seat.name;
    if (mine) name.setAttribute('aria-label', seat.name + ', вы');
    const chips = !hand?.result && player ? player.stack : seat.stack;
    const meta = tag('div', chips + ' фишек', 'poker-seat-meta');
    if (player?.bet) meta.append(' · ', tag('b', String(player.bet)));
    const cards = tag('div', undefined, 'poker-cards');
    if (player?.cards.length) cards.append(...player.cards.map(value => card(value)));
    else if (player && !player.folded && !hand.result) cards.append(card(null, 'back'), card(null, 'back'));
    const badges = tag('div', undefined, 'poker-seat-badges');
    if (hand?.button === index && player) {
      const button = tag('span', 'D', 'dealer');
      button.title = 'Дилер';
      button.setAttribute('aria-label', 'Дилер');
      badges.append(button);
    }
    if (hand?.small === index && player) badges.append(tag('span', 'SB'));
    if (hand?.big === index && player) badges.append(tag('span', 'BB'));
    if (!seat.online) badges.append(tag('span', 'Нет связи'));
    else if (player?.folded) badges.append(tag('span', 'Фолд'));
    else if (player && !hand.result && !player.stack) badges.append(tag('span', 'Олл-ин'));
    else if (hand && !hand.result && !player) badges.append(tag('span', 'Ожидает'));
    tile.append(name, meta, cards, badges);
    return tile;
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
    $('Clock').hidden = !clock;
    if (!clock) return;
    const elapsed = performance.now() - clockAt;
    const reserve = elapsed >= clock.base && clock.left > clock.base;
    const left = Math.max(0, Math.ceil(((reserve ? clock.left : clock.base) - elapsed) / 1000));
    const text = (reserve ? 'Резерв ' : '') + left + ' с';
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
    $('Seats').replaceChildren(...ordered.map(index => drawSeat(view, index)));
    $('Board').replaceChildren(...Array.from({length: 5}, (_, i) =>
      i < (hand?.board.length || 0) ? card(hand.board[i]) : card(null, 'empty')));
    $('Count').textContent = (view?.seats.filter(Boolean).length || 0) + ' / 6 мест';
    $('Street').textContent = hand ? hand.result ? hand.result.showdown ? 'Вскрытие' : 'Раздача завершена' : streets[hand.street] : 'Ожидание игроков';
    $('Pot').textContent = 'Банк ' + (hand?.pot || 0);
    $('Turn').textContent = active ? hand.turn === me ? 'Ваш ход' : 'Ходит ' + hand.players[hand.turn].name :
      hand?.result ? 'Раздача ' + view.number + ' завершена' : view ? online.length < 2 ? 'Ждём второго игрока' : 'Готово к раздаче' :
      room?.role === 'guest' ? 'Ждём, пока друг откроет стол' : 'Создайте стол или введите код друга';
    clock = hand?.clock || null;
    clockAt = performance.now();
    updateClock();
    drawActions(view);
    drawResult(hand, view);
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
    $('Deal').disabled = online.filter(seat => seat.stack > 0).length < 2;
    $('Deal').textContent = hand ? 'Следующая раздача' : 'Начать раздачу';
    $('Rebuy').hidden = !view || !!active || view.seats[me].stack > 0;
    $('Code').textContent = view?.code || '';
    const config = view?.config;
    $('Summary').textContent = config ? 'Блайнды ' + config.smallBlind + ' / ' + config.bigBlind + ' · Анте ' + config.ante +
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
