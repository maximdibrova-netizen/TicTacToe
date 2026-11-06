import {auth,database} from '../account/firebase.js';
import {onAuthStateChanged} from 'firebase/auth';
import {RatingStore,RatedSession} from './store.js';
import View from './view-core.cjs';
const game=location.pathname.split('/').filter(Boolean).pop(),GE=window.GameEvents;
if(GE&&View.GAMES.some(([id])=>id===game)){
 const inRoom=!!window.IN_ROOM,$=id=>document.getElementById(id);let state=null,token=null,peers=new Map(),session=null,starting=false,opted=false,declined=false,received=null,store=null,lastUser=null,closedTokens=new Set(),resultSent=false;
 let preference=false;try{preference=localStorage.getItem('rated-'+game)==='true';}catch(_){}
 const card=document.createElement('div');card.className='card rating-setup';card.innerHTML='<h2>Рейтинг</h2><label class="rating-choice"><input type="checkbox" id="gameRated"><span>На рейтинг · онлайн с людьми</span></label><p class="rating-note" id="gameRatingNote">Начальный рейтинг 1200. У ботов — только ориентировочная сила.</p><a id="gameRatingLogin" href="../?signin=1&return='+encodeURIComponent(game)+'">Войти для рейтинга</a>';
 const menu=$('menu');if(menu&&!inRoom){const anchor=$('playBtn');let target=anchor;while(target&&target.parentElement!==menu&&!target.parentElement.matches('.col,.menu-col'))target=target.parentElement;if(target?.parentElement)target.before(card);else menu.appendChild(card);}
 const pill=document.createElement('div');pill.className='rating-pill';pill.hidden=true;document.body.appendChild(pill);
 const gate=document.createElement('div');gate.className='rating-gate';gate.hidden=true;gate.innerHTML='<div><strong id="gameRatingGateText"></strong><div><button type="button" id="gameRatingAccept" hidden>Играть на рейтинг</button> <button type="button" id="gameRatingCasual">Играть без рейтинга</button></div></div>';document.body.appendChild(gate);
 const toast=document.createElement('div');toast.className='rating-end-toast';toast.hidden=true;document.body.appendChild(toast);
 function say(text){pill.textContent=text;pill.hidden=!text||inRoom;}
 function showGate(text,invite=false){if(inRoom)return;$('gameRatingGateText').textContent=text;$('gameRatingAccept').hidden=!invite;$('gameRatingCasual').hidden=session?.data?.status==='playing'||session?.data?.status==='settled';gate.hidden=false;}
 function hideGate(){gate.hidden=true;}
 function policy(rated,ready=true){GE.configure({rated,ready,session:session?.id||null});}
 function me(){return auth.currentUser;}
 function activeStore(){const u=me(),db=database();if(!u||!db)return null;if(lastUser!==u.uid){store=new RatingStore(db,u);lastUser=u.uid;}return store;}
 function send(data){if(state?.token)GE.send({rating:1,token:state.token,...data});}
 function identity(){if(!state||state.mode!=='online'||!state.token)return;send({kind:'identity',uid:me()?.uid||null,name:me()?View.nickname(me()):'',seat:state.mine[0],rated:opted,declined,eligible:View.eligibility(state).ok});if(GE.role()==='host'&&session)session.announce();}
 async function casual(text){
  const old=session;
  if(old?.joining){try{await old.joining;}catch(_){}if(session!==old)return;}
  if(old?.data?.status==='playing'||old?.data?.status==='settled'){say('Рейтинговая партия уже началась');return;}
  if(old?.id){try{const result=await old.store.cancel(old.id);if(result?.status==='playing'||result?.status==='settled'){policy(true,true);hideGate();say('Рейтинговая партия уже началась');return;}}catch(_){say('Не удалось отменить заявку. Проверьте интернет.');return;}}
  old?.close();if(session===old)session=null;opted=false;declined=true;policy(false,true);hideGate();say(text||'Без рейтинга');identity();
 }
 $('gameRatingAccept').onclick=()=>{opted=true;declined=false;preference=true;try{localStorage.setItem('rated-'+game,'true');}catch(_){}policy(true,false);showGate('Подключаем рейтинговую партию…');identity();negotiate();};
 $('gameRatingCasual').onclick=()=>casual('Партия без изменения рейтинга');
 function changed(m,error){
  if(error){say('Рейтинг ожидает синхронизации');showGate('Не удалось подключить рейтинг. Проверьте интернет.');return;}
  if(m.status==='playing'||m.status==='settled'){policy(true,true);hideGate();say(m.status==='playing'?'Рейтинговая партия':'Рейтинг обновлён');}
  if(m.status==='waiting'){policy(true,false);showGate('Ждём подтверждения аккаунтов соперников…');}
  if(m.status==='cancelled'){casual('Рейтинговая заявка отменена');return;}
  if(m.status==='settled'){const i=m.players.indexOf(me()?.uid),c=m.changes?.[i];if(c){const delta=Math.round(c.afterR/100)-Math.round(c.beforeR/100);toast.textContent='Рейтинг '+(delta>=0?'+':'')+delta+' → '+Math.round(c.afterR/100);toast.hidden=false;}window.dispatchEvent(new CustomEvent('rating:updated'));}
  maybeReport();
 }
 function attachSession(){const s=activeStore();if(!s)return null;return new RatedSession(s,data=>send(data),changed);}
 function validDetails(d){return d&&d.token===state?.token&&d.pool===game&&Array.isArray(d.players)&&Array.isArray(d.seats)&&d.players.length===state.players.length&&new Set(d.players).size===d.players.length&&d.seats.length===d.players.length&&d.seats.every(x=>state.players.some(p=>p.id===x))&&d.players[d.seats.indexOf(state.mine[0])]===me()?.uid&&peers.get(String(d.seats[0]))?.uid===d.players[0]&&d.config===JSON.stringify({v:1,game,seats:d.seats});}
 async function negotiate(){
  if(inRoom||!state||!opted||!me()||!View.eligibility(state).ok||starting||session||closedTokens.has(state.token))return;
  if(GE.role()!=='host'){if(received&&validDetails(received)){starting=true;session=attachSession();if(!session){starting=false;casual('Облачный рейтинг недоступен');return;}try{await session.join(received);}catch(e){session.close();session=null;showGate('Не удалось подтвердить рейтинговую партию. Проверьте аккаунт и интернет.');}finally{starting=false;}}return;}
  const mine=state.mine[0],others=state.players.filter(p=>p.id!==mine),contacts=others.map(p=>peers.get(String(p.id)));
  if(contacts.some(p=>!p||!p.rated||!p.uid||!p.eligible)){showGate('Ждём согласия соперников на рейтинговую партию…');return;}
  const seats=[mine,...others.map(p=>p.id)],players=[me().uid,...contacts.map(p=>p.uid)];if(new Set(players).size!==players.length){casual('Для рейтинга нужны разные аккаунты');return;}
  starting=true;session=attachSession();if(!session){starting=false;casual('Облачный рейтинг недоступен');return;}
  const details={id:'s_'+state.token,pool:game,players,names:[View.nickname(me()),...contacts.map(p=>String(p.name||'Игрок').slice(0,32))],config:JSON.stringify({v:1,game,seats}),seats,token:state.token};
  try{await session.host(details);}catch(e){session.close();session=null;showGate('Не удалось создать рейтинговую партию. Проверьте подключение.');}finally{starting=false;}
 }
 function maybeReport(){if(!state?.result||!session?.details||resultSent)return;const seats=session.details.seats,ranks=View.ranksFromResult(seats,state.result);resultSent=true;session.submit(ranks);say('Результат подтверждается игроками…');}
 function onState(event){
  const e=event?.detail||event;if(!e)return;state=e;
  if(inRoom){return;}
  if(token!==e.token){if(session)session.close();session=null;starting=false;peers=new Map();received=null;token=e.token;opted=preference;declined=false;resultSent=false;toast.hidden=true;policy(false,true);}
  if(e.mode==='bot'){const level=Number(e.botLevel)||0,count=document.querySelectorAll('#levelSeg button').length||6,estimate=View.botEstimate(game,level,count);say('Бот '+estimate.label);hideGate();policy(false,true);return;}
  if(e.mode!=='online'){say('Без рейтинга');hideGate();policy(false,true);return;}
  if(!opted&&!session){say('Без рейтинга');return;}
  const eligible=View.eligibility(e);if(!eligible.ok){casual(eligible.reason);return;}
  if(!me()){casual('Для рейтинга нужен вход в аккаунт');return;}
  if(!session&&!starting&&e.version>0){closedTokens.add(e.token);casual('Рейтинг можно выбрать только до первого хода');return;}
  if(opted&&!session){policy(true,false);showGate('Подключаем аккаунты для рейтинговой партии…');identity();negotiate();}
  maybeReport();
 }
 window.addEventListener('game:state',onState);
 window.addEventListener('game:service',event=>{
  const d=event.detail?.data,from=event.detail?.from;if(!d?.rating||d.token!==state?.token||inRoom||state?.mode!=='online')return;
  if(d.kind==='identity'){
   const seat=from!==null&&from!==undefined?from:d.seat;if(!state.players.some(p=>p.id===seat)||state.mine.includes(seat)||seat!==d.seat)return;peers.set(String(seat),d);
   if(d.declined){casual('Соперник выбрал игру без рейтинга');return;}
   if(d.rated&&!opted&&!declined&&state.version===0&&me()&&View.eligibility(state).ok){policy(true,false);showGate('Соперник предлагает сыграть на рейтинг. Учитывается только эта партия.',true);}
   negotiate();
  }else if(d.kind==='session'&&opted){received=d;negotiate();}
 });
 async function accountChanged(){const user=me();if(!inRoom){$('gameRated').checked=preference;$('gameRated').disabled=!user;$('gameRatingLogin').hidden=!!user;if(user&&activeStore()){try{const value=await activeStore().current(game);$('gameRatingNote').textContent='Ваш рейтинг: '+Math.round(value.r/100)+(value.games<10?' · предварительный':'')+'. Боты не меняют основной рейтинг.';}catch(_){$('gameRatingNote').textContent='Облачный рейтинг недоступен. Можно играть без рейтинга.';}}}identity();}
 if(!inRoom)$('gameRated').onchange=()=>{preference=$('gameRated').checked;try{localStorage.setItem('rated-'+game,String(preference));}catch(_){}};
 onAuthStateChanged(auth,accountChanged);
 setInterval(()=>{if(!inRoom){const current=GE.current();if(current&&!state)onState(current);if(state?.mode==='online')identity();if(state&&$('game')?.hidden){hideGate();pill.hidden=true;}}},1000);
 if(GE.current())onState(GE.current());
}
