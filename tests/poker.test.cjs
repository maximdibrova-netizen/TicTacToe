const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = require('node:path').join(__dirname, '../src/poker/core.js');
const poker = fs.existsSync(file) ? require(file) : {};
const config = {smallBlind: 5, bigBlind: 10, ante: 0, stack: 1000, seconds: 20, reserve: 30};
const seats = (...stacks) => stacks.map((stack, i) => ({name: 'Игрок ' + i, stack}));
const cards = text => text.split(' ').map(card => '23456789TJQKA'.indexOf(card[0]) + 13 * 'shdc'.indexOf(card[1]));
function hand(stacks, settings = {}, first = '') {
  const front = first ? cards(first) : [];
  const deck = front.concat(Array.from({length: 52}, (_, i) => i).filter(i => !front.includes(i)));
  return poker.newHand(seats(...stacks), {...config, ...settings}, -1, 1000, deck);
}
const move = (h, type, to) => assert.equal(poker.act(h, h.turn, {type, to}, 1000), true);

test('evaluates best five of seven, wheel, kicker, and two triplets', () => {
  assert.equal(typeof poker.evaluate, 'function', 'Texas Hold’em engine exists');
  assert.deepEqual(poker.evaluate(cards('As 2s 3s 4s 5s Kh Qh')), [8, 5]);
  assert.deepEqual(poker.evaluate(cards('As Ah Ad Ks Kh Kd Qh')), [6, 14, 13]);
  assert.ok(poker.compare(poker.evaluate(cards('As Ah Kd Qs Jh 4d 3d')), poker.evaluate(cards('Ac Ad Kc Qd Th 4c 3c'))) > 0);
});

test('heads-up button posts small blind, acts first preflop and last on flop', () => {
  const h = hand([100, 100], {ante: 2});
  assert.deepEqual([h.button, h.small, h.big, h.turn], [0, 0, 1, 0]);
  assert.deepEqual(h.players.slice(0, 2).map(p => [p.bet, p.total]), [[5, 7], [10, 12]]);
  assert.equal(poker.act(h, 1, {type: 'fold'}, 1000), false);
  move(h, 'call'); move(h, 'check');
  assert.deepEqual([h.street, h.turn, h.board.length], [1, 1, 3]);
  const next = poker.newHand(seats(100, 100), config, h.button, 1000);
  assert.equal(next.button, 1);
});

test('short all-in does not reopen action, cumulative short all-ins do', () => {
  const a = hand([45, 1000, 1000, 1000]);
  move(a, 'raise', 30); move(a, 'raise', 45); move(a, 'call'); move(a, 'call');
  assert.equal(a.turn, 3);
  assert.equal(poker.options(a, 3).raise, false);
  assert.equal(poker.act(a, 3, {type: 'raise', to: 90}, 1000), false);
  const b = hand([40, 50, 1000, 1000]);
  move(b, 'raise', 30); move(b, 'raise', 40); move(b, 'raise', 50); move(b, 'call');
  assert.equal(poker.options(b, 3).minimum, 70);
  assert.equal(poker.options(b, 3).raise, true);
});

test('all-in runs the board, awards side pots and returns uncalled chips', () => {
  // Seat 1 has aces, seat 2 kings, seat 0 queens. Deal starts left of button.
  const h = hand([150, 30, 90], {}, 'As Ks Qs Ah Kh Qh 2c 3c 5d 7h 9s Jc Td 8c');
  move(h, 'raise', 150); move(h, 'call'); move(h, 'call');
  assert.equal(h.street, 4);
  assert.deepEqual(h.result.pots.map(p => [p.amount, p.winners]), [[90, [1]], [120, [2]]]);
  assert.deepEqual(h.result.refunds, [{seat: 0, amount: 60}]);
  assert.deepEqual(h.players.slice(0, 3).map(p => p.stack), [60, 90, 120]);
});

test('heads-up short blind only requires matching actual chips', () => {
  const h = hand([100, 7]);
  assert.equal(poker.options(h, 0).call, 2);
  assert.equal(poker.options(h, 0).raise, false);
  move(h, 'call');
  assert.equal(h.result.pots[0].amount, 14);
});

test('unequal folded contributions share one pot when eligibility is unchanged', () => {
  const h = hand([100, 100, 100, 100, 100, 100]);
  // River with the royal flush on board and four players already folded.
  h.board = cards('Ts Js Qs Ks As');
  h.street = 3;
  h.turn = 0;
  h.currentBet = 0;
  h.players.forEach((p, i) => {
    p.cards = [13 + 2 * i, 14 + 2 * i];
    p.total = [25, 25, 1, 2, 3, 4][i];
    p.stack = 100 - p.total;
    p.bet = 0;
    p.folded = i >= 2;
    p.actedAt = null;
  });
  move(h, 'check'); move(h, 'check');
  assert.equal(h.result.pots.length, 1);
  assert.deepEqual(h.result.winnings.slice(0, 2), [30, 30]);
});

test('separate player views hide the deck, future cards and folded hands', () => {
  const h = hand([100, 100, 100]);
  const view = poker.view(h, 0, 1000);
  assert.equal(view.deck, undefined);
  assert.equal(view.players[0].cards.length, 2);
  assert.deepEqual(view.players[1].cards, []);
  move(h, 'fold'); move(h, 'fold');
  assert.equal(h.result.pots[0].winners[0], 2);
  assert.ok(poker.view(h, 0, 1000).players.every((p, i) => !p || i === 0 || p.cards.length === 0));
});

test('action clock uses reserve, expires to fold or check, and can be disabled', () => {
  const h = hand([100, 100], {seconds: 5, reserve: 3});
  assert.deepEqual([h.baseUntil, h.deadline], [6000, 9000]);
  assert.equal(poker.act(h, 0, {type: 'call'}, 7500), true);
  assert.equal(h.players[0].reserve, 1500);
  assert.equal(poker.tick(h, 15500), true);
  assert.equal(h.street, 1);
  assert.equal(poker.tick(h, 23500), true);
  assert.equal(poker.tick(h, 30000), true);
  assert.equal(h.street, 2);
  const untimed = hand([100, 100], {seconds: 0});
  assert.equal(poker.tick(untimed, 1e10), false);
  const expired = hand([100, 100], {seconds: 5, reserve: 0});
  assert.equal(poker.tick(expired, 6000), true);
  assert.equal(expired.result.pots[0].winners[0], 1);
});

test('table rejects seven seats and inconsistent blinds', () => {
  assert.throws(() => hand([10, 10, 10, 10, 10, 10, 10]), /6/);
  assert.throws(() => hand([100, 100], {smallBlind: 11}), /блайнд/i);
});
