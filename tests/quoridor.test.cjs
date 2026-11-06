const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('../src/quoridor/core.js');

test('two and four players have opposite goals, equal wall stocks and clockwise turns', () => {
  let s = Q.create(4);
  assert.deepEqual(s.pawns,[76,4,36,44]);
  assert.deepEqual(s.remaining,[5,5,5,5]);
  for (const [key, turn] of [['p:67',2],['p:37',1],['p:13',3],['p:43',0]]) {
    s = Q.play(s,key);
    assert.equal(s.turn,turn);
  }
  assert.deepEqual(Q.create(2).remaining,[10,10]);
  assert.throws(() => Q.create(3));
  for (let seat=0;seat<4;seat++) assert.equal(Q.route(s,seat).length,8);
});

test('a jump uses the open square behind a pawn; a fence or edge permits side jumps', () => {
  const s = {...Q.create(),pawns:[40,31]};
  assert.ok(Q.pawnMoves(s).includes(22));
  assert.ok(!Q.pawnMoves(s).includes(30));
  assert.ok(!Q.pawnMoves(s).includes(31));
  const h = s.h.slice(); h[20] = 2;
  const blocked = {...s,h};
  assert.ok(!Q.pawnMoves(blocked).includes(22));
  assert.ok(Q.pawnMoves(blocked).includes(30));
  assert.ok(Q.pawnMoves(blocked).includes(32));
  assert.ok(Q.pawnMoves({...Q.create(),pawns:[13,4]}).includes(3));
  const four = {...Q.create(4),pawns:[40,31,22,44]};
  assert.ok(!Q.pawnMoves(four).includes(13));
  assert.ok(Q.pawnMoves(four).includes(32));
});

test('a wall spends one token, blocks two edges, and rejects overlap and crossing', () => {
  const start = Q.create();
  const s = Q.play(start,'h:59');
  assert.equal(start.remaining[0],10);
  assert.equal(s.remaining[0],9);
  assert.equal(s.h[59],1);
  assert.ok(!Q.pawnMoves(s,0).includes(67));
  assert.equal(Q.wallError(s,'v',59),'cross');
  assert.equal(Q.wallError(s,'h',58),'overlap');
  assert.equal(Q.wallError(s,'h',60),'overlap');
  assert.equal(Q.wallError(s,'h',61),null);
  assert.equal(Q.play(s,'h:58'),null);
  for (const key of ['h:-1','v:64','p:81','p: 1','p:01','resign:0',null]) assert.equal(Q.play(s,key),null);
});

test('closing the only route is forbidden, including for a third seat', () => {
  const start = Q.play(Q.create(4),'v:1');
  const s = {...start,pawns:[76,4,0,44]};
  assert.ok(Q.route(s,2).length);
  assert.equal(Q.wallError(s,'h',0),'blocked');
  assert.equal(Q.play(s,'h:0'),null);
  assert.equal(s.remaining[s.turn],5);
});

test('reaching the goal ends the game, and resignation is recorded without accepting it as a move', () => {
  const s = {...Q.create(),pawns:[13,4]};
  assert.equal(Q.play(s,'p:3').winner,0);
  const first = Q.settle(Q.create(4),'resign',2);
  assert.equal(first.pawns[2],-1);
  assert.equal(first.winner,null);
  const seq = ['p:67','v:27','resign:2','draw'];
  const line = Q.replay(4,seq);
  assert.ok(line.at(-1).s.draw);
  assert.equal(line.at(-1).s.pawns[2],-1);
  assert.throws(() => Q.replay(2,['p:4']));
});

test('bot can take a win and stop an immediate rival win', () => {
  const winning = {...Q.create(),pawns:[13,49]};
  assert.equal(Q.play(winning,Q.think(winning,2).best).winner,0);
  const urgent = {...Q.create(),pawns:[60,67]};
  const best = Q.think(urgent,1).best;
  assert.ok(best.startsWith('h:'));
  const next = Q.play(urgent,best);
  assert.ok(!Q.pawnMoves(next).some(cell => Q.goal(1,cell)));
});

test('complete bot games preserve legal routes and terminate with a winner', () => {
  for (const count of [2,4]) {
    let s = Q.create(count);
    for (let ply=0;ply<150&&!Q.over(s);ply++) {
      const best = Q.think(s,0).best;
      assert.ok(best);
      s = Q.play(s,best);
      assert.ok(s);
      for (let seat=0;seat<count;seat++) assert.ok(Q.route(s,seat).length);
    }
    assert.notEqual(s.winner,null);
  }
});
