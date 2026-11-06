const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../src/ratings/core.cjs'),R=fs.existsSync(file)?require(file):{};
test('Glicko rating core is available',()=>assert.equal(typeof R.settle,'function'));
if(R.settle){
 test('a new rating starts at 1200 with high uncertainty and ten provisional matches',()=>{
  const p=R.initial();assert.equal(p.r,120000);assert.equal(p.rd,35000);assert.equal(p.games,0);assert.equal(R.provisional(p),true);assert.equal(R.provisional({...p,games:10}),false);
 });
 test('published Glickman worked example matches the reference, retaining centipoint precision',()=>{
  const me={...R.initial(),r:150000,rd:20000};const n=R.update(me,[{rating:{...R.initial(),r:140000,rd:3000},score:1},{rating:{...R.initial(),r:155000,rd:10000},score:0},{rating:{...R.initial(),r:170000,rd:30000},score:0}],'example-match','loss');
  assert.ok(Math.abs(n.r/100-1464.106)<.02);assert.ok(Math.abs(n.rd/100-151.399)<.02);assert.equal(n.games,1);assert.equal(n.losses,1);assert.equal(n.lastMatch,'example-match');assert.equal(me.r,150000);
 });
 test('a stronger upset raises the rating further, draws depend on relative strength, and both sides update',()=>{
  const p=R.initial(),r=R.settle(['alice','bob'],[p,p],[0,1],'equal-match');assert.ok(r[0].r>p.r);assert.ok(r[1].r<p.r);assert.ok(r[0].rd<p.rd);assert.equal(r[0].wins,1);assert.equal(r[1].losses,1);
  const up=R.settle(['alice','bob'],[p,{...p,r:180000}],[0,1],'upset-match');assert.ok(up[0].r-r[0].r>0);
  const draw=R.settle(['alice','bob'],[p,{...p,r:180000}],[0,0],'draw-match');assert.ok(draw[0].r>p.r);assert.ok(draw[1].r<180000);assert.equal(draw[0].draws,1);assert.equal(draw[1].draws,1);
 });
 test('four participants use pairwise places; tied losers draw one another rather than losing to each other',()=>{
  const p=R.initial(),r=R.settle(['a','b','c','d'],[p,p,p,p],[0,1,1,1],'four-player');assert.ok(r[0].r>p.r);assert.ok(r[1].r<p.r);assert.equal(r[1].r,r[2].r);assert.equal(r[2].r,r[3].r);assert.equal(r[0].games,1);assert.equal(r[1].losses,1);
  const tie=R.settle(['a','b','c'],[p,p,p],[0,0,0],'three-draw');assert.ok(tie.every(x=>x.r===p.r&&x.draws===1));
 });
 test('duplicate identities, malformed ranks, private bots and arbitrary pools cannot enter the competitive algorithm',()=>{
  const p=R.initial();assert.throws(()=>R.settle(['a','a'],[p,p],[0,1],'bad'));assert.throws(()=>R.settle(['a','b'],[p,p],[1,1],'bad'));assert.throws(()=>R.settle(['a','b'],[p,p],[0,2],'bad'));assert.throws(()=>R.update(p,[{rating:p,score:2}],'bad','win'));
  assert.equal(R.validPool('chess'),true);assert.equal(R.validPool('multi3'),true);assert.equal(R.validPool('multi4'),true);assert.equal(R.validPool('bots'),false);assert.equal(R.validPool('anything'),false);
 });
 test('new rating data stays bounded and cannot fabricate a previous rating or replay a settled match',()=>{
  const p=R.initial();assert.throws(()=>R.settle(['a','b'],[{...p,r:999999},p],[0,1],'bad'));const r=R.settle(['a','b'],[p,p],[0,1],'once');assert.throws(()=>R.settle(['a','b'],r,[0,1],'once'));
  let a=p,b=p;for(let i=0;i<100;i++){[a,b]=R.settle(['a','b'],[a,b],[0,1],'repeat-'+i);}assert.ok(a.rd>=3000&&b.rd>=3000);assert.ok(a.r<=500000&&b.r>=10000);
 });
}
