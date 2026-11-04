const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../src/lava/core.js');
test('resigning removes only that player, including off-turn, and survives replay',()=>{
  const s=L.create(4),n=L.apply(s,42);assert.ok(n);assert.equal(n.players[2].alive,false);assert.equal(n.turn,s.turn);assert.equal(n.over,false);assert.ok(L.valid(n));assert.deepEqual(L.replay(n,n.log),n);
  const m=L.apply(L.apply(n,40),41);assert.equal(m.over,true);assert.equal(m.winner,3);assert.ok(L.valid(m));assert.deepEqual(L.history(m).at(-1),m);
});
test('an agreed draw stops all players and survives replay and validation',()=>{
  const s=L.create(3),n=L.apply(s,44);assert.ok(n);assert.equal(n.over,true);assert.equal(n.draw,true);assert.equal(n.winner,null);assert.equal(n.turn,-1);assert.ok(L.valid(n));assert.deepEqual(L.replay(n,n.log),n);assert.equal(L.apply(n,0),null);assert.equal(s.over,false);
});
const at=(r,c)=>r*6+c;
function game(first=0,corners=[0,1,2,3]){return L.create({mapId:'classic',corners,first});}

test('classic map: 6×6, white 3 / beige 2 / dark 1, everyone starts on a beige tile, clockwise turns',()=>{
  const s=game();
  assert.equal(s.tiles.length,36);assert.ok(L.valid(s));
  assert.deepEqual(s.players.map(p=>p.pos),[at(1,1),at(1,4),at(4,4),at(4,1)]);
  s.players.forEach(p=>assert.equal(s.tiles[p.pos],2));
  assert.equal(s.tiles[at(0,1)],3);assert.equal(s.tiles[at(0,0)],1);
  for(const m of L.MAPS.filter(m=>m.tiles))assert.ok(m.tiles.length===36&&m.tiles.every(t=>t>=1&&t<=3),m.id);
  const n=L.apply(s,0);assert.equal(n.turn,1);
});

test('jump any distance in a straight line, over pieces and lava; only landing on a tile; the take-off tile loses a layer',()=>{
  let s=game(3);                      // red (4,1) first
  s.tiles[at(3,1)]=0;                 // lava in between
  const far=L.moves(s,3).find(m=>m.to===at(0,1));
  assert.ok(far,'can fly over lava and over purple to the top row');assert.equal(far.n,4);
  const n=L.apply(s,far.m);assert.equal(n.players[3].pos,at(0,1));assert.equal(n.tiles[at(4,1)],1);
  s.tiles[at(5,1)]=0;assert.ok(!L.moves(s,3).some(m=>m.to===at(5,1)),'cannot land in lava');
});

test('no going back the way you came; a jump in place lifts the ban and costs a layer; on the last layer you burn',()=>{
  let s=game(3);
  s=L.apply(s,L.code(0,1));           // red up 1
  assert.equal(s.players[3].back,2);
  s.turn=3;assert.ok(!L.moves(s,3).some(m=>m.d===2),'down is forbidden');
  const st=L.apply(s,0);assert.equal(st.players[3].back,-1);assert.equal(st.tiles[at(3,1)],0);assert.equal(st.players[3].alive,false);
});

test('landing on a piece pushes it (and the pieces right behind it) one cell; into lava it burns',()=>{
  let s=game(1);                      // green (1,4) first
  s.players[0].pos=at(1,2);s.players[2].pos=at(1,1);   // purple (1,2), blue (1,1) — a line
  s.tiles[at(1,0)]=0;
  const n=L.apply(s,L.code(3,2));     // green flies left 2 onto purple
  assert.equal(n.last.kind,'push');assert.equal(n.players[1].pos,at(1,2));
  assert.equal(n.players[0].pos,at(1,1));assert.equal(n.players[2].pos,at(1,0));assert.equal(n.players[2].alive,false);
  assert.deepEqual(n.last.killed,[2]);
  assert.equal(n.players[0].back,1,'a pushed piece cannot go straight back toward the pusher');
});

test('pushing toward a wall does not move them; the jumper bounces to the cell in front',()=>{
  let s=game(1);
  s.players[0].pos=at(1,0);           // purple at the left wall
  let n=L.apply(s,L.code(3,4));       // green flies left 4 onto purple
  assert.equal(n.last.kind,'bounce');assert.equal(n.players[0].pos,at(1,0));assert.equal(n.players[1].pos,at(1,1));
  s=game(1);s.players[0].pos=at(1,5);s.players[1].pos=at(1,4);s.tiles[at(1,4)]=1;
  n=L.apply(s,L.code(1,1));           // green steps right into purple at the wall: bounces back home, its tile breaks
  assert.equal(n.last.kind,'bounce');assert.equal(n.players[1].pos,at(1,4));assert.equal(n.players[1].alive,false);
  s=game(1);s.players[0].pos=at(1,0);s.players[3].pos=at(1,1);   // jumper would bounce onto another piece — not allowed
  assert.ok(!L.moves(s,1).some(m=>m.to===at(1,0)||m.land===at(1,0)));
});

test('the last one standing wins; bots finish games without illegal moves',()=>{
  let s=game(0,[0,2]);s.players[1].pos=at(0,1);s.tiles[at(0,0)]=0;
  s.players[0].pos=at(0,3);
  const n=L.apply(s,L.code(3,2));     // purple flies left 2 onto blue at (0,1) → blue pushed into lava at (0,0)
  assert.equal(n.over,true);assert.equal(n.winner,0);assert.ok(L.valid(n));
  for(let g=0;g<20;g++){let t=L.create({mapId:L.MAPS[g%L.MAPS.length].id,corners:[0,1,2,3],first:g%4});let k=0;while(!t.over&&k++<300){const m=L.bot(t);const x=L.apply(t,m);assert.ok(x&&L.valid(x));t=x;}assert.ok(t.over);}
});
