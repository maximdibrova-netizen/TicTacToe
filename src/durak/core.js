var Durak = (function () {
  'use strict';

  const SHORT = 36, FULL = 52, HAND = 6;
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SUITS = ['♣','♦','♥','♠'];
  // Keep the existing IDs for 6–A. The four low ranks of each suit follow.
  const rank = card => card < SHORT ? card % 9 + 4 : (card-SHORT) % 4;
  const suit = card => card < SHORT ? Math.floor(card/9) : Math.floor((card-SHORT)/4);
  const isCard = (card, size = FULL) => Number.isInteger(card) && card >= 0 && card < size;
  const word = new Uint32Array(1);

  function randomBelow(n) {
    const crypto = typeof globalThis !== 'undefined' && globalThis.crypto;
    if (!crypto?.getRandomValues) return Math.floor(Math.random()*n);
    const limit = 0x100000000 - 0x100000000 % n;
    do { crypto.getRandomValues(word); } while (word[0] >= limit);
    return word[0] % n;
  }
  function shuffle(size = SHORT) {
    const deck = Array.from({length:size},(_,i)=>i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomBelow(i+1);
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
    state.originalAttacker = attacker;
    state.defender = nextWithCards(state, attacker);
    state.limit = Math.min(HAND, state.hands[state.defender].length);
    state.actor = attacker;
    state.phase = 'lead';
    state.table = [];
    state.taking = false;
    state.passed = [];
    state.honest = false;
  }
  function create(count = 2, cards, options = {}) {
    if (!Number.isInteger(count) || count < 2 || count > 4) throw new RangeError('Нужно от 2 до 4 игроков.');
    const size = options.size ?? cards?.length ?? SHORT;
    if (![SHORT,FULL].includes(size)) throw new RangeError('Нужно 36 или 52 карты.');
    if (cards === undefined) cards = shuffle(size);
    if (!Array.isArray(cards) || cards.length !== size || new Set(cards).size !== size || !cards.every(card => isCard(card,size))) throw new Error('Некорректная колода.');
    const deck = cards.slice(), hands = Array.from({length: count}, () => []);
    for (let card = 0; card < HAND; card++) for (const hand of hands) hand.push(deck.pop());
    const trumpCard = deck[0], trump = suit(trumpCard);
    let attacker = null, lowest = RANKS.length;
    hands.forEach((hand, i) => hand.forEach(card => {
      if (suit(card) === trump && rank(card) < lowest) { attacker = i; lowest = rank(card); }
    }));
    const variant = options.variant === 'transfer' ? 'transfer' : 'throw';
    const cheat = count === 2 && options.cheat === true;
    const state = {count, size, variant, cheat, deck, hands, trump, trumpCard, discard: [], round: 1, version: 0, result: null, resolved: null, last: null};
    begin(state, attacker ?? randomBelow(count));
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
    const noMove = {cards: [], transfers: [], take: false, pass: false, challenge: null};
    if (view.result || view.actor !== view.seat) return noMove;
    if (view.phase === 'lead') return {...noMove, cards: view.hand.slice()};
    if (view.phase === 'throw') return {...noMove, pass: true, cards: matching(view.hand, view.table)};
    if (view.phase === 'review') return {...noMove, pass:true, challenge:view.last.card};
    const pair = view.table.find(p => p.cover === null);
    if (!pair) return noMove;
    const target = transferTarget(view);
    return {...noMove, take:true,
      cards:view.hand.filter(card => (view.cheat && !view.honest) || beats(card,pair.attack,view.trump)),
      transfers:target === undefined ? [] : view.hand.filter(card => rank(card) === rank(pair.attack))};
  }

  function transferTarget(v) {
    if (v.variant !== 'transfer' || v.table.some(pair => pair.cover !== null)) return;
    const next = orderFrom(v.count,(v.defender+1)%v.count).find(i => i !== v.defender && v.counts[i]);
    if (v.table.length < HAND && v.counts[next] > v.table.length) return next;
  }

  function resolve(state) {
    const {attacker, defender, table, taking} = state;
    const played = table.flatMap(pair => pair.cover === null ? [pair.attack] : [pair.attack, pair.cover]);
    const draws = [];
    state.resolved = {round: state.round, defender, taking, table: table.map(pair => ({...pair})), draws};
    if (taking) state.hands[defender].push(...played);
    else state.discard.push(...played);
    const original = state.originalAttacker ?? attacker;
    const seats = orderFrom(state.count, original);
    const drawOrder = original === defender ? seats : seats.filter(i => i !== defender).concat(defender);
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
  function finishCover(state) {
    if (state.table.some(pair => pair.cover === null)) {
      state.phase = 'defend';
      state.actor = state.defender;
    } else offerThrow(state);
  }

  function play(state, seat, action) {
    if (!action || typeof action !== 'object' || state.result || state.actor !== seat) return null;
    const options = legal(view(state, seat));
    const card = action.card;
    if (action.type === 'card' ? !options.cards.includes(card)
      : action.type === 'transfer' ? !options.transfers.includes(card)
      : action.type === 'challenge' ? options.challenge === null || card !== options.challenge
      : action.type === 'take' ? !options.take
      : action.type === 'pass' ? !options.pass : true) return null;

    const next = copy(state);
    next.version++;
    next.last = ['card','transfer'].includes(action.type) ? {type:action.type,seat,card} : {type:action.type,seat};
    if (state.phase === 'review') {
      const pair = next.table.find(p => p.cover === options.challenge);
      if (action.type === 'challenge' && !beats(card,pair.attack,state.trump)) {
        pair.cover = null;
        next.hands[next.defender].push(card);
        next.last = {type:'caught',seat:next.defender,card};
        next.actor = next.defender;
        next.phase = 'defend';
        next.honest = true;
      } else finishCover(next);
    } else if (action.type === 'take') {
      next.taking = true;
      next.passed = [];
      offerThrow(next);
    } else if (action.type === 'pass') {
      next.passed.push(seat);
      offerThrow(next);
    } else {
      const hand = next.hands[seat];
      hand.splice(hand.indexOf(card), 1);
      if (action.type === 'transfer') {
        const target = transferTarget(view(state,seat));
        next.table.push({attack:card,cover:null,by:seat});
        next.attacker = seat;
        next.defender = next.actor = target;
        next.limit = Math.min(HAND,next.hands[target].length);
        next.honest = false;
      } else if (state.phase === 'defend') {
        next.table.find(pair => pair.cover === null).cover = card;
        next.passed = [];
        next.honest = false;
        if (state.cheat) {
          next.phase = 'review';
          next.actor = 1-seat;
        } else finishCover(next);
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
    else if (!['resign','time'].includes(reason) || !Number.isInteger(loser) || loser < 0 || loser >= state.count) return null;
    return {...state, phase: 'end', actor: -1, version: state.version + 1, result: {reason, loser}};
  }

  // A peer receives their own hand and public information only.
  function view(state, seat) {
    return {
      seat, count: state.count, size:state.size, variant:state.variant, cheat:state.cheat, honest:state.honest,
      hand: state.hands[seat].slice(), counts: state.hands.map(hand => hand.length),
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
    const size = v.size ?? SHORT;
    const card = c => isCard(c,size);
    const pair = p => p && card(p.attack) && (p.cover === null || card(p.cover)) && player(p.by);
    const table = t => Array.isArray(t) && t.length <= HAND && t.every(pair);
    return [SHORT,FULL].includes(size) && ['throw','transfer'].includes(v.variant ?? 'throw')
      && [undefined,false,true].includes(v.cheat) && [undefined,false,true].includes(v.honest)
      && Array.isArray(v.hand) && v.hand.length <= size && v.hand.every(card) && new Set(v.hand).size === v.hand.length
      && Array.isArray(v.counts) && v.counts.length === 2 && v.counts.every(n => number(n, 0, size)) && v.counts[seat] === v.hand.length
      && number(v.deckCount,0,size) && number(v.discardCount,0,size) && number(v.trump,0,3)
      && (v.deckCount ? card(v.trumpCard) && suit(v.trumpCard) === v.trump : v.trumpCard === null)
      && player(v.attacker) && player(v.defender) && v.attacker !== v.defender && number(v.limit,1,HAND)
      && ['lead','defend','throw','review','end'].includes(v.phase) && typeof v.taking === 'boolean'
      && (v.phase === 'end' ? v.actor === -1 && !!v.result : player(v.actor) && v.result === null)
      && table(v.table) && number(v.round,1,10000) && number(v.version,0,100000)
      && (v.phase !== 'review' || (v.cheat && v.actor !== v.defender && v.last?.type === 'card'
        && v.last.seat === v.defender && card(v.last.card) && v.table.some(p => p.cover === v.last.card)))
      && (v.resolved === null || (v.resolved && player(v.resolved.defender) && table(v.resolved.table)
        && (v.resolved.draws === undefined || (Array.isArray(v.resolved.draws) && v.resolved.draws.length <= size && v.resolved.draws.every(player)))))
      && (v.result === null || (['cards','draw','resign','time'].includes(v.result.reason) && (v.result.loser === null || player(v.result.loser))));
  }

  // простой бот: самой дешёвой картой; им же доигрываются партии при переборе
  function simpleBot(v) {
    const options = legal(v);
    const value = card => rank(card) + (suit(card) === v.trump ? RANKS.length : 0);
    const cards = options.cards.slice().sort((a,b) => value(a) - value(b));
    if (options.take) {
      const transfer = options.transfers.slice().sort((a,b) => value(a)-value(b))[0];
      if (transfer !== undefined && (!cards.length || value(transfer) <= value(cards[0]))) return {type:'transfer',card:transfer};
      if (!cards.length) return {type:'take'};
      const attack = v.table.find(pair => pair.cover === null).attack;
      const expensive = suit(cards[0]) === v.trump && suit(attack) !== v.trump && rank(cards[0]) >= RANKS.indexOf('Q');
      if (expensive && v.deckCount > 6 && v.table.length === 1 && rank(attack) <= RANKS.indexOf('9') && v.hand.length >= 4) return {type:'take'};
    }
    if (options.pass && cards.length && suit(cards[0]) === v.trump && v.deckCount > 0 && !v.taking && v.hand.length > 1) return {type:'pass'};
    if (cards.length) return {type:'card', card:cards[0]};
    return options.pass ? {type:'pass'} : null;
  }

  // Сильный бот: в эндшпиле на двоих (колода кончилась) — точный перебор, иначе пробует каждый ход в сотне
  // случайных раздач невидимых карт (видит только то, что видит игрок: свою руку, стол и вышедшие карты).
  const strong = (function (D) {
const {rank, suit, beats, legal, play} = D;
  const HAND = 6;
  function value(v, card) { return rank(card) + (suit(card) === v.trump ? 20 : 0); }
  function cheapest(v, cards) { return cards.slice().sort((a, b) => value(v, a) - value(v, b)); }
  const isTrump = (v, c) => suit(c) === v.trump;
  // high card: an ace/king or any trump of rank ≥ queen-equivalent
  function rankOf(name, v) { return v.size === 52 ? ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].indexOf(name) : ['6','7','8','9','10','J','Q','K','A'].indexOf(name) + 4; }

  // ---------- exact endgame ----------
  function fullState(v, unseen) {
    const opp = 1 - v.seat, hands = [];
    hands[v.seat] = v.hand.slice(); hands[opp] = unseen.slice();
    return {count: 2, size: v.size || 36, variant: v.variant || 'throw', cheat: false, deck: [], hands, trump: v.trump, trumpCard: v.trumpCard,
      discard: [], round: v.round, version: v.version, result: null, resolved: null, last: null,
      attacker: v.attacker, originalAttacker: v.attacker, defender: v.defender, limit: v.limit, actor: v.actor, phase: v.phase,
      table: v.table.map(p => ({...p})), taking: v.taking, passed: [], honest: false};
  }
  function actions(state) {
    const view = D.view(state, state.actor), o = legal(view), out = [];
    // order: cheap cards first (good for alpha-beta)
    cheapest(view, o.cards).forEach(card => out.push({type: 'card', card}));
    o.transfers.forEach(card => out.push({type: 'transfer', card}));
    if (o.take) out.push({type: 'take'});
    if (o.pass) out.push({type: 'pass'});
    return out;
  }
  function solve(v, unseen, budget) {
    const me = v.seat, memo = new Map();
    let nodes = 0;
    const key = s => s.hands.map(h => h.slice().sort((a, b) => a - b).join('.')).join('|') + '/' + s.table.map(p => p.attack + ':' + p.cover).join(',') + '/' + s.phase + s.actor + s.attacker + s.defender + (s.taking ? 1 : 0) + s.limit;
    function go(s, alpha, beta, depth = 0) {
      if (depth > 150) throw 'budget';
      if (s.result) return s.result.loser === null ? 0 : s.result.loser === me ? -1 : 1;
      if (++nodes > budget) throw 'budget';
      const k = key(s), hit = memo.get(k);
      if (hit !== undefined) return hit;
      const maximize = s.actor === me;
      let best = maximize ? -2 : 2;
      for (const a of actions(s)) {
        const n = play(s, s.actor, a); if (!n) continue;
        const val = go(n, alpha, beta, depth + 1);
        if (maximize) { if (val > best) best = val; if (best > alpha) alpha = best; }
        else { if (val < best) best = val; if (best < beta) beta = best; }
        if (alpha >= beta) break;
      }
      // only exact values are stored (window-independent): [-1, 0, 1] with a full window, or a cut proving a bound
      if (best === 1 || best === -1 || (alpha < best && best < beta)) memo.set(k, best);
      return best;
    }
    try {
      const root = fullState(v, unseen);
      let bestA = null, bestV = -2;
      for (const a of actions(root)) {
        const n = play(root, me, a); if (!n) continue;
        const val = go(n, bestV, 2);
        if (val > bestV) { bestV = val; bestA = a; }
        if (bestV === 1) break;
      }
      return bestA && {action: bestA, value: bestV};
    } catch (e) { if (e === 'budget') return null; throw e; }
  }

  // ---------- heuristics ----------
  function lead(v, cards) {
    const opp = 1 - v.seat, endgame = !v.deckCount;
    const byRank = {};
    cards.forEach(c => { (byRank[rank(c)] = byRank[rank(c)] || []).push(c); });
    const scored = cards.map(c => {
      let s = value(v, c);
      const same = byRank[rank(c)].filter(x => !isTrump(v, x)).length;
      if (same > 1 && !isTrump(v, c) && !F.includes('nopair')) s -= 3 * (same - 1);          // lead pairs: more to throw in later
      if (endgame && v.counts && v.counts[opp] === 1) s = -value(v, c); // last card of the defender: hit hard
      return {c, s};
    }).sort((a, b) => a.s - b.s);
    return scored[0].c;
  }
  function throwIn(v, o) {
    const cards = cheapest(v, o.cards), deck = v.deckCount;
    if (!cards.length) return {type: 'pass'};
    const c = cards[0], hi = value(v, c);
    if (v.taking) {
      // the defender is taking anyway: hand over cheap non-trumps; late in the game anything that is not a top trump
      if (!isTrump(v, c) && (hi < 11 + (v.size === 52 ? -4 : 0) || deck <= 6)) return {type: 'card', card: c};
      if (!deck && !(isTrump(v, c) && rank(c) >= rankOf('Q', v))) return {type: 'card', card: c};
      return {type: 'pass'};
    }
    if (F.includes('throwall')) return isTrump(v, c) && deck ? {type: 'pass'} : {type: 'card', card: c};
    // keep pressing with cheap cards; spend trumps only when the deck is gone
    if (!isTrump(v, c) && (rank(c) <= rankOf('10', v) || deck <= 4)) return {type: 'card', card: c};
    if (!deck) return {type: 'card', card: c};
    return {type: 'pass'};
  }
  function defend(v, o) {
    const pair = v.table.find(p => p.cover === null), attack = pair.attack, deck = v.deckCount;
    const covers = cheapest(v, o.cards);
    const transfer = cheapest(v, o.transfers)[0];
    if (transfer !== undefined && (!isTrump(v, transfer) || deck === 0) && (!covers.length || value(v, transfer) <= value(v, covers[0]) + 4)) return {type: 'transfer', card: transfer};
    if (!covers.length) return {type: 'take'};
    const c = covers[0];
    // what does taking cost? cards on the table go to our hand
    const onTable = v.table.reduce((n, p) => n + 1 + (p.cover !== null ? 1 : 0), 0);
    const spendsTrump = isTrump(v, c) && !isTrump(v, attack);
    if (F.includes('notake')) return {type: 'card', card: c};
    if (spendsTrump && deck > 8 && rank(c) >= rankOf('J', v) && onTable <= 2 && v.hand.length <= 6 && rank(attack) <= rankOf('10', v)) return {type: 'take'};
    if (spendsTrump && deck > 14 && onTable <= 1 && rank(attack) <= rankOf('8', v) && v.hand.filter(x => isTrump(v, x)).length <= 2) return {type: 'take'};
    return {type: 'card', card: c};
  }
  const F = [];
  // ---------- sampling (deck still has cards): try every option in many dealt-out worlds ----------
  function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function world(v, unseen) {
    const pool = shuffled(unseen), hands = [];
    let at = 0;
    for (let i = 0; i < v.count; i++) if (i === v.seat) hands[i] = v.hand.slice(); else { hands[i] = pool.slice(at, at + v.counts[i]); at += v.counts[i]; }
    const rest = pool.slice(at), deck = v.deckCount ? [v.trumpCard].concat(rest.slice(0, v.deckCount - 1)) : [];
    return {count: v.count, size: v.size || 36, variant: v.variant || 'throw', cheat: false, deck, hands, trump: v.trump, trumpCard: v.trumpCard,
      discard: [], round: v.round, version: v.version, result: null, resolved: null, last: null,
      attacker: v.attacker, originalAttacker: v.attacker, defender: v.defender, limit: v.limit, actor: v.actor, phase: v.phase,
      table: v.table.map(p => ({...p})), taking: v.taking, passed: [], honest: false};
  }
  function rollout(s, me) {
    for (let k = 0; k < 400 && !s.result; k++) { const n = play(s, s.actor, D.simpleBot(D.view(s, s.actor))); if (!n) break; s = n; }
    if (!s.result) return 0;
    return s.result.loser === null ? 0 : s.result.loser === me ? -1 : 1;
  }
  function sample(v, unseen, ms) {
    const opts = actions({...world(v, unseen)});
    if (opts.length < 2) return opts[0] || null;
    const total = opts.map(() => 0), end = Date.now() + ms;
    let n = 0;
    while (Date.now() < end && n < 400) {
      const w = world(v, unseen);
      opts.forEach((a, i) => { const s = play(w, v.seat, a); if (s) total[i] += rollout(s, v.seat); else total[i] -= 9; });
      n++;
    }
    let bi = 0; total.forEach((t, i) => { if (t > total[bi]) bi = i; });
    return opts[bi];
  }
  function bot(v, info) {
    const o = legal(v);
    if (!o.cards.length && !o.transfers.length && !o.take && !o.pass && o.challenge == null) return null;
    if (v.phase === 'review') return {type: 'pass'};
    // two players, empty deck: the opponent's hand is known — search it out
    if (info && Array.isArray(info.unseen) && !v.deckCount && v.count === 2 && !v.cheat) {
      const s = solve(v, info.unseen, info.budget || 20000);
      if (s) return s.action;
    }
    if (info && Array.isArray(info.unseen) && !v.cheat && !F.includes('nosample')) {
      const a = sample(v, info.unseen, info.ms || 150);
      if (a) return a;
    }
    if (v.phase === 'lead') return {type: 'card', card: lead(v, o.cards)};
    if (v.phase === 'throw') return throwIn(v, o);
    if (o.take) return defend(v, o);
    if (o.cards.length) return {type: 'card', card: cheapest(v, o.cards)[0]};
    return o.pass ? {type: 'pass'} : null;
  }
  // cards nobody has seen leave the table: everything minus own hand, discard, table and the face-up trump
  function unseen(state, seat) {
    const seen = new Set(state.hands[seat].concat(state.discard, state.table.flatMap(p => p.cover === null ? [p.attack] : [p.attack, p.cover])));
    if (state.deck.length) seen.add(state.trumpCard);
    const out = [];
    for (let c = 0; c < state.size; c++) if (!seen.has(c)) out.push(c);
    return out;
  }
  function estimate(v, unseen, n) {
    let total = 0, k = 0;
    for (; k < n; k++) total += rollout(world(v, unseen), v.seat);
    return k ? total / k : 0;
  }
  return {bot, unseen, solve, estimate};
  })({rank, suit, beats, legal, play, view, simpleBot});
  function bot(v, info) { return info ? strong.bot(v, info) : simpleBot(v); }
  return {RANKS, SUITS, rank, suit, isCard, beats, shuffle, create, play, settle, view, validView, legal, bot, simpleBot, unseen: strong.unseen, estimate: (state, seat, n = 60) => strong.estimate(view(state, seat), strong.unseen(state, seat), n)};
})();
if (typeof module !== 'undefined') module.exports = Durak;
