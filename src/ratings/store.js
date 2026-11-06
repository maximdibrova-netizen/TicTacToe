import { doc,getDoc,getDocFromServer,getDocs,collection,query,where,orderBy,limit,setDoc,runTransaction,onSnapshot,serverTimestamp } from 'firebase/firestore';
import Glicko from './core.cjs';
import View from './view-core.cjs';
function sameMatch(before,after,uid){return before&&after&&before.pool===after.pool&&before.config===after.config&&Array.isArray(after.players)&&before.players.join()===after.players.join()&&after.players.includes(uid);}
export class RatingStore {
 constructor(db,user){this.db=db;this.user=user;this.ensured=new Map();}
 ratingRef(pool,uid=this.user.uid){return doc(this.db,'ratingPools',pool,'players',uid);}
 matchRef(id){return doc(this.db,'ratedMatches',id);}
 ensure(pool){
  if(!Glicko.validPool(pool))return Promise.reject(Error('Неизвестная игра.'));
  if(this.ensured.has(pool))return this.ensured.get(pool);
  const work=runTransaction(this.db,async tx=>{const r=this.ratingRef(pool),profile=doc(this.db,'ratingProfiles',this.user.uid),[old,p]=await Promise.all([tx.get(r),tx.get(profile)]),name=View.nickname(this.user);if(!old.exists())tx.set(r,{...Glicko.initial(),updatedAt:serverTimestamp()});if(!p.exists()||p.data().name!==name)tx.set(profile,{name,updatedAt:serverTimestamp()});return old.exists()?old.data():Glicko.initial();});
  this.ensured.set(pool,work);work.catch(()=>this.ensured.delete(pool));return work;
 }
 async create(details){
  await this.ensure(details.pool);
  const d={v:1,pool:details.pool,players:details.players,names:details.names,config:details.config,createdAt:serverTimestamp(),accepted:Object.fromEntries(details.players.map((u,i)=>[u,i===0])),reports:{},status:'waiting',settledAt:null,changes:[]};
  try{await setDoc(this.matchRef(details.id),d);}catch(e){const existing=await getDoc(this.matchRef(details.id));if(!existing.exists()||existing.data().config!==details.config||existing.data().players.join()!==details.players.join())throw e;}
 }
 async accept(id,pool){
  await this.ensure(pool);const ref=this.matchRef(id),uid=this.user.uid;
  for(let attempt=0;attempt<4;attempt++){
   let before=null;
   try{return await runTransaction(this.db,async tx=>{const s=await tx.get(ref);if(!s.exists())throw Error('Партия не найдена.');const m=s.data();before=m;if(!m.players.includes(uid))throw Error('Этот аккаунт не участвует в партии.');if(m.status==='cancelled')throw Error('Рейтинговая заявка отменена.');if(m.status!=='waiting'||m.accepted[uid])return;const accepted={...m.accepted,[uid]:true};tx.update(ref,{['accepted.'+uid]:true,status:m.players.every(u=>accepted[u])?'playing':'waiting'});});}
   catch(e){
    if(e.code!=='permission-denied'||!before||attempt===3)throw e;
    const snapshot=await getDocFromServer(ref).catch(()=>null),after=snapshot?.exists()?snapshot.data():null;
    if(!sameMatch(before,after,uid))throw e;
    if(after.status==='cancelled')throw Error('Рейтинговая заявка отменена.');
    // Rules may reject an outdated waiting→waiting status before Firestore
    // reports a transaction conflict. Retry only a verified consent advance.
    if(!['waiting','playing'].includes(after.status)||!after.players.some(u=>after.accepted[u]&&!before.accepted[u]))throw e;
    if(after.accepted[uid])return;
   }
  }
 }
 async cancel(id){return runTransaction(this.db,async tx=>{const ref=this.matchRef(id),s=await tx.get(ref);if(!s.exists())return null;const m=s.data();if(m.status==='waiting'){tx.update(ref,{status:'cancelled'});return{...m,status:'cancelled'};}return m;});}
 async report(id,ranks){
  const ref=this.matchRef(id),uid=this.user.uid;
  for(let attempt=0;attempt<4;attempt++){
   let before=null;
   try{return await runTransaction(this.db,async tx=>{const s=await tx.get(ref);if(!s.exists())return;const m=s.data();before=m;if(!m.players.includes(uid))throw Error('Этот аккаунт не участвует в партии.');if(m.reports[uid]){if(!Glicko.sameRanks(m.reports[uid],ranks))throw Error('Результаты игроков различаются.');return;}if(m.status!=='playing')throw Error('Партия ещё не началась.');tx.update(ref,{['reports.'+uid]:ranks});});}
   catch(e){
    if(e.code!=='permission-denied'||!before||attempt===3)throw e;
    const snapshot=await getDocFromServer(ref).catch(()=>null),after=snapshot?.exists()?snapshot.data():null;
    if(!sameMatch(before,after,uid)||!['playing','settled'].includes(after.status)||!after.players.some(u=>u in after.reports&&!(u in before.reports)))throw e;
    if(after.reports[uid]){if(!Glicko.sameRanks(after.reports[uid],ranks))throw Error('Результаты игроков различаются.');return;}
   }
  }
 }
 async settle(id){
  for(let attempt=0;attempt<4;attempt++){
   const snapshot=await getDoc(this.matchRef(id));if(!snapshot.exists())return;const m=snapshot.data();if(m.status==='settled')return m;
   if(m.status!=='playing'||!m.players.every(u=>Glicko.sameRanks(m.reports[u],m.reports[m.players[0]])))return;
   const refs=m.players.map(u=>this.ratingRef(m.pool,u)),base=(await Promise.all(refs.map(getDoc))).map(s=>s.data()),next=Glicko.settle(m.players,base,m.reports[m.players[0]],id);
   try{
    // Each proof is validated separately: this keeps 4-player Glicko inside the
    // Firestore expression budget. The final transaction still changes everyone atomically.
    await Promise.all(m.players.map((uid,i)=>setDoc(doc(this.db,'ratedMatches',id,'checks',uid),{base,next:next[i],updatedAt:serverTimestamp()})));
    return await runTransaction(this.db,async tx=>{const mr=this.matchRef(id),s=await tx.get(mr),current=s.data();if(current.status==='settled')return current;const fresh=(await Promise.all(refs.map(r=>tx.get(r)))).map(s=>s.data());if(fresh.some((r,i)=>r.lastMatch!==base[i].lastMatch||r.games!==base[i].games)){const e=Error('Concurrent rating changed');e.retryRating=true;throw e;}const changes=Glicko.changes(base,next);refs.forEach((r,i)=>tx.update(r,{...next[i],updatedAt:serverTimestamp()}));tx.update(mr,{status:'settled',settledAt:serverTimestamp(),changes});return{...current,status:'settled',changes};});
   }catch(e){const latest=await getDoc(this.matchRef(id));if(latest.exists()&&latest.data().status==='settled')return latest.data();if(attempt===3)throw e;}
  }
 }
 watch(id,fn,error){return onSnapshot(this.matchRef(id),{includeMetadataChanges:true},s=>{if(s.exists()&&!s.metadata.hasPendingWrites)fn(s.data());},error);}
 async current(pool){const s=await getDoc(this.ratingRef(pool));return s.exists()?s.data():Glicko.initial();}
 async ratings(){return Promise.all(View.GAMES.map(async([pool])=>{const s=await getDoc(this.ratingRef(pool));return{pool,...(s.exists()?s.data():Glicko.initial())};}));}
 async leaders(pool){const q=query(collection(this.db,'ratingPools',pool,'players'),orderBy('r','desc'),limit(20));const all=await getDocs(q);const rows=all.docs.map(x=>({uid:x.id,...x.data()}));await Promise.all(rows.map(async r=>{const p=await getDoc(doc(this.db,'ratingProfiles',r.uid));r.name=p.exists()?p.data().name:'Игрок';}));return rows;}
 async history(){const q=query(collection(this.db,'ratedMatches'),where('players','array-contains',this.user.uid),orderBy('settledAt','desc'),limit(20));return(await getDocs(q)).docs.map(s=>({id:s.id,...s.data()})).filter(m=>m.status==='settled');}
}
export class RatedSession {
 constructor(store,send,change){this.store=store;this.send=send;this.change=change;this.id=null;this.data=null;this.pending=null;this.reporting=false;this.settling=false;this.stop=null;this.settleTimer=null;this.closed=false;this.joining=null;}
 async host(details){this.details=details;await this.store.create(details);if(this.closed){await this.store.cancel(details.id);return;}this.bind(details.id);this.announce();}
 announce(){if(this.details)this.send({kind:'session',...this.details});}
 join(details){if(this.id===details.id)return this.joining||Promise.resolve();this.joining=(async()=>{const snap=await getDoc(this.store.matchRef(details.id));if(!snap.exists())throw Error('Рейтинговая партия не найдена.');const m=snap.data();if(m.pool!==details.pool||m.config!==details.config||m.players.join()!==details.players.join()||!m.players.includes(this.store.user.uid))throw Error('Участники или настройки партии не совпадают.');this.details=details;this.id=details.id;if(this.closed){await this.store.cancel(details.id);return;}await this.store.accept(details.id,details.pool);this.bind(details.id);})();return this.joining;}
 bind(id){if(this.closed)return;if(this.stop)this.stop();this.id=id;this.stop=this.store.watch(id,m=>{this.data=m;this.change(m);if(m.status!=='playing'){clearTimeout(this.settleTimer);this.settleTimer=null;}if(m.status==='playing'){if(this.pending)this.submit(this.pending);if(m.players.every(u=>Glicko.sameRanks(m.reports[u],m.reports[m.players[0]]))&&!this.settling&&!this.settleTimer){const delay=Math.max(0,m.players.indexOf(this.store.user.uid))*1500;this.settleTimer=setTimeout(()=>{this.settleTimer=null;if(this.closed||this.data?.status!=='playing')return;this.settling=true;this.store.settle(id).catch(e=>this.change(null,e)).finally(()=>{this.settling=false;});},delay);}}},e=>this.change(null,e));}
 submit(ranks){this.pending=ranks;if(!this.id||this.data?.status!=='playing'||this.reporting)return;this.reporting=true;this.store.report(this.id,ranks).catch(e=>this.change(null,e)).finally(()=>{this.reporting=false;});}
 close(){this.closed=true;clearTimeout(this.settleTimer);if(this.stop)this.stop();this.stop=null;if(this.id&&!['playing','settled'].includes(this.data?.status))this.store.cancel(this.id).catch(()=>{});}
}
