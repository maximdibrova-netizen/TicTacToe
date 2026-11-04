const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const f=path.join(__dirname,'../src/falling4/core.js'),A=fs.existsSync(f)?require(f):{};
test('falling four rules exist',()=>assert.equal(typeof A.create,'function'));
if(A.create){
 function line(seq){let s=A.create();for(const c of seq){s=A.play(s,String(c));assert.ok(s);}return s;}
 test('gravity fills the lowest space and rejects a full column',()=>{let s=line([0,0,0,0,0,0]);assert.equal(A.play(s,'0'),null);assert.equal(s.b[35],1);assert.equal(s.b[0],2);assert.equal(A.create().b[35],0);});
 test('a full legal board is a draw, and malformed columns are rejected',()=>{const s=line([0,6,5,3,0,1,5,2,6,3,4,5,3,6,4,3,2,6,1,1,2,2,6,2,5,0,1,0,3,2,0,5,3,0,5,1,4,4,6,1,4,4]);assert.equal(s.winner,3);assert.equal(s.plies,42);for(const key of [null,'',true,'7','-1','3junk'])assert.equal(A.play(A.create(),key),null);});
 test('horizontal and vertical four end play immediately',()=>{for(const seq of [[0,6,1,6,2,5,3],[0,1,0,1,0,1,0]]){const s=line(seq);assert.equal(s.winner,1);assert.equal(s.win.length,4);assert.equal(A.play(s,'4'),null);}});
 test('diagonal line counts and the bot blocks a one-move threat',()=>{const s=line([0,1,1,2,4,2,2,3,4,3,5,3,3]);assert.equal(s.winner,1);const t=line([0,6,1,6,2]),r=A.think(t,1,100);assert.equal(r.best,'3');assert.ok(A.play(t,r.best));});
}
