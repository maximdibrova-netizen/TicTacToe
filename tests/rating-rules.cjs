// Real Firestore rules evaluation. Run with Auth/Firestore emulators, no production writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rulesFile=path.join(root,'firestore.rules');
(async()=>{
 assert.ok(fs.existsSync(rulesFile),'Firestore rating rules are implemented');
 const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
 const {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,setLogLevel}=require('firebase/firestore');setLogLevel('silent');
 const R=require('../src/ratings/core.cjs'),em=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080',[host,port]=em.split(':');
 // Dedicated namespace: never clear the UI tests' demo-mdgames accounts/data.
 const env=await initializeTestEnvironment({projectId:'demo-rating-rules',firestore:{host,port:+port,rules:fs.readFileSync(rulesFile,'utf8')}});
 const db=uid=>env.authenticatedContext(uid).firestore(),ref=(d,p,u)=>doc(d,'ratingPools',p,'players',u),match=(d,id)=>doc(d,'ratedMatches',id);
 const plain=uid=>({...R.initial(),updatedAt:serverTimestamp()}),names=['Alice','Bob','Carol','Dave'];
 async function make(ids,pool,id){
  for(const u of ids)if(!(await getDoc(ref(db(u),pool,u))).exists())await assertSucceeds(setDoc(ref(db(u),pool,u),plain(u)));
  const accepted=Object.fromEntries(ids.map((u,i)=>[u,i===0]));
  await assertSucceeds(setDoc(match(db(ids[0]),id),{v:1,pool,players:ids,names:names.slice(0,ids.length),config:'standard',createdAt:serverTimestamp(),accepted,reports:{},status:'waiting',settledAt:null,changes:[]}));
  for(let i=1;i<ids.length;i++)await assertSucceeds(updateDoc(match(db(ids[i]),id),{['accepted.'+ids[i]]:true,status:i===ids.length-1?'playing':'waiting'}));
 }
 async function report(ids,id,ranks){for(const u of ids)await assertSucceeds(updateDoc(match(db(u),id),{['reports.'+u]:ranks}));}
 async function prepare(ids,pool,id,ranks){
  const d=db(ids[0]),old=await Promise.all(ids.map(async u=>(await getDoc(ref(d,pool,u))).data())),next=R.settle(ids,old,ranks,id);
  for(let i=0;i<ids.length;i++){try{await assertSucceeds(setDoc(doc(d,'ratedMatches',id,'checks',ids[i]),{base:old,next:next[i],updatedAt:serverTimestamp()}));}catch(e){e.message='Proof '+id+'/'+ids[i]+': '+e.message;throw e;}}
  return{old,next};
 }
 async function batchResult(ids,pool,id,ranks,{tamper=false,missing=false,prepared=null}={}){
  const d=db(ids[0]),{old,next}=prepared||await prepare(ids,pool,id,ranks),b=writeBatch(d);
  b.update(match(d,id),{status:'settled',settledAt:serverTimestamp(),changes:R.changes(old,next)});
  ids.forEach((u,i)=>{if(missing&&i===ids.length-1)return;b.update(ref(d,pool,u),{...next[i],r:next[i].r+(tamper&&i===0?100000:0),updatedAt:serverTimestamp()});});
  return b.commit();
 }
 try{
  await env.clearFirestore();
  const a=db('alice'),b=db('bob');
  const profile=doc(a,'ratingProfiles','alice');
  await assertSucceeds(setDoc(profile,{name:'Alice',updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(b,'ratingProfiles','alice')));
  await assertFails(updateDoc(doc(b,'ratingProfiles','alice'),{name:'Imposter',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(profile,{email:'private@example.com',updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'ratingProfiles','alice')));
  await assertFails(setDoc(ref(env.unauthenticatedContext().firestore(),'chess','anonymous'),plain()));
  await assertFails(setDoc(ref(a,'chess','bob'),plain()));
  await assertFails(setDoc(ref(a,'chess','alice'),{...plain(),r:300000}));
  await assertFails(setDoc(ref(a,'bots','alice'),plain()));
  await make(['alice','bob'],'chess','duel-rating-001');
  await assertFails(updateDoc(match(a,'duel-rating-001'),{'reports.alice':[0,0.5]}));
  await assertFails(updateDoc(match(a,'duel-rating-001'),{'reports.alice':[1,1]}));
  await assertFails(updateDoc(match(a,'duel-rating-001'),{admin:true}));
  await assertFails(updateDoc(match(a,'duel-rating-001'),{pool:'multi3'}));
  await assertFails(updateDoc(match(a,'duel-rating-001'),{'reports.bob':[0,1]}));
  await assertFails(updateDoc(match(a,'duel-rating-001'),{players:['alice','carol']}));
  await assertFails(updateDoc(ref(a,'chess','alice'),{r:300000}));
  await assertFails(deleteDoc(ref(a,'chess','alice')));
  await assertFails(batchResult(['alice','bob'],'chess','duel-rating-001',[0,1]));
  await report(['alice','bob'],'duel-rating-001',[0,1]);
  const duelProof=await prepare(['alice','bob'],'chess','duel-rating-001',[0,1]);
  await assertFails(setDoc(doc(a,'ratedMatches','duel-rating-001','checks','alice'),{base:duelProof.old,next:{...duelProof.next[0],r:duelProof.next[0].r+1000},updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(db('intruder'),'ratedMatches','duel-rating-001','checks','alice'),{base:duelProof.old,next:duelProof.next[0],updatedAt:serverTimestamp()}));
  await assertFails(batchResult(['alice','bob'],'chess','duel-rating-001',[0,1],{missing:true}));
  await assertFails(batchResult(['alice','bob'],'chess','duel-rating-001',[0,1],{tamper:true}));
  await assertSucceeds(batchResult(['alice','bob'],'chess','duel-rating-001',[0,1]));
  assert.ok((await getDoc(ref(a,'chess','alice'))).data().r>120000);
  assert.ok((await getDoc(ref(b,'chess','bob'))).data().r<120000);
  const history=(await getDoc(match(a,'duel-rating-001'))).data();assert.equal(history.changes[0].beforeR,120000);assert.equal(history.changes[0].afterR,(await getDoc(ref(a,'chess','alice'))).data().r);
  await assertFails(updateDoc(match(a,'duel-rating-001'),{status:'playing',settledAt:null}));
  await assertFails(updateDoc(ref(a,'chess','alice'),{games:2}));
  await assertFails(deleteDoc(match(a,'duel-rating-001')));
  console.log('Authenticated defaults, signed reports, atomic counterpart writes, fixed math and replay protection PASS');
  await make(['alpha','beta','gamma','delta'],'tochki','four-rating-001');
  await report(['alpha','beta','gamma','delta'],'four-rating-001',[0,1,2,3]);
  await assertSucceeds(batchResult(['alpha','beta','gamma','delta'],'tochki','four-rating-001',[0,1,2,3]));
  console.log('Four-player Glicko transaction remains within Firestore rules read/expression limits PASS');
  await make(['one','two','three'],'lava','three-draw-001');await report(['one','two','three'],'three-draw-001',[0,0,0]);await assertSucceeds(batchResult(['one','two','three'],'lava','three-draw-001',[0,0,0]));
  await make(['red','blue'],'go','disputed-rating-001');await assertSucceeds(updateDoc(match(db('red'),'disputed-rating-001'),{'reports.red':[0,1]}));await assertSucceeds(updateDoc(match(db('blue'),'disputed-rating-001'),{'reports.blue':[1,0]}));await assertFails(batchResult(['red','blue'],'go','disputed-rating-001',[0,1]));
  console.log('Unanimous three-player draw and disputed-result rejection PASS');
  await make(['alice','eve'],'chess','concurrent-game-a');await make(['alice','frank'],'chess','concurrent-game-b');
  await report(['alice','eve'],'concurrent-game-a',[0,1]);await report(['alice','frank'],'concurrent-game-b',[0,1]);
  const pa=await prepare(['alice','eve'],'chess','concurrent-game-a',[0,1]),pb=await prepare(['alice','frank'],'chess','concurrent-game-b',[0,1]);
  await assertSucceeds(batchResult(['alice','eve'],'chess','concurrent-game-a',[0,1],{prepared:pa}));
  await assertFails(batchResult(['alice','frank'],'chess','concurrent-game-b',[0,1],{prepared:pb}));
  await assertSucceeds(batchResult(['alice','frank'],'chess','concurrent-game-b',[0,1]));
  assert.equal((await getDoc(ref(a,'chess','alice'))).data().games,3);
  console.log('Concurrent matches reject a stale proof, then settle after fresh proof generation PASS');
  const varied=['alice','eve','frank','bob'];await make(varied,'chess','varied-four-rating');await report(varied,'varied-four-rating',[3,1,2,0]);await assertSucceeds(batchResult(varied,'chess','varied-four-rating',[3,1,2,0]));
  console.log('Four-player proofs also match JS rounding with unequal established ratings and deviations PASS');
  const cancelIds=['cancel-one','cancel-two'];for(const u of cancelIds)await setDoc(ref(db(u),'multi3',u),plain());
  await assertSucceeds(setDoc(match(db('cancel-one'),'cancel-waiting-game'),{v:1,pool:'multi3',players:cancelIds,names:['One','Two'],config:'',createdAt:serverTimestamp(),accepted:{'cancel-one':true,'cancel-two':false},reports:{},status:'waiting',settledAt:null,changes:[]}));
  await assertSucceeds(updateDoc(match(db('cancel-two'),'cancel-waiting-game'),{status:'cancelled'}));
  await assertFails(updateDoc(match(db('cancel-one'),'cancel-waiting-game'),{status:'playing','accepted.cancel-two':true}));
  await assertFails(updateDoc(match(db('one'),'three-draw-001'),{status:'cancelled'}));
  await assertFails(updateDoc(match(db('red'),'disputed-rating-001'),{status:'cancelled'}));
  console.log('Waiting matches can be cancelled without changing ratings; terminal states cannot reopen PASS');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
