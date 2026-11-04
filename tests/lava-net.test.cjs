const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events');
const core=fs.readFileSync(require.resolve('../src/lava/core.js'),'utf8'),net=fs.readFileSync(require.resolve('../src/lava/net.js'),'utf8');
function harness(){
  const registry=new Map(),contexts=[],queue=[];let time=1000,serial=0;
  const later=f=>queue.push(f);
  class Conn extends EventEmitter{
    constructor(){super();this.open=false;this.sent=[];}
    send(d){this.sent.push(structuredClone(d));if(this.open&&this.other.open)later(()=>this.other.emit('data',structuredClone(d)));}
    close(){if(!this.open)return;this.open=false;this.other.open=false;this.emit('close');this.other.emit('close');}
  }
  class Peer extends EventEmitter{
    constructor(id){super();this.id=typeof id==='string'?id:'guest'+(++serial);this.connections=[];this.destroyed=false;registry.set(this.id,this);later(()=>{if(!this.destroyed)this.emit('open',this.id);});}
    connect(id){const a=new Conn(),b=new Conn();a.other=b;b.other=a;this.connections.push(a);later(()=>{const host=registry.get(id);if(!host){this.emit('error',{type:'peer-unavailable'});return;}host.connections.push(b);host.emit('connection',b);a.open=b.open=true;a.emit('open');b.emit('open');});return a;}
    destroy(){this.destroyed=true;registry.delete(this.id);this.connections.forEach(c=>c.close());}
    reconnect(){}
  }
  function client(){const storage=new Map(),intervals=[];const c=vm.createContext({window:{Peer},location:{search:''},URLSearchParams,crypto:{randomUUID:()=>`client-token-uuid-${++serial}`},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,clearTimeout:()=>{},setInterval:f=>intervals.push(f),Date:{now:()=>time},console});vm.runInContext(core+'\n'+net,c);c.tick=()=>intervals.forEach(f=>f());contexts.push(c);return c;}
  async function flush(){for(let round=0;round<6;round++){await Promise.resolve();while(queue.length)queue.shift()();}}
  return {client,flush,advance:n=>time+=n,close:()=>contexts.forEach(c=>c.LavaLink.close())};
}
test('four seats synchronize, reject foreign/stale moves, reconnect to the same seat and reject late strangers',async()=>{
  const h=harness(),host=h.client(),guests=[h.client(),h.client(),h.client()];let accepted=0;
  const handlers={change(){},move(dir,seat){const n=host.LavaLink.current();assert.equal(seat,n.state.turn);const next=host.Lava.apply(n.state,dir);if(next){accepted++;host.LavaLink.update(next);}}};
  try{
    host.LavaLink.host(4,handlers);await h.flush();const code=host.LavaLink.current().code;
    for(const guest of guests){guest.LavaLink.join(code,{change(){}});await h.flush();}
    assert.ok(host.LavaLink.ready());assert.deepEqual(guests.map(g=>g.LavaLink.current().seat),[1,2,3]);
    assert.ok(host.LavaLink.start(host.Lava.create(4)));await h.flush();
    for(const g of guests)assert.equal(JSON.stringify(g.LavaLink.current().state),JSON.stringify(host.LavaLink.current().state));
    // Out-of-turn guest cannot forge the host's seat.
    const conn=guests[0].LavaLink.current().conn;
    conn.send({t:'move',seat:0,dir:0,round:1,ply:0});await h.flush();assert.equal(accepted,0);
    host.LavaLink.act(0);await h.flush();assert.equal(accepted,1);
    guests[0].LavaLink.act(0);await h.flush();assert.equal(accepted,2);
    const replay=conn.sent.find(d=>d.t==='move'&&d.ply===1);conn.send(replay);await h.flush();assert.equal(accepted,2);
    // A live disconnected participant pauses moves; a stranger cannot steal the seat.
    guests[2].LavaLink.close();await h.flush();assert.equal(host.LavaLink.ready(),false);assert.equal(guests[1].LavaLink.act(0),false);
    const stranger=h.client();stranger.LavaLink.join(code,{change(){}});await h.flush();assert.match(stranger.LavaLink.current().error,/началась/);
    guests[2].LavaLink.join(code,{change(){}});await h.flush();assert.equal(guests[2].LavaLink.current().seat,3);assert.ok(host.LavaLink.ready());assert.equal(guests[2].LavaLink.current().state.ply,2);
    // A new round must not accept commands from the previous game, even with matching ply.
    host.LavaLink.start(host.Lava.create(4));await h.flush();host.LavaLink.act(0);await h.flush();const before=accepted;conn.send(replay);await h.flush();assert.equal(accepted,before);
    guests[0].LavaLink.act(0);await h.flush();assert.equal(accepted,before+1);
  }finally{h.close();}
});
test('a full lobby refuses extra participants and heartbeat loss pauses the host',async()=>{
  const h=harness(),host=h.client(),guest=h.client(),extra=h.client();
  try{host.LavaLink.host(2,{change(){},move(){}});await h.flush();const code=host.LavaLink.current().code;guest.LavaLink.join(code,{change(){}});await h.flush();extra.LavaLink.join(code,{change(){}});await h.flush();assert.match(extra.LavaLink.current().error,/заняты/);assert.ok(host.LavaLink.ready());host.LavaLink.start(host.Lava.create(2));await h.flush();h.advance(11000);host.tick();await h.flush();assert.equal(host.LavaLink.ready(),false);assert.equal(guest.LavaLink.ready(),false);}finally{h.close();}
});
test('same-seat duplicate tab cannot take over a connected player',async()=>{
  const h=harness(),host=h.client(),guest=h.client(),extra=h.client();try{host.LavaLink.host(2,{change(){},move(){}});await h.flush();const code=host.LavaLink.current().code;guest.LavaLink.join(code,{change(){}});await h.flush();const hello=guest.LavaLink.current().conn.sent.find(d=>d.t==='hello');extra.sessionStorage.setItem('lava-seat-'+code,hello.token);extra.LavaLink.join(code,{change(){}});await h.flush();assert.match(extra.LavaLink.current().error,/другой вкладке/);assert.ok(guest.LavaLink.ready());}finally{h.close();}
});
