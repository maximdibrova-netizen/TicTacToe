const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../src/lava/core.js');
function setup(count=2){const s=L.create(count);s.tiles.fill(2);return s;}

test('2, 3 and 4 players have distinct live starts and playable boards',()=>{
  for(const count of [2,3,4]){const s=L.create(count);assert.equal(s.players.length,count);assert.equal(new Set(s.players.map(p=>p.pos)).size,count);assert.ok(L.valid(s));assert.ok(s.tiles.includes(1)&&s.tiles.includes(2));}
  for(const count of [0,1,5,2.5,'2'])assert.throws(()=>L.create(count));
});
test('jump damages departure only, forbids reversal even if tile survives, rejects invalid moves atomically',()=>{
  const s=setup(),before=JSON.stringify(s);let n=L.apply(s,1);
  assert.equal(JSON.stringify(s),before);assert.equal(n.tiles[7],1);assert.equal(n.tiles[8],2);assert.equal(n.players[0].pos,8);assert.equal(n.players[0].back,3);
  n=L.apply(n,0);assert.equal(n.turn,0);assert.ok(!L.moves(n,0).includes(3));assert.equal(L.apply(n,3),null);
  for(const dir of [-1,5,1.3,'1',null,NaN])assert.equal(L.apply(n,dir),null);
});
test('in-place jump consumes one layer and resets the forbidden direction',()=>{
  let s=setup();s.players[0].back=3;s=L.apply(s,4);
  assert.equal(s.players[0].pos,7);assert.equal(s.tiles[7],1);assert.equal(s.players[0].back,-1);
  s=L.apply(s,0);assert.equal(s.turn,0);assert.ok(L.moves(s,0).includes(3));
});
test('ordinary departure becomes lava; landing on lava, occupied tiles, diagonals or outside the board is impossible',()=>{
  let s=L.create(2);s.players[1].pos=8;s.tiles[1]=0;
  assert.equal(L.apply(s,1),null);assert.equal(L.apply(s,0),null);s=L.apply(s,2);assert.equal(s.tiles[7],0);
  assert.equal(L.target(0,0),-1);assert.equal(L.target(0,3),-1);assert.equal(L.target(5,1),-1);assert.equal(L.target(35,2),-1);
});
test('in-place on the last layer eliminates that player and awards the survivor',()=>{
  const s=L.apply(L.create(2),4);assert.equal(s.tiles[7],0);assert.equal(s.players[0].alive,false);assert.equal(s.winner,1);assert.equal(s.over,true);assert.equal(L.apply(s,0),null);assert.ok(L.valid(s));
});
test('a trapped player survives on two layers, then is eliminated when no safe jump remains',()=>{
  let s=setup(3);const p=s.players[1];for(let d=0;d<4;d++)s.tiles[L.target(p.pos,d)]=0;
  s=L.apply(s,3);assert.equal(s.turn,1);assert.deepEqual(L.moves(s,1,true),[4]);
  s=L.apply(s,4);assert.equal(s.players[1].alive,true);assert.equal(s.turn,2);
  s=L.apply(s,2);s=L.apply(s,2);assert.equal(s.players[1].alive,false);assert.equal(s.turn,2);
});
test('occupied exit is checked on the next turn, not prematurely',()=>{
  let s=setup(3);s.players[0].pos=0;s.tiles[0]=1;s.players[1].pos=1;s.tiles[6]=0;
  // Player 0 is blocked now but player 1 moves out before player 0 is due.
  s.turn=1;s=L.apply(s,1);assert.equal(s.players[0].alive,true);
  s=L.apply(s,2);assert.equal(s.turn,0);assert.ok(L.moves(s,0,true).includes(1));
});
test('dead players are skipped and multiple traps resolve to a winner',()=>{
  const s=setup(4);s.tiles.fill(0);s.tiles[7]=2;s.tiles[8]=1;for(const p of s.players.slice(1))s.tiles[p.pos]=1;
  const n=L.apply(s,1);assert.equal(n.over,true);assert.equal(n.winner,0);assert.deepEqual(n.last.eliminated,[1,2,3]);assert.ok(L.valid(n));
});
test('hundreds of complete bot/random matches terminate with valid state and a bounded tile budget',()=>{
  let seed=17;function rand(n){seed=(1664525*seed+1013904223)>>>0;return seed%n;}
  for(const count of [2,3,4])for(let game=0;game<100;game++){
    let s=L.create(count),steps=0,budget=s.tiles.reduce((a,b)=>a+b,0);
    while(!s.over){const legal=L.moves(s,s.turn,true);assert.ok(legal.length);const d=game%2?legal[rand(legal.length)]:L.bot(s);assert.ok(legal.includes(d));s=L.apply(s,d);assert.ok(L.valid(s));assert.equal(s.tiles.reduce((a,b)=>a+b,0),budget-(++steps));assert.ok(steps<=budget);}
    assert.equal(s.players.filter(p=>p.alive).length,1);
  }
});
test('saved/network state validation rejects malformed positions',()=>{
  const s=L.create(2);for(const mutate of [x=>x.players[1].pos=x.players[0].pos,x=>x.tiles[7]=0,x=>x.turn=4,x=>x.tiles[1]=3,x=>x.ply=-1,x=>x.players[0].back=4,x=>x.players[0].alive='true']){const bad=structuredClone(s);mutate(bad);assert.equal(L.valid(bad),false);}assert.equal(L.valid(null),false);
});

test('every map supports every subset of corners and every starting player',()=>{
  for(const m of L.MAPS)for(let mask=1;mask<16;mask++){
    const corners=[0,1,2,3].filter(c=>mask&(1<<c));if(corners.length<2)continue;
    for(let first=0;first<corners.length;first++){
      const s=L.create({mapId:m.id,corners,first});assert.ok(L.valid(s));assert.equal(s.turn,first);
      assert.equal(s.tiles.length,m.size*m.size);assert.deepEqual(s.players.map(p=>p.corner),corners);
      for(let i=0;i<corners.length;i++){assert.equal(s.players[i].pos,L.startCells(m.size)[corners[i]]);assert.ok(L.moves(s,i,true).some(d=>d<4));}
      // Initial islands are connected, so every player can reach every other start.
      const seen=new Set([s.players[0].pos]),queue=[s.players[0].pos];
      while(queue.length){const p=queue.shift();for(let d=0;d<4;d++){const to=L.target(p,d,m.size);if(to>=0&&s.tiles[to]>0&&!seen.has(to)){seen.add(to);queue.push(to);}}}
      for(const p of s.players)assert.ok(seen.has(p.pos));
      let n=s,steps=0;const budget=s.tiles.reduce((a,b)=>a+b,0);
      while(!n.over){const d=L.bot(n);assert.ok(L.moves(n,n.turn,true).includes(d));n=L.apply(n,d);assert.ok(L.valid(n));assert.ok(++steps<=budget);}
      assert.equal(n.players.filter(p=>p.alive).length,1);
    }
  }
});
test('eight-cell rows cannot wrap; map and corner corruption is rejected',()=>{
  assert.equal(L.target(7,1,8),-1);assert.equal(L.target(8,3,8),-1);assert.equal(L.target(63,2,8),-1);assert.equal(L.target(9,2,8),17);
  for(const cfg of [{mapId:'unknown',corners:[0,1]},{mapId:'arena',corners:[1,1]},{mapId:'ring',corners:[-1,3]},{mapId:'cross',corners:[0,2],first:2}])assert.throws(()=>L.create(cfg));
  const s=L.create({mapId:'arena',corners:[1,3],first:1});
  for(const mutate of [x=>x.size=6,x=>x.mapId='classic',x=>x.players[1].corner=1,x=>x.players[1].corner=4,x=>x.tiles.pop()]){const bad=structuredClone(s);mutate(bad);assert.equal(L.valid(bad),false);}
});
