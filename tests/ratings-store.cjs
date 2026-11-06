const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{require('esbuild').buildSync({entryPoints:['src/ratings/store.js'],outfile:'test-results/ratings-store-module.cjs',bundle:true,packages:'external',platform:'node',format:'cjs'});const{initializeTestEnvironment}=require('@firebase/rules-unit-testing'),{getDoc}=require('firebase/firestore'),{RatingStore,RatedSession}=require('../test-results/ratings-store-module.cjs');
 const env=await initializeTestEnvironment({projectId:'demo-rating-store',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
 try{await env.clearFirestore();const a=new RatingStore(env.authenticatedContext('alice').firestore(),{uid:'alice',displayName:'Alice'}),b=new RatingStore(env.authenticatedContext('bob').firestore(),{uid:'bob',displayName:'Bob'});
 await a.create({id:'waiting-cancel',pool:'go',players:['alice','bob'],names:['Alice','Bob'],config:'standard'});await b.ensure('go');assert.equal(typeof a.cancel,'function','waiting cancellation is implemented');await a.cancel('waiting-cancel');assert.equal((await getDoc(a.matchRef('waiting-cancel'))).data().status,'cancelled');await assert.rejects(()=>b.accept('waiting-cancel','go'),/отменена/);assert.equal((await a.current('go')).games,0);
 await a.create({id:'active-cannot-cancel',pool:'go',players:['alice','bob'],names:['Alice','Bob'],config:'standard'});await b.accept('active-cannot-cancel','go');assert.equal((await a.cancel('active-cannot-cancel')).status,'playing');assert.equal((await getDoc(a.matchRef('active-cannot-cancel'))).data().status,'playing');
 console.log('Waiting cancellation, late acceptance and active-match preservation PASS');
 function deferred(){let resolve;return{promise:new Promise(r=>resolve=r),resolve:()=>resolve()};}
 async function delayedJoin(id){
  const details={id,pool:'go',players:['alice','bob'],names:['Alice','Bob'],config:'standard'};await a.create(details);
  const entered=deferred(),release=deferred(),original=b.accept.bind(b);b.accept=async(...args)=>{entered.resolve();await release.promise;return original(...args);};
  const session=new RatedSession(b,()=>{},()=>{}),joined=session.join(details);await entered.promise;
  return{session,joined,release,restore:()=>{b.accept=original;}};
 }
 const cancelledJoin=await delayedJoin('close-during-join');
 try{
  assert.equal(cancelledJoin.session.id,'close-during-join','closing a joining session must know which waiting cloud match to cancel');
  const failed=cancelledJoin.joined.then(()=>null,e=>e);cancelledJoin.session.close();
  for(let i=0;i<100;i++){if((await getDoc(a.matchRef('close-during-join'))).data().status==='cancelled')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal((await getDoc(a.matchRef('close-during-join'))).data().status,'cancelled');cancelledJoin.release.resolve();assert.match(String(await failed),/отменена/);assert.equal(cancelledJoin.session.stop,null);assert.equal((await b.current('go')).games,0);
 }finally{cancelledJoin.release.resolve();await cancelledJoin.joined.catch(()=>{});cancelledJoin.session.close();cancelledJoin.restore();}
 const acceptedJoin=await delayedJoin('casual-during-join');
 try{
  assert.ok(acceptedJoin.session.joining instanceof Promise,'casual choice must be able to await an in-flight acceptance');
  let resolved=false;
  const casual=async()=>{await acceptedJoin.session.joining;const m=await b.cancel(acceptedJoin.session.id);if(m.status!=='playing'&&m.status!=='settled')acceptedJoin.session.close();resolved=true;return m;};
  const choosingCasual=casual();await Promise.resolve();assert.equal(resolved,false,'the casual choice stays gated while acceptance is pending');acceptedJoin.release.resolve();await acceptedJoin.joined;
  assert.equal((await choosingCasual).status,'playing');assert.equal(acceptedJoin.session.closed,false,'an accepted match keeps rated tracking');assert.ok(acceptedJoin.session.stop,'an accepted match retains its cloud listener');
 }finally{acceptedJoin.release.resolve();await acceptedJoin.joined.catch(()=>{});acceptedJoin.session.close();acceptedJoin.restore();}
 console.log('Closing a pending join cancels waiting state; acceptance winning a casual-choice race keeps rated tracking PASS');
 const ids=['alice','bob','carol','dave'],stores=[a,b,...ids.slice(2).map(uid=>new RatingStore(env.authenticatedContext(uid).firestore(),{uid,displayName:uid}))],failures=[];
 await Promise.all(stores.map(s=>s.ensure('tochki')));const started=Date.now();
 for(let round=0;round<3;round++){
  const id='four-concurrent-'+round;await a.create({id,pool:'tochki',players:ids,names:ids,config:'standard'});
  const accepts=await Promise.allSettled(stores.slice(1).map(s=>s.accept(id,'tochki')));
  accepts.forEach((r,i)=>{if(r.status==='rejected')failures.push({round,action:'accept',uid:ids[i+1],code:r.reason.code});});
  // Recover the fixture after collecting failures so the same run also proves
  // simultaneous result reports; recovery cannot make a failed assertion pass.
  for(let i=0;i<accepts.length;i++)if(accepts[i].status==='rejected')await stores[i+1].accept(id,'tochki');
  assert.equal((await getDoc(a.matchRef(id))).data().status,'playing');
  const reports=await Promise.allSettled(stores.map(s=>s.report(id,[0,1,2,3])));
  reports.forEach((r,i)=>{if(r.status==='rejected')failures.push({round,action:'report',uid:ids[i],code:r.reason.code});});
  for(let i=0;i<reports.length;i++)if(reports[i].status==='rejected')await stores[i].report(id,[0,1,2,3]);
  assert.equal(Object.keys((await getDoc(a.matchRef(id))).data().reports).length,4);
  await assert.rejects(()=>a.report(id,[1,0,2,3]),/различаются/);
 }
 assert.deepEqual(failures,[],'three concurrent guests and four simultaneous reports must all succeed without erasing another participant');
 const outsider=new RatingStore(env.authenticatedContext('outsider').firestore(),{uid:'outsider',displayName:'Outsider'});
 await assert.rejects(()=>outsider.accept('four-concurrent-0','tochki'),e=>e.code==='permission-denied');await assert.rejects(()=>outsider.report('four-concurrent-0',[0,1,2,3]),e=>e.code==='permission-denied');
 console.log('Three concurrent accepts and four concurrent reports remain lossless; cancellation, outsiders and contradictory reports stay rejected PASS ('+(Date.now()-started)+' ms for 3 rounds)');
 }finally{await env.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1;});
