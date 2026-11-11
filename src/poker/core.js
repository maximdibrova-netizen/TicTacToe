var Holdem = (function () {
  'use strict';

  const SEATS = 6;
  const defaults = Object.freeze({smallBlind: 5, bigBlind: 10, ante: 0, stack: 1000, seconds: 25, reserve: 30});
  const names = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];
  const integers = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

  function settings(input) {
    const {smallBlind, bigBlind, ante, stack, seconds, reserve} = input;
    if (!integers(smallBlind, 1, 999999) || !integers(bigBlind, smallBlind + 1, 1000000)) {
      throw Error('Большой блайнд должен быть больше малого, оба — целые положительные числа.');
    }
    if (!integers(ante, 0, 1000000) || !integers(stack, bigBlind + ante, 100000000)) {
      throw Error('Стартовый стек должен покрывать большой блайнд и анте.');
    }
    if (!integers(seconds, 0, 300) || !integers(reserve, 0, 600)) {
      throw Error('Время на ход — от 0 до 300 секунд, резерв — от 0 до 600.');
    }
    return {smallBlind, bigBlind, ante, stack, seconds, reserve};
  }

  function shuffle() {
    const deck = Array.from({length: 52}, (_, i) => i);
    const random = new Uint32Array(1);
    for (let i = deck.length - 1; i > 0; i--) {
      const bound = i + 1;
      const limit = 2 ** 32 - (2 ** 32 % bound);
      do { crypto.getRandomValues(random); } while (random[0] >= limit);
      const j = random[0] % bound;
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function compare(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const difference = (a[i] ?? 0) - (b[i] ?? 0);
      if (difference) return difference;
    }
    return 0;
  }

  function five(cards) {
    const ranks = cards.map(card => card % 13 + 2).sort((a, b) => b - a);
    const flush = cards.every(card => Math.floor(card / 13) === Math.floor(cards[0] / 13));
    const counts = new Map();
    for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
    const groups = Array.from(counts).sort(([a, ac], [b, bc]) => bc - ac || b - a);
    const straight = groups.length !== 5 ? 0 : ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join() === '14,5,4,3,2' ? 5 : 0;
    const [[top, count], [second, secondCount]] = groups;
    if (flush && straight) return [8, straight];
    if (count === 4) return [7, top, second];
    if (count === 3 && secondCount === 2) return [6, top, second];
    if (flush) return [5, ...ranks];
    if (straight) return [4, straight];
    if (count === 3) return [3, top, ...groups.slice(1).map(g => g[0])];
    if (count === 2 && secondCount === 2) return [2, top, second, groups[2][0]];
    if (count === 2) return [1, top, ...groups.slice(1).map(g => g[0])];
    return [0, ...ranks];
  }

  function evaluate(cards) {
    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7 ||
        new Set(cards).size !== cards.length || !cards.every(card => integers(card, 0, 51))) {
      throw Error('Для комбинации нужны 5–7 разных карт.');
    }
    // For seven cards there are only 21 candidate hands.
    let best = [];
    function visit(start, selected) {
      if (selected.length === 5) {
        const value = five(selected);
        if (compare(value, best) > 0) best = value;
        return;
      }
      for (let i = start; i <= cards.length - (5 - selected.length); i++) {
        selected.push(cards[i]);
        visit(i + 1, selected);
        selected.pop();
      }
    }
    visit(0, []);
    return best;
  }

  function next(players, after, predicate) {
    for (let step = 1; step <= SEATS; step++) {
      const seat = (after + step) % SEATS;
      if (players[seat] && predicate(players[seat])) return seat;
    }
    return -1;
  }

  function put(player, amount, blindOrBet) {
    const paid = Math.min(player.stack, amount);
    player.stack -= paid;
    player.total += paid;
    if (blindOrBet) player.bet += paid;
    return paid;
  }

  function newHand(seats, configuration, previousButton = -1, now = Date.now(), deck = shuffle()) {
    const config = settings(configuration);
    if (!Array.isArray(seats) || seats.length > SEATS) throw Error('За столом максимум 6 игроков.');
    if (deck.length !== 52 || new Set(deck).size !== 52 || !deck.every(card => integers(card, 0, 51))) throw Error('Некорректная колода.');
    const players = Array.from({length: SEATS}, (_, i) => {
      const seat = seats[i];
      if (!seat || !integers(seat.stack, 1, Number.MAX_SAFE_INTEGER)) return null;
      return {seat: i, name: seat.name, stack: seat.stack, cards: [], folded: false, bet: 0, total: 0, actedAt: null, reserve: config.reserve * 1000};
    });
    const count = players.filter(Boolean).length;
    if (count < 2) throw Error('Для раздачи нужны хотя бы два игрока с фишками.');
    if (!Number.isSafeInteger(players.reduce((total, player) => total + (player?.stack || 0), 0))) throw Error('Слишком много фишек за столом.');
    const button = next(players, previousButton, Boolean);
    const small = count === 2 ? button : next(players, button, Boolean);
    const big = next(players, small, Boolean);
    const hand = {config, players, deck: deck.slice(), cursor: 0, board: [], button, small, big,
      street: 0, currentBet: config.bigBlind, minimumRaise: config.bigBlind, turn: -1, revision: 0,
      baseUntil: null, deadline: null, result: null, last: null};
    for (const player of players) if (player) put(player, config.ante, false);
    put(players[small], config.smallBlind, true);
    put(players[big], config.bigBlind, true);
    for (let round = 0; round < 2; round++) {
      let seat = button;
      for (let dealt = 0; dealt < count; dealt++) {
        seat = next(players, seat, Boolean);
        players[seat].cards.push(hand.deck[hand.cursor++]);
      }
    }
    advance(hand, big, now);
    return hand;
  }

  const live = player => player && !player.folded;
  const funded = player => live(player) && player.stack > 0;

  function target(hand, player) {
    if (hand.players.some(other => other !== player && funded(other))) return hand.currentBet;
    return Math.max(0, ...hand.players.filter(other => other !== player && live(other)).map(other => other.bet));
  }

  function options(hand, seat) {
    const player = hand.players[seat];
    if (hand.result || hand.turn !== seat || !funded(player)) return null;
    const owed = Math.max(0, target(hand, player) - player.bet);
    const call = Math.min(owed, player.stack);
    const maximum = player.bet + player.stack;
    const full = hand.currentBet + hand.minimumRaise;
    const raise = hand.players.some(other => other !== player && funded(other)) && maximum > hand.currentBet &&
      (player.actedAt === null || hand.currentBet - player.actedAt >= hand.minimumRaise);
    return {call, check: owed === 0, raise, minimum: Math.min(full, maximum), maximum,
      allIn: raise || call === player.stack, bet: hand.currentBet === 0};
  }

  function finish(hand, contenders) {
    const showdown = contenders.length > 1;
    const scores = new Map(showdown ? contenders.map(p => [p.seat, evaluate([...p.cards, ...hand.board])]) : []);
    const ordered = contenders.slice().sort((a, b) => (a.seat - hand.button + 5) % SEATS - (b.seat - hand.button + 5) % SEATS);
    const paid = hand.players.filter(p => p && p.total > 0);
    const levels = [...new Set(paid.map(p => p.total))].sort((a, b) => a - b);
    const layers = [], refunds = [], winnings = Array(SEATS).fill(0);
    let lower = 0;
    for (const level of levels) {
      const contributors = paid.filter(p => p.total >= level);
      const amount = (level - lower) * contributors.length;
      lower = level;
      if (contributors.length === 1) {
        const player = contributors[0];
        player.stack += amount;
        refunds.push({seat: player.seat, amount});
        continue;
      }
      const eligible = ordered.filter(p => p.total >= level);
      const possible = eligible.length ? eligible : ordered;
      const previous = layers.at(-1);
      // Folded contributions can change the level without changing who can win.
      // Split odd chips only once for each distinct pot.
      if (previous && possible.length === previous.eligible.length && possible.every((p, i) => p === previous.eligible[i])) {
        previous.amount += amount;
      } else {
        layers.push({amount, eligible: possible});
      }
    }
    const pots = layers.map(({amount, eligible}) => {
      const best = showdown ? eligible.map(p => scores.get(p.seat)).reduce((a, b) => compare(a, b) >= 0 ? a : b) : [];
      const winners = eligible.filter(p => !showdown || compare(scores.get(p.seat), best) === 0);
      winners.forEach((p, i) => {
        const share = Math.floor(amount / winners.length) + (i < amount % winners.length ? 1 : 0);
        p.stack += share;
        winnings[p.seat] += share;
      });
      return {amount, winners: winners.map(p => p.seat)};
    });
    hand.result = {pots, refunds, winnings, showdown, ranks: Object.fromEntries([...scores].map(([seat, score]) => [seat, names[score[0]]]))};
    hand.street = 4;
    hand.turn = -1;
    hand.deadline = hand.baseUntil = null;
  }

  function advance(hand, from, now) {
    const contenders = hand.players.filter(live);
    if (contenders.length === 1) { finish(hand, contenders); return; }
    const actors = contenders.filter(funded).length;
    for (;;) {
      const turn = next(hand.players, from, p => funded(p) &&
        (p.bet < target(hand, p) || (actors > 1 && p.actedAt === null)));
      if (turn >= 0) {
        hand.turn = turn;
        hand.baseUntil = hand.config.seconds ? now + hand.config.seconds * 1000 : null;
        hand.deadline = hand.baseUntil === null ? null : hand.baseUntil + hand.players[turn].reserve;
        return;
      }
      if (hand.street === 3) { finish(hand, contenders); return; }
      hand.street++;
      hand.cursor++; // burn
      const count = hand.street === 1 ? 3 : 1;
      hand.board.push(...hand.deck.slice(hand.cursor, hand.cursor + count));
      hand.cursor += count;
      for (const p of hand.players) if (p) { p.bet = 0; p.actedAt = null; }
      hand.currentBet = 0;
      hand.minimumRaise = hand.config.bigBlind;
      from = hand.button;
    }
  }

  function apply(hand, seat, action, now, automatic) {
    const allowed = options(hand, seat);
    if (!allowed || !action || (!automatic && hand.deadline !== null && now >= hand.deadline)) return false;
    const player = hand.players[seat];
    let paid = 0;
    switch (action.type) {
      case 'fold': player.folded = true; break;
      case 'check': if (!allowed.check) return false; break;
      case 'call':
        if (!allowed.call) return false;
        paid = put(player, allowed.call, true);
        break;
      case 'raise': {
        if (!allowed.raise || !integers(action.to, allowed.minimum, allowed.maximum)) return false;
        paid = put(player, action.to - player.bet, true);
        const increase = player.bet - hand.currentBet;
        if (increase >= hand.minimumRaise) hand.minimumRaise = increase;
        hand.currentBet = player.bet;
        break;
      }
      default: return false;
    }
    if (hand.baseUntil !== null) player.reserve = Math.max(0, player.reserve - Math.max(0, now - hand.baseUntil));
    player.actedAt = hand.currentBet;
    hand.last = {seat, type: action.type, paid, to: player.bet, automatic: !!automatic, allIn: player.stack === 0};
    hand.revision++;
    advance(hand, seat, now);
    return true;
  }

  function act(hand, seat, action, now = Date.now()) { return apply(hand, seat, action, now, false); }
  function tick(hand, now = Date.now(), disconnected = false) {
    if (hand.result || (!disconnected && (hand.deadline === null || now < hand.deadline))) return false;
    const action = options(hand, hand.turn);
    return apply(hand, hand.turn, {type: action.check ? 'check' : 'fold'}, now, true);
  }

  function view(hand, seat, now = Date.now()) {
    return {
      board: hand.board.slice(), button: hand.button, small: hand.small, big: hand.big, street: hand.street,
      turn: hand.turn, revision: hand.revision, result: hand.result, last: hand.last,
      pot: hand.result ? hand.result.pots.reduce((total, pot) => total + pot.amount, 0) : hand.players.reduce((total, p) => total + (p?.total || 0), 0),
      clock: hand.deadline === null ? null : {base: Math.max(0, hand.baseUntil - now), left: Math.max(0, hand.deadline - now)},
      options: options(hand, seat),
      players: hand.players.map(p => p && ({seat: p.seat, name: p.name, stack: p.stack, bet: hand.result ? 0 : p.bet,
        folded: p.folded, reserve: p.reserve,
        cards: p.seat === seat || (hand.result?.showdown && !p.folded) ? p.cards.slice() : []}))
    };
  }

  return {SEATS, defaults, settings, compare, evaluate, newHand, options, act, tick, view};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Holdem;
