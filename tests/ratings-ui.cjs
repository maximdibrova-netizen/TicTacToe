// Real Firebase SDK, Auth/Firestore emulators and native standalone PeerJS games.
// Start emulators with --project demo-mdgames before running this test.
const {chromium}=require('playwright'),{PeerServer}=require('peer');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const authPort=process.env.AUTH_EMULATOR_PORT||9099,firestorePort=process.env.FIRESTORE_EMULATOR_PORT||8080,peerPort=9015;
function decode(v){
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return v.doubleValue;
 if('nullValue'in v)return null;
 if('booleanValue'in v)return v.booleanValue;
 return v.stringValue??v.timestampValue;
}
async function eventually(read,accept,message){
 let value;
 for(let i=0;i<100;i++){value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,100));}
 assert.fail(message+'; last value='+JSON.stringify(value));
}
(async()=>{
 const server=http.createServer((req,res)=>{
  const rel=req.url.split('?')[0];let file=path.join(root,rel==='/peerjs.min.js'?'node_modules/peerjs/dist/peerjs.min.js':rel);
  if(rel.endsWith('/'))file+='index.html';
  fs.readFile(file,(error,body)=>{res.statusCode=error?404:200;res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript');res.end(error?'':body);});
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 let peerHttp;PeerServer({port:peerPort,path:'/'},value=>{peerHttp=value;});const base='http://127.0.0.1:'+server.address().port;
 const query='authEmulator='+authPort+'&firestoreEmulator='+firestorePort+'&peer=127.0.0.1:'+peerPort+'&peerlib='+base+'/peerjs.min.js';
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],stamp=Date.now();
 let round=0;
 async function player(name,suffix){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(16000);
  page.on('pageerror',error=>errors.push(suffix+': '+error.message));
  await page.addInitScript(()=>{window.lifecycle=[];addEventListener('game:state',event=>lifecycle.push(event.detail));});
  await page.goto(base+'/?'+query);await page.locator('#accountOpen').click();await page.locator('#accountRegisterTab').click();
  await page.locator('#accountName').fill(name);await page.locator('#accountEmail').fill('standalone-'+stamp+'-'+suffix+'@example.com');
  await page.locator('#accountPassword').fill('testing-ranked-123');await page.locator('#accountSubmit').click();
  await page.locator('#accountDialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!!window.GameAccount?.currentUser()?.uid);
  return page;
 }
 async function cloud(page,relative,admin=false){
  // Missing private documents cannot be read with player rules; use the emulator-only
  // owner token solely for absence checks. All existing documents use the real user.
  const token=admin?'owner':await page.evaluate(()=>GameAccount.currentUser().getIdToken());
  const response=await fetch('http://127.0.0.1:'+firestorePort+'/v1/projects/demo-mdgames/databases/(default)/documents/'+relative,{headers:{Authorization:'Bearer '+token}});
  if(response.status===404)return null;
  assert.equal(response.status,200,'authorized emulator document read: '+relative);
  const json=await response.json();return Object.fromEntries(Object.entries(json.fields||{}).map(([key,value])=>[key,decode(value)]));
 }
 async function ranked(host,guest){
  round++;
  // The guest has no stored ranked preference: accepting the invitation is explicit.
  await guest.evaluate(()=>localStorage.setItem('rated-falling4','false'));
  await host.goto(base+'/falling4/?'+query+'&round='+round);await host.waitForFunction(()=>!!GameAccount.currentUser());
  await host.locator('#gameRated').check();await host.locator('#m-net').click();await host.locator('#netCreate').click();
  await host.waitForFunction(()=>document.querySelector('#lbCode').textContent.length===5);
  const code=(await host.locator('#lbCode').textContent()).trim();
  await guest.goto(base+'/falling4/?'+query+'&round='+round+'&join=1#'+code);
  await host.locator('#surrenderBtn').waitFor();await guest.locator('#surrenderBtn').waitFor();
  await guest.locator('#gameRatingAccept').waitFor();
  assert.match(await guest.locator('#gameRatingGateText').textContent(),/предлагает сыграть на рейтинг/);
  assert.equal(await guest.locator('#gameRated').isChecked(),false,'incoming invitation is not silently accepted');
  await host.waitForFunction(()=>GameEvents.waiting());await guest.waitForFunction(()=>GameEvents.waiting());
  const id='s_'+await host.evaluate(()=>GameEvents.current().token);
  assert.equal(await guest.evaluate(()=>GameEvents.current().token),id.slice(2),'shared native match token');
  assert.equal(await cloud(host,'ratedMatches/'+id,true),null,'cloud match is not created before the other human opts in');
  const held=await host.locator('.gc-face strong').first().textContent();
  await host.waitForTimeout(1150);
  assert.equal(await host.locator('.gc-face strong').first().textContent(),held,'ranked invitation does not charge the host clock');
  await host.locator('#board [data-col="0"]').first().click({force:true});
  assert.equal(await host.locator('[data-disc]').count(),0,'board cannot move before rating acceptance');
  await guest.locator('#gameRatingAccept').click();
  await host.waitForFunction(()=>GameEvents.policy().rated&&!GameEvents.waiting());
  await guest.waitForFunction(()=>GameEvents.policy().rated&&!GameEvents.waiting());
  const match=await eventually(()=>cloud(host,'ratedMatches/'+id),value=>value?.status==='playing','both accounts accept the cloud match');
  assert.equal(match.pool,'falling4');assert.equal(Object.values(match.accepted).every(Boolean),true);
  assert.deepEqual(match.reports,{});assert.equal(match.players.length,2);assert.equal(new Set(match.players).size,2);
  const running=await host.locator('.gc-face strong').first().textContent();
  await host.waitForTimeout(1100);
  assert.notEqual(await host.locator('.gc-face strong').first().textContent(),running,'clock resumes after cloud acceptance');
  return id;
 }
 async function settled(host,guest,id,games,draw){
  const match=await eventually(()=>cloud(host,'ratedMatches/'+id),value=>value?.status==='settled','both native outcomes settle the cloud match');
  assert.equal(match.changes.length,2);assert.equal(Object.keys(match.reports).length,2);
  const ratings=[];
  for(const page of [host,guest]){
   const uid=await page.evaluate(()=>GameAccount.currentUser().uid),rating=await cloud(page,'ratingPools/falling4/players/'+uid);
   ratings.push(rating);assert.equal(rating.games,games);assert.equal(rating.lastMatch,id);
   await page.locator('.rating-end-toast').waitFor();assert.match(await page.locator('.rating-end-toast').textContent(),/Рейтинг [+-]\d+/);
   assert.equal(await page.evaluate(()=>lifecycle.filter(e=>e.phase==='result').length),1,'one native outcome event');
  }
  if(!draw){assert.ok(ratings[0].r<120000,'resigning host loses rating');assert.ok(ratings[1].r>120000,'winning guest gains rating');}
  else for(const rating of ratings)assert.equal(rating.draws,1);
  await host.waitForTimeout(1700);
  for(const page of [host,guest]){const uid=await page.evaluate(()=>GameAccount.currentUser().uid);assert.equal((await cloud(page,'ratingPools/falling4/players/'+uid)).games,games,'identity retransmissions cannot settle twice');}
  return ratings;
 }
 async function history(page,count){
  await page.goto(base+'/?'+query);await page.locator('#ratingDetails').click();await page.locator('#ratingHistoryTab').click();
  await eventually(()=>page.locator('#ratingTable tbody tr').count(),value=>value===count,'signed history contains each ranked match once');
  assert.match(await page.locator('#ratingTable').textContent(),/Четыре в ряд/);
  await page.locator('#ratingClose').click();
 }
 try{
  const host=await player('Рейтинг хозяин','host'),guest=await player('Рейтинг друг','guest');
  const hostUid=await host.evaluate(()=>GameAccount.currentUser().uid),guestUid=await guest.evaluate(()=>GameAccount.currentUser().uid);assert.notEqual(hostUid,guestUid);
  await host.evaluate(()=>localStorage.setItem('clock-falling4',JSON.stringify({v:2,enabled:true,preset:'custom',min:.5,inc:0,per:false,pmin:[.5,.5],pinc:[0,0]})));
  let id=await ranked(host,guest);
  await host.locator('#surrenderBtn').click();await host.locator('#matchYes').click();
  await settled(host,guest,id,1,false);console.log('Real signed standalone ranked invitation, held clocks and once-only resignation settlement PASS');
  id=await ranked(host,guest);await guest.locator('#offerDrawBtn').click();await host.locator('#matchYes').click();
  const before=await settled(host,guest,id,2,true);
  await history(host,2);await history(guest,2);console.log('Second ranked draw updates both accounts and signed histories exactly once PASS');
  await host.goto(base+'/falling4/?'+query+'&bot=1');await host.locator('#m-bot').click();await host.locator('#playBtn').click();await host.locator('#surrenderBtn').waitFor();
  await host.waitForFunction(()=>GameEvents.current()?.mode==='bot');
  assert.match(await host.locator('.rating-pill').textContent(),/Бот ≈\d+/);assert.equal(await host.evaluate(()=>GameEvents.policy().rated),false);
  const botToken=await host.evaluate(()=>GameEvents.current().token);await host.locator('#offerDrawBtn').click();
  await host.waitForFunction(()=>GameEvents.current()?.result?.draw);await host.waitForTimeout(1100);
  assert.equal(await cloud(host,'ratedMatches/s_'+botToken,true),null,'bot game never creates a ranked cloud match');
  const after=await cloud(host,'ratingPools/falling4/players/'+hostUid);assert.deepEqual(after,before[0],'bot result leaves every human rating field unchanged');
  await history(host,2);assert.deepEqual(errors,[]);console.log('Bot strength is approximate; bot results do not alter human ratings or history PASS');
 }finally{await browser.close();server.close();peerHttp?.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
