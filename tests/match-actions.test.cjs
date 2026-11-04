const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');const f=path.join(__dirname,'../src/shared/match-core.js'),V=fs.existsSync(f)?require(f):{};
test('draw voting is implemented',()=>assert.equal(typeof V.create,'function'));
if(V.create){
 test('every bot agrees automatically, without consulting a score',()=>{const v=V.create([{id:1,kind:'human'},{id:2,kind:'bot'},{id:3,kind:'bot'}],1,9,'a');assert.equal(v.status,'accepted');assert.deepEqual(v.pending,[]);});
 test('all other humans must consent; a refusal leaves the match running',()=>{let v=V.create([{id:0,kind:'human'},{id:1,kind:'remote'},{id:2,kind:'remote'},{id:3,kind:'bot'}],0,12,'x');v=V.vote(v,1,true,12);assert.equal(v.status,'pending');assert.deepEqual(v.pending,[2]);assert.equal(V.vote(v,2,false,12).status,'declined');assert.equal(V.vote(v,2,true,12).status,'accepted');});
 test('stale replies, duplicate replies and nonparticipants cannot approve a draw',()=>{const v=V.create([{id:'w',kind:'human'},{id:'b',kind:'remote'}],'w',4,'x');assert.equal(V.vote(v,'b',true,3),v);assert.equal(V.vote(v,'stranger',true,4),v);const n=V.vote(v,'b',true,4);assert.equal(n.status,'accepted');assert.equal(V.vote(n,'b',true,4),n);});
}
