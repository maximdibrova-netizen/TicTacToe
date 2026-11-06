import {auth,database} from '../account/firebase.js';
import {onAuthStateChanged} from 'firebase/auth';
import {RatingStore,RatedSession} from './store.js';
import View from './view-core.cjs';
const $=id=>document.getElementById(id),ui=$('ratingDetails');
if(ui){
 let store=null,uid=null,session=null,currentInstance=null,starting=false,pendingSession=null,events=new Map(),tab='mine',preference=false,sessionResult=false,renderVersion=0;
 try{preference=localStorage.getItem('games-rated')==='true';}catch(_){}
 const context=()=>window.ROOM?.context?.(),user=()=>auth.currentUser;
 function cloud(){const u=user(),db=database();if(!u||!db)return null;if(uid!==u.uid){uid=u.uid;store=new RatingStore(db,u);}return store;}
 function status(text){$('ratingSessionStatus').textContent=text||'';}
 function applyPolicy(ready){const c=context();if(!c?.ranked)return;for(const s of c.slots)try{s.frame.contentWindow.GameEvents?.configure({rated:true,ready,session:session?.id||null});}catch(_){} }
 function sessionChanged(m,error){
  if(error){status('Результат ожидает синхронизации. Проверьте подключение.');return;}
  if(m.status==='playing'){status('Рейтинговая '+(context()?.multi?'связка':'партия')+' · игра началась');applyPolicy(true);}
  else if(m.status==='waiting'){status('Ждём подтверждения аккаунта друга…');applyPolicy(false);}
  else if(m.status==='settled'){applyPolicy(true);const i=m.players.indexOf(user()?.uid),r=m.changes?.[i];if(r){const delta=Math.round(r.afterR/100)-Math.round(r.beforeR/100);status('Рейтинг '+(delta>=0?'+':'')+delta+' → '+Math.round(r.afterR/100));}refreshRatings();}
  else if(m.status==='cancelled'){status('Рейтинговая заявка отменена.');applyPolicy(true);}
  if(window.ROOM?.setRatingContext)window.ROOM.setRatingContext({id:session?.id,status:m.status});
  reportResult();
 }
 function descriptor(c){const games=c.slots.map(s=>s.game),pool=c.multi?'multi'+games.length:games[0];return{id:'r_'+c.instance,pool,players:c.role==='host'?[user().uid,c.peerUid]:[c.peerUid,user().uid],names:c.role==='host'?[View.nickname(user()),String(c.peerName||'Игрок').slice(0,32)]:[String(c.peerName||'Игрок').slice(0,32),View.nickname(user())],config:JSON.stringify({v:1,mode:c.multi?'multi':'single',games}),instance:c.instance};}
 async function setup(){
  const c=context();if(!c||!c.instance||!c.ranked||!c.online||!c.peerUid||!user()||starting)return;
  if(currentInstance!==c.instance){session?.close();session=null;currentInstance=c.instance;events=new Map();sessionResult=false;pendingSession=null;}
  if(session){applyPolicy(session.data?.status==='playing'||session.data?.status==='settled');return;}
  const s=cloud();if(!s){status('Облачный рейтинг сейчас недоступен.');return;}
  const details=descriptor(c);starting=true;
  try{
   if(c.role==='host'){
    session=new RatedSession(s,d=>window.ROOM.sendService({rating:1,kind:'session',...d}),sessionChanged);await session.host(details);status('Подтверждаем рейтинговую партию…');
   }else if(pendingSession&&pendingSession.instance===c.instance){
    const d=pendingSession;if(d.pool!==details.pool||d.config!==details.config||d.players.join()!==details.players.join())throw Error('Неверный состав рейтинговой партии.');
    session=new RatedSession(s,()=>{},sessionChanged);await session.join(d);
   }
  }catch(e){session?.close();session=null;status('Не удалось подключить рейтинг. Проверьте аккаунты и интернет.');}finally{starting=false;}
 }
 function reportResult(){
  const c=context();if(!c?.ranked||!session||sessionResult||events.size<c.slots.length)return;
  const list=c.slots.map(s=>events.get(s.id));if(list.some(e=>!e?.result))return;
  if(list.some(e=>!View.eligibility(e).ok)){status('Рейтинг не учитывается: нужны стандартные партии без ботов и подсказок.');return;}
  let ranks;
  if(c.multi){const scores=list.map(e=>e.result.draw?.5:e.result.winners.includes(e.mine[0])?1:0),hostScores=c.role==='host'?scores:scores.map(x=>1-x),total=View.bundleScore(hostScores);if(!total)return;ranks=total.ranks;}
  else{const e=list[0],score=e.result.draw?.5:e.result.winners.includes(e.mine[0])?1:0,hostScore=c.role==='host'?score:1-score;ranks=hostScore===.5?[0,0]:hostScore===1?[0,1]:[1,0];}
  sessionResult=true;session.submit(ranks);status('Партия окончена. Подтверждаем результат и обновляем рейтинг…');
 }
 window.RatingUI={wantRated:()=>preference&&!!user(),checkInvite:()=>{const c=context();return !user()?{ok:false,reason:'Для рейтинга войдите в аккаунт.'}:!c?.peerUid?{ok:false,reason:'Другу тоже нужно войти в аккаунт.'}:c.peerUid===user().uid?{ok:false,reason:'Для рейтинга нужны два разных аккаунта.'}:{ok:true};}};
 window.addEventListener('room:changed',()=>{const c=context();if(!c?.ranked&&session){session.close();session=null;currentInstance=null;}setup();});
 window.addEventListener('room:service',event=>{const d=event.detail?.data,c=context();if(!d?.rating||!c?.ranked)return;if(d.kind==='session'&&c.role==='guest'&&d.instance===c.instance){pendingSession=d;setup();}});
 window.addEventListener('room:game-event',event=>{const{slot,event:e}=event.detail;if(!context()?.ranked)return;events.set(slot.id,e);const eligibility=View.eligibility(e);if(!eligibility.ok){status(eligibility.reason);applyPolicy(true);return;}setup();reportResult();});
 window.addEventListener('room:request-start',event=>{if(context()?.ranked&&session?.data?.status!=='playing'){event.preventDefault();status('Дождитесь подтверждения рейтинговой связки.');setup();}});
 $('ratingToggle').checked=preference;$('ratingToggle').onchange=()=>{preference=$('ratingToggle').checked;try{localStorage.setItem('games-rated',String(preference));}catch(_){}};
 function table(headers,rows){const t=document.createElement('table');t.className='rating-table';const head=t.createTHead().insertRow();headers.forEach(h=>{const c=document.createElement('th');c.textContent=h;head.appendChild(c);});const body=t.createTBody();rows.forEach(cells=>{const tr=body.insertRow();cells.forEach(value=>{const td=tr.insertCell();td.textContent=value;});});return t;}
 async function refreshRatings(){
  const u=user();$('ratingToggle').disabled=!u;$('ratingHelp').textContent=u?'В комнате выберите рейтинговую партию. Нужны разные аккаунты и игра без оценки/подсказок.':'Войдите в аккаунт. Рейтинг учитывается в онлайне между людьми; боты играют без изменения рейтинга.';
  if(!u){$('ratingSummary').textContent='Начальный рейтинг 1200 · отдельно для каждой игры';document.querySelectorAll('.rating-card-badge').forEach(x=>x.remove());return;}
  const s=cloud();if(!s)return;try{const values=await s.ratings();if(user()?.uid!==u.uid)return;$('ratingSummary').textContent='Ваш рейтинг · '+values.filter(r=>r.games>0).length+' игр с сыгранными партиями';for(const r of values){const a=document.querySelector('a.game[data-g="'+r.pool+'"] .tags');if(a){let badge=a.querySelector('.rating-card-badge');if(!badge){badge=document.createElement('span');badge.className='rating-card-badge';a.appendChild(badge);}badge.textContent='Рейтинг '+Math.round(r.r/100)+(r.games<10?'?':'');}}if($('ratingDialog').open&&tab==='mine')renderDialog();}catch(_){if(user()?.uid===u.uid)$('ratingSummary').textContent='Рейтинг загрузится, когда появится связь с облаком.';}
 }
 async function renderDialog(){
  const version=++renderVersion,box=$('ratingTable'),requestedUid=user()?.uid;box.textContent='Загружаем…';$('ratingPoolRow').hidden=tab!=='leaders';for(const id of ['Mine','Leaders','History'])$('rating'+id+'Tab').setAttribute('aria-pressed',String(tab===id.toLowerCase()));
  const s=cloud();if(!s){box.textContent='Войдите в аккаунт, чтобы видеть рейтинги и историю.';return;}
  try{let content;if(tab==='mine'){const ratings=await s.ratings();content=table(['Игра','Рейтинг','Партий','Побед'],ratings.map(r=>[View.GAMES.find(x=>x[0]===r.pool)[1],Math.round(r.r/100)+(r.games<10?'?':''),r.games,r.wins]));}else if(tab==='leaders'){const rows=await s.leaders($('ratingPool').value);content=rows.length?table(['Место','Игрок','Рейтинг','Партий'],rows.map((r,i)=>[i+1,r.name,Math.round(r.r/100)+(r.games<10?'?':''),r.games])):document.createTextNode('В этой игре ещё нет участников рейтинга.');}else{const history=await s.history();content=history.length?table(['Игра','Соперники','Изменение'],history.map(m=>{const i=m.players.indexOf(requestedUid),ch=m.changes[i],d=Math.round(ch.afterR/100)-Math.round(ch.beforeR/100);return[View.GAMES.find(x=>x[0]===m.pool)?.[1]||m.pool,m.names.filter((_,j)=>j!==i).join(', '),(d>=0?'+':'')+d+' → '+Math.round(ch.afterR/100)];})):document.createTextNode('Завершённых рейтинговых партий пока нет.');}if(version===renderVersion&&requestedUid===user()?.uid)box.replaceChildren(content);}catch(_){if(version===renderVersion&&requestedUid===user()?.uid)box.textContent='Не удалось загрузить данные. Проверьте интернет и повторите.';}
 }
 View.GAMES.forEach(([id,name])=>{const o=document.createElement('option');o.value=id;o.textContent=name;$('ratingPool').appendChild(o);});
 $('ratingDetails').onclick=()=>{if(!user()){window.GameAccount.signIn();return;}$('ratingDialog').showModal();renderDialog();};$('ratingClose').onclick=()=>$('ratingDialog').close();
 for(const which of ['Mine','Leaders','History'])$('rating'+which+'Tab').onclick=()=>{tab=which.toLowerCase();renderDialog();};$('ratingPool').onchange=renderDialog;
 onAuthStateChanged(auth,()=>{renderVersion++;store=null;uid=null;refreshRatings();if($('ratingDialog').open)renderDialog();setup();});window.addEventListener('rating:updated',refreshRatings);
 setInterval(()=>{if(session&&context()?.role==='host')session.announce();},1400);
}
