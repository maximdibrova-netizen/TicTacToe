// Small 2–4 player PeerJS lobby. The host owns the board and validates moves.
// Uses the existing room's Peer shim when embedded in the two-person hub.
var LavaLink = (function () {
  'use strict';
  var session=null, loading=null, PREFIX='games-lava-v1-', ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function code(){var s='';for(var i=0;i<5;i++)s+=ABC[Math.floor(Math.random()*ABC.length)];return s;}
  function clean(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);}
  function options(){var h=new URLSearchParams(location.search).get('peer');if(!h)return {debug:1};var p=h.split(':');return {host:p[0],port:+p[1]||9000,path:'/',secure:false,debug:1};}
  function load(){
    if(window.Peer)return Promise.resolve();if(loading)return loading;
    var custom=new URLSearchParams(location.search).get('peerlib');
    var urls=(custom?[custom]:[]).concat(['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js','https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js']);
    loading=new Promise(function(resolve,reject){function next(){if(!urls.length){loading=null;reject(new Error('Связь не загрузилась. Проверь интернет.'));return;}var el=document.createElement('script'),timer=setTimeout(failed,10000),done=false;function failed(){if(done)return;done=true;clearTimeout(timer);el.remove();next();}el.src=urls.shift();el.onerror=failed;el.onload=function(){if(done)return;if(!window.Peer){failed();return;}done=true;clearTimeout(timer);resolve();};document.head.appendChild(el);}next();});return loading;
  }
  function token(c){var key='lava-seat-'+c,t;try{t=sessionStorage.getItem(key);}catch(e){}if(!t){t=typeof crypto.randomUUID==='function'?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);try{sessionStorage.setItem(key,t);}catch(e){}}return t;}
  function send(conn,d){try{if(conn&&conn.open){conn.send(d);return true;}}catch(e){}return false;}
  function notify(n){if(session===n)n.handlers.change(n);}
  function online(n){return Array.from({length:n.count},function(_,i){return i===0 || !!(n.seats[i]&&n.seats[i].online);});}
  function packet(n,seat){return {t:'state',count:n.count,seat:seat,online:online(n),round:n.round,state:n.state};}
  function publish(n){n.online=online(n);n.seats.forEach(function(s,i){if(s&&s.online)send(s.conn,packet(n,i));});notify(n);}
  function drop(n,conn){var s=n.seats.find(function(s){return s&&s.conn===conn;});if(s&&s.online){s.online=false;publish(n);}}
  function hostData(n,conn,d){
    if(session!==n||!d||typeof d!=='object')return;
    if(d.t==='hello'){
      if(typeof d.token!=='string'||d.token.length<16||d.token.length>100)return;
      var i=n.seats.findIndex(function(s){return s&&s.token===d.token;});
      if(i>=0 && n.seats[i].online && n.seats[i].conn!==conn){send(conn,{t:'error',message:'Это место уже открыто в другой вкладке.'});return;}
      if(i<0 && !n.state){for(var j=1;j<n.count;j++)if(!n.seats[j]||!n.seats[j].online){i=j;break;}}
      if(i<1){send(conn,{t:'error',message:n.state?'Партия уже началась.':'Все места заняты.'});return;}
      var old=n.seats[i];n.seats[i]={conn:conn,token:d.token,online:true,seen:Date.now()};
      if(old&&old.conn!==conn)try{old.conn.close();}catch(e){}
      publish(n);return;
    }
    var seat=n.seats.findIndex(function(s){return s&&s.online&&s.conn===conn;});if(seat<1)return;
    n.seats[seat].seen=Date.now();
    if(d.t==='pong')return;
    if(d.t==='move' && n.state && !n.state.over && d.round===n.round && d.ply===n.state.ply && seat===n.state.turn && ready())n.handlers.move(d.dir,seat);
    // Also acknowledges rejected/stale requests with the authoritative state.
    if(d.t==='move'||d.t==='sync')send(conn,packet(n,seat));
  }
  function wireHost(n,conn){conn.on('data',function(d){hostData(n,conn,d);});conn.on('close',function(){if(session===n)drop(n,conn);});conn.on('error',function(){if(session===n)drop(n,conn);});}
  function peerEvents(n,p){
    p.on('disconnected',function(){setTimeout(function(){if(session===n&&!p.destroyed)try{p.reconnect();}catch(e){}},1500);});
    p.on('error',function(e){if(session!==n)return;if(n.role==='host'&&e.type==='unavailable-id'&&!n.ready&&n.tries++<3){p.destroy();n.code=code();openHost(n);return;}if(n.role==='host'&&n.ready)return;n.error=e.type==='peer-unavailable'?'Игра не найдена. Проверь код и убедись, что хозяин открыл игру.':'Не удалось подключиться. Проверь интернет или попробуй другую сеть.';notify(n);});
  }
  function openHost(n){var p=n.peer=new window.Peer(PREFIX+n.code,options());peerEvents(n,p);p.on('open',function(){if(session!==n)return;n.ready=true;n.error='';publish(n);});p.on('connection',function(c){if(session===n)wireHost(n,c);});}
  function host(count,handlers){
    close();var n=session={role:'host',code:code(),count:count,seat:0,seats:[],online:[],round:0,state:null,ready:false,error:'',tries:0,handlers:handlers};notify(n);
    load().then(function(){if(session===n)openHost(n);}).catch(function(e){if(session===n){n.error=e.message;notify(n);}});return n;
  }
  function join(c,handlers){
    close();var n=session={role:'guest',code:clean(c),count:0,seat:-1,online:[],state:null,round:0,ready:false,error:'',handlers:handlers};notify(n);
    load().then(function(){if(session!==n)return;var p=n.peer=new window.Peer(options());peerEvents(n,p);p.on('open',function(){
      if(session!==n)return;var conn=n.conn=p.connect(PREFIX+n.code,{reliable:true,serialization:'json'});
      var timer=setTimeout(function(){if(session===n&&!n.ready){n.error='Нет прямого соединения. Попробуй снова или используй другую сеть.';notify(n);}},15000);n.timer=timer;
      conn.on('open',function(){if(session===n){n.seen=Date.now();send(conn,{t:'hello',token:token(n.code)});}});
      conn.on('data',function(d){
        if(session!==n||!d||typeof d!=='object')return;n.seen=Date.now();
        if(d.t==='ping'){send(conn,{t:'pong'});return;}
        if(d.t==='error'){n.error=d.message;n.ready=false;clearTimeout(timer);notify(n);return;}
        if(d.t==='state' && Number.isInteger(d.count)&&d.count>=2&&d.count<=4 && Number.isInteger(d.seat)&&d.seat>=1&&d.seat<d.count && Array.isArray(d.online)&&d.online.length===d.count && Number.isInteger(d.round) && (d.state===null || (Lava.valid(d.state)&&d.state.players.length===d.count))){
          clearTimeout(timer);n.ready=true;n.error='';n.count=d.count;n.seat=d.seat;n.online=d.online;n.round=d.round;n.state=d.state;notify(n);
        }
      });
      function lost(){if(session===n){n.ready=false;n.error='Связь с хозяином потеряна. Вернись в игру по тому же коду.';notify(n);}}
      conn.on('close',lost);conn.on('error',lost);
    });}).catch(function(e){if(session===n){n.error=e.message;notify(n);}});return n;
  }
  function ready(){var n=session;return !!n&&n.ready&&!n.error&&n.online.every(function(on,i){return on||(n.state&&!n.state.players[i].alive);});}
  function start(s){var n=session;if(!n||n.role!=='host'||!ready()||!Lava.valid(s)||s.players.length!==n.count)return false;n.round++;n.state=s;publish(n);return true;}
  function update(s){var n=session;if(n&&n.role==='host'){n.state=s;publish(n);}}
  function act(dir){var n=session;if(!n||!n.state||!ready()||n.state.turn!==n.seat)return false;if(n.role==='host'){n.handlers.move(dir,n.seat);return true;}return send(n.conn,{t:'move',dir:dir,ply:n.state.ply,round:n.round});}
  function close(){var n=session;session=null;if(!n)return;clearTimeout(n.timer);try{if(n.peer)n.peer.destroy();}catch(e){}}
  setInterval(function(){var n=session;if(!n)return;var now=Date.now();if(n.role==='host')n.seats.forEach(function(s){if(!s||!s.online)return;if(now-s.seen>9000){drop(n,s.conn);try{s.conn.close();}catch(e){}}else send(s.conn,{t:'ping'});});else if(n.ready&&now-n.seen>10000){n.ready=false;n.error='Связь потеряна. Нажми «Переподключиться».';notify(n);}},2000);
  return {host:host,join:join,start:start,update:update,act:act,close:close,ready:ready,clean:clean,current:function(){return session;}};
})();
