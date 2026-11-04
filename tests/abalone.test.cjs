const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const file=require('path').join(__dirname,'../src/abalone/core.js');
let A=fs.existsSync(file)?require(file):{};
test('Abalone rules and engine are available',()=>assert.equal(typeof A.create,'function'));
if(A.create){
 const idx=(q,r)=>A.index(q,r);
 function position(black,white,lost=[0,0,0]){const s=A.create(0);s.b.fill(0);black.forEach(([q,r])=>s.b[idx(q,r)]=1);white.forEach(([q,r])=>s.b[idx(q,r)]=2);s.lost=lost.slice();return s;}
 test('61 spaces; ten distinct balanced setups; standard back rows and black starts',()=>{
  assert.equal(A.cells.length,61);const seen=new Set();
  for(let i=0;i<10;i++){const s=A.create(i);assert.equal(s.turn,1);assert.equal([...s.b].filter(x=>x===1).length,14);assert.equal([...s.b].filter(x=>x===2).length,14);seen.add([...s.b].join(''));assert.ok(A.moves(s).length>0);}
  assert.equal(seen.size,10);const s=A.create(0);for(const name of ['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','B6','C3','C4','C5'])assert.equal(s.b[A.cells.findIndex(c=>c.name===name)],1,name);
 });
 test('single step and three-marble sidestep are simultaneous and immutable',()=>{
  const s=position([[-1,0],[0,0],[1,0]],[[0,-2]]),group=[idx(-1,0),idx(0,0),idx(1,0)];
  const n=A.play(s,{cells:group,dir:1});assert.ok(n);assert.equal(n.turn,2);assert.equal(n.plies,1);
  for(let q=-1;q<=1;q++){assert.equal(n.b[idx(q,0)],0);assert.equal(n.b[idx(q,1)],1);assert.equal(s.b[idx(q,0)],1);}
  assert.deepEqual(s.lost,[0,0,0]);assert.ok(A.play(s,{cells:[idx(0,0)],dir:4}));
 });
 test('only contiguous straight groups of up to three; no self ejection or sideways pushing',()=>{
  let s=position([[-2,0],[-1,0],[0,0],[1,0],[4,0]],[[0,1]]);
  assert.equal(A.play(s,{cells:[idx(-2,0),idx(0,0)],dir:4}),null);
  assert.equal(A.play(s,{cells:[idx(-2,0),idx(-1,0),idx(0,0),idx(1,0)],dir:4}),null);
  assert.equal(A.play(s,{cells:[idx(-1,0),idx(0,0),idx(1,0)],dir:1}),null);
  assert.equal(A.play(s,{cells:[idx(4,0)],dir:0}),null);
  assert.equal(A.play(s,{cells:[idx(0,1)],dir:0}),null);
 });
 test('sumito: two push one, three push two; equality and a blocked tail cannot push',()=>{
  let s=position([[-2,0],[-1,0]],[[0,0]]),g=[idx(-2,0),idx(-1,0)];
  let n=A.play(s,{cells:g,dir:0});assert.ok(n);assert.equal(n.b[idx(1,0)],2);assert.equal(n.b[idx(0,0)],1);
  assert.equal(A.play(s,{cells:[idx(-1,0)],dir:0}),null);
  s=position([[-3,0],[-2,0],[-1,0]],[[0,0],[1,0]]);g=[idx(-3,0),idx(-2,0),idx(-1,0)];n=A.play(s,{cells:g,dir:0});assert.ok(n);assert.equal(n.b[idx(2,0)],2);
  assert.equal(A.play(s,{cells:g.slice(1),dir:0}),null);
  s.b[idx(2,0)]=1;assert.equal(A.play(s,{cells:g,dir:0}),null);
 });
 test('the sixth opponent ejection wins; it removes one marble and ends legal play',()=>{
  const s=position([[2,0],[3,0]],[[4,0]],[0,0,5]),n=A.play(s,{cells:[idx(2,0),idx(3,0)],dir:0});
  assert.ok(n);assert.equal(n.lost[2],6);assert.equal(n.winner,1);assert.equal(n.b[idx(4,0)],1);assert.equal([...n.b].filter(x=>x===2).length,0);assert.equal(A.moves(n).length,0);assert.equal(s.lost[2],5);
 });
 test('engine finds an immediate winning push and returns a legal recommendation',()=>{
  const s=position([[2,0],[3,0]],[[4,0]],[0,0,5]),r=A.think(s,1,100);
  assert.ok(r.best);const n=A.play(s,r.best);assert.ok(n);assert.equal(n.winner,1);assert.equal(r.p,1);assert.ok(r.depth>=1);
 });
 test('white can eject the sixth black marble through every edge direction',()=>{
  const fixtures=[[[2,0],[3,0],[4,0]],[[0,2],[0,3],[0,4]],[[-2,2],[-3,3],[-4,4]],[[-2,0],[-3,0],[-4,0]],[[0,-2],[0,-3],[0,-4]],[[2,-2],[3,-3],[4,-4]]];
  fixtures.forEach(([a,b,enemy],dir)=>{const s=position([enemy],[a,b],[0,5,0]);s.turn=2;const n=A.play(s,{cells:[idx(...a),idx(...b)],dir});assert.ok(n,'direction '+dir);assert.equal(n.lost[1],6);assert.equal(n.winner,2);assert.equal(n.turn,1);});
 });
 test('a played sequence conserves marbles and never changes a previous position',()=>{
  let s=A.create(2),seed=731;for(let k=0;k<45&&!s.winner;k++){const moves=A.moves(s),before=[...s.b];seed=(seed*1664525+1013904223)>>>0;const n=A.play(s,moves[seed%moves.length]);assert.ok(n);assert.deepEqual([...s.b],before);for(const side of [1,2])assert.equal([...n.b].filter(v=>v===side).length+n.lost[side],14);s=n;}
 });
}
