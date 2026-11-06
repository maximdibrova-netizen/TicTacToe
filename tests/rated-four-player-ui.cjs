// Four real Auth accounts, three native PeerJS guest links and Firestore settlement.
// Requires Auth9099 + Firestore8080 emulators for project demo-mdgames.
const {chromium}=require('playwright'),{PeerServer}=require('peer');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),authPort=process.env.AUTH_EMULATOR_PORT||9099,firestorePort=process.env.FIRESTORE_EMULATOR_PORT||8080;
function decode(v){if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('nullValue'in v)return null;if('booleanValue'in v)return v.booleanValue;return v.stringValue??v.timestampValue;}
async function eventual(read,accept,message){let value;for(let i=0;i<120;i++){value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}assert.fail(message+'; last value='+JSON.stringify(value));}
(async()=>{
 const server=http.createServer((req,res)=>{const rel=req.url.split('?')[0];let file=path.join(root,rel==='/peerjs.min.js'?'node_modules/peerjs/dist/peerjs.min.js':rel);if(rel.endsWith('/'))file+='index.html';fs.readFile(file,(error,body)=>{res.statusCode=error?404:200;res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript');res.end(error?'':body);});}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));let peerHttp;PeerServer({port:9016,path:'/'},value=>{peerHttp=value;});
 const base='http://127.0.0.1:'+server.address().port,query='authEmulator='+authPort+'&firestoreEmulator='+firestorePort+'&peer=127.0.0.1:9016&peerlib='+base+'/peerjs.min.js';
 const browser=await chromium.launch({channel:'msedge',headless:true}),pages=[],errors=[],stamp=Date.now();
 async function account(index){
  const page=await browser.newPage({viewport:{width:1280,height:900}});pages[index]=page;page.setDefaultTimeout(18000);
  page.on('pageerror',error=>errors.push(index+': '+error.message));
  await page.addInitScript(()=>{window.lifecycle=[];addEventListener('game:state',event=>lifecycle.push(event.detail));});
  await page.goto(base+'/?'+query);await page.locator('#accountOpen').click();await page.locator('#accountRegisterTab').click();
  await page.locator('#accountName').fill('Четверо '+index);await page.locator('#accountEmail').fill('four-'+stamp+'-'+index+'@example.com');await page.locator('#accountPassword').fill('testing-four-123');await page.locator('#accountSubmit').click();
  await page.locator('#accountDialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!!GameAccount.currentUser()?.uid);return page;
 }
 async function cloud(page,relative,absence=false){
  const token=absence?'owner':await page.evaluate(()=>GameAccount.currentUser().getIdToken());
  const response=await fetch('http://127.0.0.1:'+firestorePort+'/v1/projects/demo-mdgames/databases/(default)/documents/'+relative,{headers:{Authorization:'Bearer '+token}});
  if(response.status===404)return null;assert.equal(response.status,200,'real account can read '+relative);
  const json=await response.json();return Object.fromEntries(Object.entries(json.fields||{}).map(([key,value])=>[key,decode(value)]));
 }
 try{
  await Promise.all([0,1,2,3].map(account));const host=pages[0],guests=pages.slice(1),uids=await Promise.all(pages.map(page=>page.evaluate(()=>GameAccount.currentUser().uid)));assert.equal(new Set(uids).size,4);
  await host.evaluate(()=>{
   localStorage.setItem('bgc-tochki',JSON.stringify({kinds:['human','net','net','net'],map:'big',level:0,first:'me',sound:false,evalOn:false,coords:false,cw:7,ch:7}));
   localStorage.setItem('clock-tochki',JSON.stringify({v:2,enabled:false}));
  });
  await host.goto(base+'/tochki/?'+query);await host.locator('#gameRated').check();await host.locator('#onCreate').click();await host.waitForFunction(()=>document.querySelector('#lbCode').textContent.length===5);
  const code=(await host.locator('#lbCode').textContent()).trim();
  await Promise.all(guests.map((page,index)=>page.goto(base+'/tochki/?'+query+'&join='+index+'#'+code)));
  await host.waitForFunction(()=>!document.querySelector('#lbStart').disabled);await host.locator('#lbStart').click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>GameEvents.current()?.players.length===4&&GameEvents.current()?.token)));
  const states=await Promise.all(pages.map(page=>page.evaluate(()=>GameEvents.current()))),token=states[0].token,id='s_'+token;
  assert.equal(states[0].mine[0],0,'host controls seat zero');assert.equal(states[0].turn,0,'human host starts');assert.equal(new Set(states.map(e=>e.mine[0])).size,4);
  for(const state of states){assert.equal(state.mode,'online');assert.equal(state.token,token);assert.equal(state.players.length,4);assert.equal(state.evaluationEnabled,false);assert.equal(state.continued,false);assert.ok(state.players.every(player=>player.kind!=='bot'));}
  for(const guest of guests){await guest.locator('#gameRatingAccept').waitFor();assert.equal(await guest.locator('#gameRated').isChecked(),false,'each guest must explicitly opt in');assert.match(await guest.locator('#gameRatingGateText').textContent(),/предлагает сыграть на рейтинг/);}
  for(const guest of guests.slice(0,2))await guest.locator('#gameRatingAccept').click();
  assert.equal(await cloud(host,'ratedMatches/'+id,true),null,'first two guest confirmations cannot create a four-player match');
  for(const page of pages)assert.equal(await page.evaluate(()=>GameEvents.waiting()),true,'all four wait for final consent');
  await guests[2].locator('#gameRatingAccept').click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>GameEvents.policy().rated&&!GameEvents.waiting())));
  const started=await eventual(()=>cloud(host,'ratedMatches/'+id),value=>value?.status==='playing','all four account acceptances open the ranked match');
  const bySeat=Object.fromEntries(states.map((state,index)=>[state.mine[0],uids[index]]));
  assert.deepEqual(started.players,[0,1,2,3].map(seat=>bySeat[seat]));assert.equal(started.pool,'tochki');assert.deepEqual(started.accepted,Object.fromEntries(uids.map(uid=>[uid,true])));assert.deepEqual(started.reports,{});
  for(const uid of uids)assert.equal((await cloud(host,'ratingPools/tochki/players/'+uid)).games,0);
  console.log('Four real accounts and three guest links explicitly accept one ranked Dots game PASS');

  await host.locator('#surrenderBtn').click();await host.locator('#matchYes').click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>GameEvents.current()?.version===1)));
  for(const page of pages){const state=await page.evaluate(()=>GameEvents.current());assert.equal(state.over,false,'one resignation does not end four-player Dots');assert.equal(state.result,null);assert.equal(state.players.length,4,'rating roster remains frozen');assert.equal(await page.evaluate(()=>lifecycle.filter(e=>e.phase==='result').length),0);}
  const partial=await cloud(host,'ratedMatches/'+id);assert.equal(partial.status,'playing');assert.deepEqual(partial.reports,{});
  for(const uid of uids)assert.equal((await cloud(host,'ratingPools/tochki/players/'+uid)).games,0,'partial elimination cannot settle any participant');
  await guests[0].locator('#offerDrawBtn').click();
  for(const guest of guests.slice(1)){await guest.locator('#matchYes').waitFor();await guest.locator('#matchYes').click();}
  await Promise.all(pages.map(page=>page.waitForFunction(()=>GameEvents.current()?.result?.draw)));
  for(const page of pages){const state=await page.evaluate(()=>GameEvents.current());assert.deepEqual(state.result.eliminated,[0],'seat zero remains an eliminated player after a later draw');assert.equal(state.result.reason,'agreement');assert.equal(state.score,state.mine[0]===0?0:.5);}
  const completed=await eventual(()=>cloud(host,'ratedMatches/'+id),value=>value?.status==='settled','all four reports atomically settle elimination plus survivor draw');
  assert.deepEqual(completed.reports,Object.fromEntries(uids.map(uid=>[uid,[1,0,0,0]])));assert.equal(completed.changes.length,4);
  const snapshots=[];
  for(let i=0;i<pages.length;i++){
   const rating=await cloud(pages[i],'ratingPools/tochki/players/'+uids[i]);snapshots.push(rating);assert.equal(rating.games,1);assert.equal(rating.lastMatch,id);assert.ok(rating.rd<35000);
   if(i===0){assert.ok(rating.r<120000);assert.equal(rating.losses,1);}else{assert.ok(rating.r>120000);assert.equal(rating.wins,1);}
   assert.equal(await pages[i].evaluate(()=>lifecycle.filter(e=>e.phase==='result').length),1,'one terminal result for every account');
  }
  assert.equal(new Set(snapshots.slice(1).map(rating=>rating.r)).size,1,'tied survivors receive equal changes from equal starting ratings');
  await host.waitForTimeout(2000);
  for(let i=0;i<pages.length;i++)assert.deepEqual(await cloud(pages[i],'ratingPools/tochki/players/'+uids[i]),snapshots[i],'broadcast retries cannot apply the match twice');
  assert.deepEqual(errors,[]);console.log('Host elimination stays unrated until survivor draw; four ratings settle atomically once PASS');
 }catch(error){
  console.error('Four-player diagnostics:',JSON.stringify(await Promise.all(pages.map(page=>page.evaluate(()=>({state:window.GameEvents?.current(),policy:window.GameEvents?.policy(),gate:document.querySelector('#gameRatingGateText')?.textContent,lobby:document.querySelector('#lbText')?.textContent})).catch(()=>null)))));throw error;
 }finally{await browser.close();server.close();peerHttp?.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
