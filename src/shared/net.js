// ===== Онлайн на двоих: прямое соединение браузеров через PeerJS =====
// Хозяин создаёт игру (код из 5 символов), друг подключается по коду или ссылке …#КОД.
// Модуль отвечает только за связь: игровые сообщения передаёт как есть через onData.
var Net2P = (function () {
  var ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', peerLib = null, N = null;
  function genCode() { var c = ''; for (var i = 0; i < 5; i++) c += ABC[Math.floor(Math.random() * ABC.length)]; return c; }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').slice(0, 5); }
  function peerOpts() {
    var h = new URLSearchParams(location.search).get('peer');           // для тестов: свой сервер связи
    if (h) { var hp = h.split(':'); return { host: hp[0], port: +hp[1] || 9000, path: '/', secure: false, debug: 1 }; }
    return { debug: 1 };
  }
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    if (peerLib) return peerLib;
    var q = new URLSearchParams(location.search), srcs = [];
    if (q.get('peerlib')) srcs.push(q.get('peerlib'));
    srcs.push('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js');
    peerLib = new Promise(function (res, rej) {
      var k = 0;
      (function next() {
        if (k >= srcs.length) { peerLib = null; rej(new Error('lib')); return; }
        var sc = document.createElement('script'); sc.src = srcs[k++];
        sc.onload = function () { window.Peer ? res() : next(); }; sc.onerror = next; document.head.appendChild(sc);
      })();
    });
    return peerLib;
  }
  function cid(prefix) {
    var key = prefix + 'cid', id = null;
    try { id = localStorage.getItem(key); } catch (e) {}
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem(key, id); } catch (e) {} }
    return id;
  }
  function shareLink(code) { return !window.IN_ROOM && /^https?:/.test(location.protocol) ? location.origin + location.pathname + location.search + '#' + code : ''; }
  function setOnline(v) { if (!N || N.online === v) return; N.online = v; N.o.onPeer && N.o.onPeer(v); }

  setInterval(function () {
    if (!N || !N.conn || !N.conn.open) return;
    try { N.conn.send({ _t: 'ping' }); } catch (e) {}
    if (N.seen && Date.now() - N.seen > 8000) setOnline(false);
  }, 2000);

  function wire(conn) {
    var n = N;
    conn.on('data', function (d) {
      if (N !== n || !d || typeof d !== 'object') return;
      if (n.role === 'host' && conn !== n.conn && d._t !== 'hello') return;
      n.seen = Date.now();
      if (d._t === 'ping') { try { conn.send({ _t: 'pong' }); } catch (e) {} if (n.conn === conn) setOnline(true); return; }
      if (d._t === 'pong') { setOnline(true); return; }
      if (d._t === 'hello') { hostHello(conn, d); return; }
      if (d._t === 'welcome') { n.opened = true; setOnline(true); n.o.onOpen && n.o.onOpen(); return; }
      if (d._t === 'full') { fail('В этой игре уже два игрока.'); return; }
      if (d._t === 'bye') { n.bye = true; return; }
      if (d._t === 'leave') { setOnline(false); n.o.onLeave && n.o.onLeave(); return; }
      n.o.onData && n.o.onData(d);
    });
    conn.on('close', function () {
      if (N !== n) return;
      if (n.role === 'host') { if (conn === n.conn) setOnline(false); }
      else if (!n.failed) fail(n.bye ? 'Хозяин игры вышел.' : 'Связь с игрой потеряна.');
    });
  }
  function hostHello(conn, d) {
    var n = N, returning = !!n.cid && d.cid === n.cid, first = !n.cid;
    if (n.conn && n.conn !== conn && !returning && n.online) { try { conn.send({ _t: 'full' }); } catch (e) {} return; }
    if (n.conn && n.conn !== conn) { try { n.conn.close(); } catch (e) {} }
    n.conn = conn; n.cid = d.cid; n.seen = Date.now();
    try { conn.send({ _t: 'welcome' }); } catch (e) {}
    setOnline(true);
    n.o.onJoin && n.o.onJoin({ first: first, returning: returning });
  }
  function fail(msg) { if (!N) return; N.failed = true; N.o.onFail && N.o.onFail(msg); }

  function host(o) {
    close();
    N = { role: 'host', code: o.code ? cleanCode(o.code) : genCode(), o: o, online: false, tries: 0 };
    var n = N;
    loadPeer().then(function () { if (N === n) openHost(); }).catch(function () { fail('Не загрузилась связь. Проверь интернет.'); });
  }
  function openHost() {
    var n = N, peer = new window.Peer(n.o.prefix + n.code, peerOpts());
    n.peer = peer;
    peer.on('open', function () { if (N !== n) return; n.ready = true; n.o.onReady && n.o.onReady(n.code, shareLink(n.code)); });
    peer.on('connection', function (conn) { wire(conn); });
    peer.on('disconnected', function () { setTimeout(function () { if (N === n && !peer.destroyed) try { peer.reconnect(); } catch (e) {} }, 1500); });
    peer.on('error', function (e) {
      if (N !== n) return;
      if (e.type === 'unavailable-id' && !n.ready) {
        // свой прежний код (после перезагрузки страницы) сервер может отдать не сразу — пробуем ещё немного
        try { peer.destroy(); } catch (x) {}
        if (n.o.code && ++n.tries < 6) { setTimeout(function () { if (N === n) openHost(); }, 1500); return; }
        n.code = genCode(); openHost(); return;
      }
      if (!n.ready) fail('Нет связи с сервером. Проверь интернет и попробуй ещё раз.');
    });
  }
  function join(code, o) {
    close();
    N = { role: 'guest', code: cleanCode(code), o: o, online: false };
    var n = N;
    loadPeer().then(function () { if (N === n) openGuest(); }).catch(function () { fail('Не загрузилась связь. Проверь интернет.'); });
  }
  function openGuest() {
    var n = N, peer = new window.Peer(peerOpts());
    n.peer = peer;
    peer.on('open', function () {
      if (N !== n) return;
      var conn = peer.connect(n.o.prefix + n.code, { reliable: true, serialization: 'json' });
      n.conn = conn; wire(conn);
      var tm = window.IN_ROOM ? 0 : setTimeout(function () { if (N === n && !n.opened) fail('Не получилось соединиться напрямую. Похоже, сеть блокирует прямое подключение (бывает в мобильном интернете и рабочем Wi-Fi). Попробуй другую сеть.'); }, 15000);
      conn.on('open', function () { if (N !== n) return; n.seen = Date.now(); clearTimeout(tm); try { conn.send({ _t: 'hello', cid: cid(n.o.prefix) }); } catch (e) {} });
    });
    peer.on('error', function (e) {
      if (N !== n) return;
      if (e.type === 'peer-unavailable') fail('Игра с кодом ' + n.code + ' не найдена. Проверь код: может, хозяин закрыл игру.');
      else if (!n.opened) fail('Нет связи с сервером. Проверь интернет и попробуй ещё раз.');
    });
  }
  function send(m) { if (N && N.conn && N.conn.open) { try { N.conn.send(m); return true; } catch (e) {} } return false; }
  function close() {
    if (!N) return;
    var n = N; N = null;
    try { if (n.conn && n.conn.open) n.conn.send(n.role === 'host' ? { _t: 'bye' } : { _t: 'leave' }); } catch (e) {}
    setTimeout(function () { try { n.peer && n.peer.destroy(); } catch (e) {} }, 150);
  }
  return {
    host: host, join: join, send: send, close: close, cleanCode: cleanCode,
    active: function () { return !!N; }, role: function () { return N && N.role; }, code: function () { return N && N.code; },
    online: function () { return !!(N && N.online); },
    hashCode: function () { var m = /^#([A-Za-z0-9]{5})$/.exec(location.hash || ''); return m ? m[1] : null; }
  };
})();
