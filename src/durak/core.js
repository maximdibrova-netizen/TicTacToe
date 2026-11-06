var Durak = (function () {
  'use strict';

  const SIZE = 36, HAND = 6;
  const CARDS = Array.from({length: SIZE}, (_, i) => i);
  const RANKS = ['6','7','8','9','10','J','Q','K','A'];
  const SUITS = ['♣','♦','♥','♠'];
  const rank = card => card % 9;
  const suit = card => Math.floor(card / 9);
  const isCard = card => Number.isInteger(card) && card >= 0 && card < SIZE;

  function shuffle() {
    const deck = CARDS.slice();
    const word = new Uint32Array(1);
    const crypto = typeof globalThis !== 'undefined' && globalThis.crypto;
    for (let i = deck.length - 1; i > 0; i--) {
      let j;
      if (crypto && crypto.getRandomValues) {
        const limit = 0x100000000 - 0x100000000 % (i + 1);
        do { crypto.getRandomValues(word); } while (word[0] >= limit);
        j = word[0] % (i + 1);
      } else j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function beats(card, attack, trump) {
    return suit(card) === suit(attack) ? rank(card) > rank(attack) : suit(card) === trump;
  }
  function orderFrom(count, seat) {
    return Array.from({length: count}, (_, i) => (seat + i) % count);
  }
  function nextWithCards(state, seat) {
    return orderFrom(state.count, (seat + 1) % state.count).find(i => state.hands[i].length);
  }
  function begin(state, attacker) {
    state.attacker = attacker;
    state.defender = nextWithCards(state, attacker);
    state.limit = Math.min(HAND, state.hands[state.defender].length);
    state.actor = attacker;
    state.phase = 'lead';
    state.table = [];
    state.taking = false;
    state.passed = [];
  }
  function create(count = 2, cards = shuffle()) {
    if (!Number.isInteger(count) || count < 2 || count > 4) throw new RangeError('Нужно от 2 до 4 игроков.');
    if (!Array.isArray(cards) || cards.length !== SIZE || new Set(cards).size !== SIZE || !cards.every(isCard)) throw new Error('Некорректная колода.');
    const deck = cards.slice(), hands = Array.from({length: count}, () => []);
    for (let card = 0; card < HAND; card++) for (const hand of hands) hand.push(deck.pop());
    const trumpCard = deck[0], trump = suit(trumpCard);
    let attacker = 0, lowest = SIZE;
    hands.forEach((hand, i) => hand.forEach(card => {
      if (suit(card) === trump && rank(card) < lowest) { attacker = i; lowest = rank(card); }
    }));
    const state = {count, deck, hands, trump, trumpCard, discard: [], round: 1, version: 0, result: null, resolved: null, last: null};
    begin(state, attacker);
    return state;
  }

  function copy(state) {
    return {...state, deck: state.deck.slice(), hands: state.hands.map(hand => hand.slice()),
      discard: state.discard.slice(), table: state.table.map(pair => ({...pair})), passed: state.passed.slice()};
  }
  function matching(hand, table) {
    const ranks = new Set(table.flatMap(pair => pair.cover === null ? [rank(pair.attack)] : [rank(pair.attack), rank(pair.cover)]));
    return hand.filter(card => ranks.has(rank(card)));
  }
  function legal(view) {
    const noMove = {cards: [], take: false, pass: false};
    if (view.result || view.actor !== view.seat) return noMove;
    if (view.phase === 'lead') return {...noMove, cards: view.hand.slice()};
    if (view.phase === 'throw') return {...noMove, pass: true, cards: matching(view.hand, view.table)};
    const pair = view.table.find(p => p.cover === null);
    return pair ? {...noMove, take: true, cards: view.hand.filter(card => beats(card, pair.attack, view.trump))} : noMove;
  }

  function resolve(state) {
    const {attacker, defender, table, taking} = state;
    const played = table.flatMap(pair => pair.cover === null ? [pair.attack] : [pair.attack, pair.cover]);
    const draws = [];
    state.resolved = {round: state.round, defender, taking, table: table.map(pair => ({...pair})), draws};
    if (taking) state.hands[defender].push(...played);
    else state.discard.push(...played);
    const drawOrder = orderFrom(state.count, attacker).filter(i => i !== defender).concat(defender);
    for (const seat of drawOrder) {
      while (state.deck.length && state.hands[seat].length < HAND) {
        state.hands[seat].push(state.deck.pop());
        draws.push(seat);
      }
    }
    const remaining = state.hands.map((hand, seat) => hand.length ? seat : -1).filter(seat => seat >= 0);
    state.table = [];
    if (!state.deck.length && remaining.length <= 1) {
      state.actor = -1;
      state.phase = 'end';
      state.result = {loser: remaining[0] ?? null, reason: remaining.length ? 'cards' : 'draw'};
      return;
    }
    const next = taking || !state.hands[defender].length ? nextWithCards(state, defender) : defender;
    state.round++;
    begin(state, next);
  }

  function offerThrow(state) {
    if (state.table.length >= state.limit) { resolve(state); return; }
    const seat = orderFrom(state.count, state.attacker).find(i => i !== state.defender
      && !state.passed.includes(i) && matching(state.hands[i], state.table).length);
    if (seat === undefined) { resolve(state); return; }
    state.phase = 'throw';
    state.actor = seat;
  }

  function play(state, seat, action) {
    if (!action || typeof action !== 'object' || state.result || state.actor !== seat) return null;
    const options = legal(view(state, seat));
    const card = action.card;
    if (action.type === 'card' ? !options.cards.includes(card)
      : action.type === 'take' ? !options.take
      : action.type === 'pass' ? !options.pass : true) return null;

    const next = copy(state);
    next.version++;
    next.last = action.type === 'card' ? {type: 'card', seat, card} : {type: action.type, seat};
    if (action.type === 'take') {
      next.taking = true;
      next.passed = [];
      offerThrow(next);
    } else if (action.type === 'pass') {
      next.passed.push(seat);
      offerThrow(next);
    } else {
      const hand = next.hands[seat];
      hand.splice(hand.indexOf(card), 1);
      if (state.phase === 'defend') {
        next.table.find(pair => pair.cover === null).cover = card;
        next.passed = [];
        offerThrow(next);
      } else {
        next.table.push({attack: card, cover: null, by: seat});
        if (next.taking) offerThrow(next);
        else { next.phase = 'defend'; next.actor = next.defender; }
      }
    }
    return next;
  }

  function settle(state, reason, loser) {
    if (state.result) return null;
    if (reason === 'draw') loser = null;
    else if (reason !== 'resign' || !Number.isInteger(loser) || loser < 0 || loser >= state.count) return null;
    return {...state, phase: 'end', actor: -1, version: state.version + 1, result: {reason, loser}};
  }

  // A peer receives their own hand and public information only.
  function view(state, seat) {
    return {
      seat, count: state.count, hand: state.hands[seat].slice(), counts: state.hands.map(hand => hand.length),
      deckCount: state.deck.length, discardCount: state.discard.length,
      trump: state.trump, trumpCard: state.deck.length ? state.trumpCard : null,
      attacker: state.attacker, defender: state.defender, limit: state.limit, actor: state.actor,
      table: state.table.map(pair => ({...pair})), phase: state.phase, taking: state.taking,
      round: state.round, version: state.version, last: state.last && {...state.last},
      resolved: state.resolved && {...state.resolved, table: state.resolved.table.map(pair => ({...pair})), draws:state.resolved.draws?.slice()},
      result: state.result && {...state.result}
    };
  }

  function validView(v, seat) {
    if (!v || v.count !== 2 || v.seat !== seat) return false;
    const number = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    const player = n => number(n, 0, 1);
    const pair = p => p && isCard(p.attack) && (p.cover === null || isCard(p.cover)) && player(p.by);
    const table = t => Array.isArray(t) && t.length <= HAND && t.every(pair);
    return Array.isArray(v.hand) && v.hand.length <= SIZE && v.hand.every(isCard) && new Set(v.hand).size === v.hand.length
      && Array.isArray(v.counts) && v.counts.length === 2 && v.counts.every(n => number(n, 0, SIZE)) && v.counts[seat] === v.hand.length
      && number(v.deckCount,0,SIZE) && number(v.discardCount,0,SIZE) && number(v.trump,0,3)
      && (v.deckCount ? isCard(v.trumpCard) && suit(v.trumpCard) === v.trump : v.trumpCard === null)
      && player(v.attacker) && player(v.defender) && v.attacker !== v.defender && number(v.limit,1,HAND)
      && ['lead','defend','throw','end'].includes(v.phase) && typeof v.taking === 'boolean'
      && (v.phase === 'end' ? v.actor === -1 && !!v.result : player(v.actor) && v.result === null)
      && table(v.table) && number(v.round,1,10000) && number(v.version,0,100000)
      && (v.resolved === null || (v.resolved && player(v.resolved.defender) && table(v.resolved.table)
        && (v.resolved.draws === undefined || (Array.isArray(v.resolved.draws) && v.resolved.draws.length <= SIZE && v.resolved.draws.every(player)))))
      && (v.result === null || (['cards','draw','resign'].includes(v.result.reason) && (v.result.loser === null || player(v.result.loser))));
  }

  function bot(v) {
    const options = legal(v);
    const value = card => rank(card) + (suit(card) === v.trump ? 11 : 0);
    const cards = options.cards.slice().sort((a,b) => value(a) - value(b));
    if (options.take) {
      if (!cards.length) return {type:'take'};
      const attack = v.table.find(pair => pair.cover === null).attack;
      const expensive = suit(cards[0]) === v.trump && suit(attack) !== v.trump && rank(cards[0]) >= 6;
      if (expensive && v.deckCount > 6 && v.table.length === 1 && rank(attack) <= 3 && v.hand.length >= 4) return {type:'take'};
    }
    if (options.pass && cards.length && suit(cards[0]) === v.trump && v.deckCount > 0 && !v.taking && v.hand.length > 1) return {type:'pass'};
    if (cards.length) return {type:'card', card:cards[0]};
    return options.pass ? {type:'pass'} : null;
  }

  return {RANKS, SUITS, rank, suit, isCard, beats, shuffle, create, play, settle, view, validView, legal, bot};
})();
if (typeof module !== 'undefined') module.exports = Durak;
