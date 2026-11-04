(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var A = LavaArt, C = A.colors, L = Lava;
  var ROLE_NAMES = { human: 'Игрок', bot: 'Бот', net: 'Друг', off: 'Нет' };
  var ROLES = ['human', 'bot', 'net', 'off'];
  var PREFS = 'lava-settings-v3', SAVED = 'lava-local-v3';
  var PRESETS = { bot1: ['off', 'bot', 'off', 'human'], bots3: ['bot', 'bot', 'bot', 'human'], local: ['off', 'human', 'off', 'human'], net: ['off', 'net', 'off', 'human'] };
  var S = { roles: PRESETS.bot1.slice(), mapId: 'classic', first: 'random', sound: true };
  try {
    var pr = JSON.parse(localStorage.getItem(PREFS));
    if (pr && Array.isArray(pr.roles) && pr.roles.length === 4 && pr.roles.every(function (r) { return ROLES.indexOf(r) >= 0; }) && L.map(pr.mapId)) S = { roles: pr.roles, mapId: pr.mapId, first: pr.first === undefined ? 'random' : pr.first, sound: pr.sound !== false,evalOn:!!pr.evalOn,coords:!!pr.coords,localViewVersion:pr.localViewVersion };
  } catch (e) {}
  BoardView.defaults(S,savePrefs);
  $('lavaEval').checked=!!S.evalOn;$('lavaEval').onchange=function(){S.evalOn=this.checked;savePrefs();if(rv)rv.refresh();};
  if (window.IN_ROOM) S.roles = PRESETS.net.slice();
  var state = null, roles = [], gameSetup = null, epoch = 0, netRound = 0, shownResult = '';
  var busy = false, pending = false, botTimer = 0, pendTimer = 0, toastTimer = 0, resultTimer = 0;
  var VOTE = null, askFor = null, undoWait = false, rv = null, HC = { key: null, line: null };
  var armed = -1, B = 480, pieces = [], tileEls = [], markEls = [], holesKey = '', audio = null;
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(S)); } catch (e) {} }
  function toast(msg) { $('toast').textContent = msg; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').hidden = true; }, 3200); }

  // ---------- правила (в меню и в окне) ----------
  var RULES = '<ol>' +
    '<li>Ходите по очереди, по часовой стрелке. В свой ход <b>прыгай по прямой</b> — вверх, вниз, влево или вправо — на любое расстояние. Пролетать можно над фишками и лавой, приземляться — только на плитку.</li>' +
    '<li>Плитка, <b>с которой прыгнул</b>, теряет слой: белая выдерживает 3 прыжка, бежевая — 2, тёмная — 1. Потом на её месте лава.</li>' +
    '<li><b>Назад нельзя</b> — в ту сторону, откуда только что прилетел (или откуда тебя толкнули). Стрелки на фишке показывают, куда можно. <b>Прыжок на месте</b> снимает запрет, но тоже ломает твою плитку: на тёмной — сгоришь.</li>' +
    '<li>Прыгнул на соперника — <b>толкаешь</b> его (и всех, кто стоит за ним вплотную) на клетку дальше. Попал в лаву — сгорел. Если за ним стена, толчок не проходит: ты отскакиваешь на клетку перед ним.</li>' +
    '<li>Сгорел — выбыл. <b>Побеждает последний</b>, кто остался на плитках.</li></ol>' +
    '<div class="legend"><span><i style="background:#f3ece5"></i>3 прыжка</span><span><i style="background:#b9a99c"></i>2</span><span><i style="background:#6e5c52"></i>1</span><span><i style="background:radial-gradient(#ffb648,#ff4d00 60%,#120806)"></i>лава</span></div>' +
    '<p class="hint">Нажми на клетку, куда прыгаешь, или перетащи фишку. Прыжок на месте — дважды нажать на свою фишку или кнопку «На месте» (пробел). Ход можно вернуть; с ботом — сразу, с другом — если он согласится. Стрелки ◀ ▶ под полем — перемотка партии.</p>';
  $('rulesMenu').innerHTML = RULES; $('rulesDlg').innerHTML = RULES;
  $('logoGem').innerHTML = A.gem(3, { id: 'logo' });
  $('homeBtn').innerHTML = A.icon('home'); $('undoBtn').innerHTML = A.icon('undo'); $('againBtn').innerHTML = A.icon('restart'); $('gameRulesBtn').innerHTML = A.icon('help');
  $('stayBtn').innerHTML = A.icon('stay') + '<span>На месте</span>';

  // ---------- звук ----------
  function ctx() { if (!S.sound) return null; try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); return audio; } catch (e) { return null; } }
  function tone(f1, f2, dur, type, vol, delay) {
    var a = ctx(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (delay || 0) / 1000;
    o.type = type || 'triangle'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay) {
    var a = ctx(); if (!a) return;
    var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + (delay || 0) / 1000;
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
  }
  var SFX = {
    jump: function (d) { tone(320, 680, .16, 'triangle', .05, d); },
    step: function (d) { tone(260, 430, .1, 'triangle', .045, d); },
    land: function (d) { tone(150, 80, .09, 'sine', .09, d); },
    crumble: function (d) { noise(.25, .09, 2200, d); },
    fire: function (d) { noise(.6, .13, 700, d); tone(120, 38, .55, 'sawtooth', .025, d); },
    push: function (d) { tone(190, 110, .1, 'square', .035, d); noise(.08, .06, 1200, d); },
    win: function (d) { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, f * 1.01, .22, 'triangle', .05, (d || 0) + i * 110); }); }
  };

  // ---------- меню ----------
  function activeCorners() { return [0, 1, 2, 3].filter(function (c) { return S.roles[c] !== 'off'; }); }
  function setupError() {
    var act = activeCorners(), rs = act.map(function (c) { return S.roles[c]; });
    if (act.length < 2) return 'Нужно хотя бы два игрока';
    if (window.IN_ROOM && (act.length !== 2 || rs.indexOf('human') < 0 || rs.indexOf('net') < 0)) return 'В комнате играют двое: отметь себя «Игрок», а соседний угол — «Друг»';
    if (rs.indexOf('net') >= 0 && rs.filter(function (r) { return r === 'human'; }).length !== 1) return 'Для онлайна отметь «Игрок» только себя, а места друзей — «Друг»';
    return '';
  }
  function selectedSetup() {
    var act = activeCorners(), first = S.first === 'random' ? -1 : act.indexOf(+S.first);
    if (first < 0) first = Math.floor(Math.random() * act.length);
    return { mapId: S.mapId, corners: act, first: first, roles: act.map(function (c) { return S.roles[c]; }) };
  }
  function seg(el, items, cur, onPick) {
    el.innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = it.html; b.setAttribute('aria-pressed', String(it.v === cur)); if (it.label) b.setAttribute('aria-label', it.label);
      if (it.disabled) b.disabled = true;
      b.onclick = function () { onPick(it.v); }; el.appendChild(b);
    });
  }
  function renderMenu() {
    Array.prototype.forEach.call(document.querySelectorAll('#presets button'), function (b) {
      var p = PRESETS[b.dataset.preset]; b.setAttribute('aria-pressed', String(p.join() === S.roles.join()));
      b.disabled = !!window.IN_ROOM && b.dataset.preset !== 'net';
    });
    var grid = $('seatGrid'); grid.innerHTML = '';
    [0, 1, 3, 2].forEach(function (c) {
      var card = document.createElement('div'); card.className = 'seatc' + (S.roles[c] === 'off' ? ' off' : '');
      card.style.setProperty('--cc', C[c].base); card.style.setProperty('--cg', C[c].glow);
      card.innerHTML = '<div class="who">' + A.gem(c, { id: 'm' }) + '<span>' + C[c].name + '</span></div><div class="seg"></div>';
      seg(card.querySelector('.seg'), ROLES.map(function (r) { return { v: r, html: ROLE_NAMES[r], disabled: !!window.IN_ROOM && r === 'bot' }; }), S.roles[c], function (r) { S.roles[c] = r; savePrefs(); renderMenu(); });
      grid.appendChild(card);
    });
    var maps = $('maps'); maps.innerHTML = '';
    L.MAPS.forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(m.id === S.mapId));
      b.innerHTML = (m.tiles ? A.mini(m.tiles) : '<span class="rnd">?</span>') + '<span>' + m.name + '</span>';
      b.onclick = function () { S.mapId = m.id; savePrefs(); renderMenu(); }; maps.appendChild(b);
    });
    $('mapNote').textContent = L.map(S.mapId).note;
    var act = activeCorners();
    if (S.first !== 'random' && act.indexOf(+S.first) < 0) S.first = 'random';
    seg($('firstSeg'), [{ v: 'random', html: 'Случайно' }].concat([0, 1, 2, 3].map(function (c) { return { v: String(c), html: A.gem(c, { id: 'f' }), label: C[c].name, disabled: act.indexOf(c) < 0 }; })), String(S.first), function (v) { S.first = v; savePrefs(); renderMenu(); });
    var err = setupError(), net = act.some(function (c) { return S.roles[c] === 'net'; });
    $('playBtn').innerHTML = A.icon('play') + (net ? (window.IN_ROOM ? 'Начать с другом' : 'Создать игру') : 'Играть');
    $('playBtn').disabled = !!err;
    $('seatHint').textContent = err || (window.IN_ROOM ? 'Ты и друг из комнаты: выберите себе углы. Ходят по часовой.' : 'Углы как на поле. «Друг» играет по ссылке со своего телефона; ходят по часовой.');
    $('seatHint').style.color = err ? '#ff9a6b' : '';
    $('resumeBtn').hidden = !!window.IN_ROOM || !readSave();
    $('onlineCard').hidden = !!window.IN_ROOM;
  }
  Array.prototype.forEach.call(document.querySelectorAll('#presets button'), function (b) {
    b.onclick = function () { S.roles = PRESETS[b.dataset.preset].slice(); savePrefs(); renderMenu(); };
  });

  // ---------- сохранение локальной партии ----------
  function readSave() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVED));
      if (s && L.valid(s.state) && !s.state.over && Array.isArray(s.roles) && s.roles.length === s.state.players.length && s.roles.every(function (k) { return k === 'human' || k === 'bot'; })) return s;
    } catch (e) {}
    return null;
  }
  function saveGame() {
    if (LavaLink.current() || !state) return;
    try { if (state.over) localStorage.removeItem(SAVED); else localStorage.setItem(SAVED, JSON.stringify({ state: state, roles: roles, setup: gameSetup })); } catch (e) {}
  }

  // ---------- размеры ----------
  function layout() {
    if ($('game').hidden) return;
    var vw = window.innerWidth, vh = window.innerHeight, hub = window.hubH ? window.hubH() : 0;
    var top = $('game').querySelector('.g-top').offsetHeight || 54, bar = 62 + ($('rvMount').offsetHeight || 38), wide = vw >= 700 && vw > vh * 1.15, gem, b;
    if (wide) {
      gem = Math.max(50, Math.min(84, vh * .1));
      b = Math.min(vh - hub - top - bar - 26, vw - 2 * (gem + 70) - 40);
    } else {
      gem = Math.max(38, Math.min(58, vw * .12));
      b = Math.min(vw - 30, vh - hub - top - bar - 2 * (gem + 12) - 30);
    }
    B = Math.max(216, Math.floor(b / 1.04 / 6) * 6);
    document.documentElement.style.setProperty('--B', B + 'px');
    document.documentElement.style.setProperty('--gem', Math.round(gem) + 'px');
    $('arena').classList.toggle('wide', wide);
    if (state && !busy && tileEls.length) render();
  }
  window.addEventListener('resize', layout);
  function xy(i) { var cs = B / 6; return [(i % 6) * cs, Math.floor(i / 6) * cs]; }
  function tf(i, s, dx, dy) { var p = xy(i); return 'translate(' + (p[0] + (dx || 0)) + 'px,' + (p[1] + (dy || 0)) + 'px) scale(' + (s || 1) + ')'; }

  // ---------- поле ----------
  var RING = '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="100 44.5"/></svg>';
  function buildBoard() {
    var bd = $('board'), old = bd.querySelector('svg.lava'); if (old) old.remove();
    bd.insertAdjacentHTML('afterbegin', A.board(1 + Math.floor(Math.random() * 900)));
    holesKey = '';
    var tl = $('tiles'), mk = $('marks'), pc = $('pieces'); tl.innerHTML = ''; mk.innerHTML = ''; pc.innerHTML = ''; $('fx').innerHTML = '';
    tileEls = []; markEls = []; pieces = [];
    for (var i = 0; i < 36; i++) {
      var t = document.createElement('div'); t.className = 'tile';
      t.style.left = 'calc(var(--B) / 6 * ' + (i % 6 + .07) + ')'; t.style.top = 'calc(var(--B) / 6 * ' + (Math.floor(i / 6) + .07) + ')';
      tl.appendChild(t); tileEls.push(t);
      var m = document.createElement('button'); m.className = 'mark'; m.type = 'button'; m.tabIndex = -1; m.dataset.i = i;
      m.style.left = 'calc(var(--B) / 6 * ' + (i % 6) + ')'; m.style.top = 'calc(var(--B) / 6 * ' + Math.floor(i / 6) + ')';
      mk.appendChild(m); markEls.push(m);
    }
    state.players.forEach(function (p, seat) {
      var c = p.corner, el = document.createElement('div'); el.className = 'pc'; el.style.setProperty('--pc', C[c].light);
      el.innerHTML = RING + A.gem(c, { id: 'p' }) + '<i class="ar a0"></i><i class="ar a1"></i><i class="ar a2"></i><i class="ar a3"></i>';
      pc.appendChild(el); pieces.push(el);
    });
    [0, 1, 2, 3].forEach(function (c) {
      var el = $('seat' + c), seat = seatOf(c);
      el.hidden = seat < 0; el.style.setProperty('--cg', C[c].glow);
      el.innerHTML = '<div class="sg">' + RING + A.gem(c, { id: 's' }) + '</div><div><div class="nm"></div><div class="st"></div></div>';
    });
  }
  function seatOf(c) { if (!state) return -1; for (var i = 0; i < state.players.length; i++) if (state.players[i].corner === c) return i; return -1; }
  function paintTiles(tiles) {
    tiles.forEach(function (t, i) { tileEls[i].className = 'tile t' + t; });
    var key = tiles.map(function (t) { return t ? 1 : 0; }).join('');
    if (key !== holesKey) { holesKey = key; var cp = document.getElementById('lvHoles'); if (cp) cp.innerHTML = A.holes(tiles); }
  }
  function placePieces(S0) {
    (S0 || state).players.forEach(function (p, seat) {
      var el = pieces[seat]; if (!el) return;
      el.getAnimations().forEach(function (a) { a.cancel(); });
      el.classList.toggle('gone', !p.alive);
      el.style.transform = tf(p.pos);
      el.style.filter = ''; el.style.opacity = '';
    });
  }

  // ---------- кто есть кто ----------
  function net() { return LavaLink.current(); }
  function mine(seat) {
    var n = net();
    if (!n) return roles[seat] === 'human';
    return n.role === 'host' ? roles[seat] === 'human' : seat === n.seat;
  }
  function humansLocal() { return !net() && roles.filter(function (r) { return r === 'human'; }).length > 1; }
  function label(seat) {
    if (roles[seat] === 'bot') return 'Бот';
    if (mine(seat)) return humansLocal() ? C[state.players[seat].corner].name : 'Ты';
    return roles[seat] === 'human' && !net() ? C[state.players[seat].corner].name : 'Друг';
  }
  function canAct() {
    if (!state || state.over || busy || pending || (rv && rv.viewing())) return false;
    var n = net();
    if (!n) return roles[state.turn] === 'human';
    return LavaLink.ready() && (n.role === 'host' ? roles[state.turn] === 'human' : state.turn === n.seat);
  }

  // ---------- отрисовка ----------
  function viewing() { return !!rv && rv.viewing(); }
  function render() {
    BoardView.refresh('lava');
    if (!state) return;
    var V = viewing(), S0 = V ? rv.display().s : state, vary = V && rv.canPlay();
    var can = canAct(), turn = S0.turn, n = net();
    if (!busy) { paintTiles(S0.tiles); placePieces(S0); }
    if (armed !== state.ply || V) armed = -1;
    // стрелки (куда можно прыгнуть) и кольцо того, чей ход
    S0.players.forEach(function (p, seat) {
      var el = pieces[seat]; if (!el) return;
      var dirs = [false, false, false, false];
      if (p.alive && !S0.over) L.moves(S0, seat).forEach(function (m) { if (m.n > 0) dirs[m.d] = true; });
      for (var d = 0; d < 4; d++) el.querySelector('.a' + d).classList.toggle('on', dirs[d] && !busy);
      el.classList.toggle('on', !S0.over && seat === turn && !busy);
    });
    // клетки, куда можно прыгнуть (без подсветки — только для нажатий)
    markEls.forEach(function (m) { m.className = 'mark'; m.removeAttribute('data-m'); m.removeAttribute('aria-label'); m.tabIndex = -1; });
    if (can || vary) {
      L.moves(S0, turn).forEach(function (mv) {
        var m = markEls[mv.m === 0 ? mv.to : mv.land];
        m.dataset.m = mv.m; m.tabIndex = 0;
        if (mv.m === 0) { m.className = 'mark stay' + (armed === state.ply && !V ? ' armed' : ''); m.setAttribute('aria-label', 'Прыжок на месте'); }
        else { m.className = 'mark go'; m.setAttribute('aria-label', 'Прыжок ' + L.DIRS[mv.d].label + ' на ' + mv.n); }
      });
    }
    // игроки по углам
    [0, 1, 2, 3].forEach(function (c) {
      var seat = seatOf(c), el = $('seat' + c); if (seat < 0) return;
      var p = S0.players[seat], nm = label(seat), cn = C[c].name;
      el.querySelector('.nm').textContent = nm;
      el.querySelector('.nm').style.color = C[c].light;
      var st = !p.alive ? 'сгорел' : S0.over && S0.winner === seat ? 'победил!' : n && roles[seat] === 'net' && !n.online[seat] ? 'нет связи' : nm === cn ? '' : cn.toLowerCase();
      el.querySelector('.st').textContent = st;
      el.classList.toggle('on', !S0.over && seat === turn);
      el.classList.toggle('dead', !p.alive);
    });
    // заголовок (в просмотре строку состояния пишет модуль перемотки)
    var tn = $('turnName'), stt = $('status');
    if (V) { tn.textContent = rv.inVar() ? 'Вариант' : 'Просмотр партии'; tn.style.color = '#ffc58a'; }
    else if (state.over) {
      var w = state.winner;
      tn.textContent = w === null ? 'Все сгорели' : mine(w) && !humansLocal() ? 'Победа!' : C[state.players[w].corner].name + ' победил' + (roles[w] === 'bot' ? ' (бот)' : '');
      tn.style.color = w === null ? '' : C[state.players[w].corner].light;
      stt.textContent = 'Прыжков: ' + state.ply;
    } else {
      var c = state.players[turn].corner, p0 = state.players[turn];
      tn.style.color = C[c].light;
      tn.textContent = roles[turn] === 'bot' ? 'Ходит бот · ' + C[c].who : mine(turn) ? (humansLocal() ? 'Ходит ' + C[c].who : 'Твой ход') : 'Ходит друг · ' + C[c].who;
      stt.textContent = n && !LavaLink.ready() ? 'Ждём связи…' : VOTE || undoWait ? 'Ждём ответа про возврат хода…' : pending ? 'Отправляем ход…' : can ? (p0.back >= 0 ? 'Назад ' + L.DIRS[p0.back].label + ' нельзя · прыжок на месте снимет запрет' : 'Прыгай по прямой на любую плитку') : '';
    }
    $('stayBtn').disabled = !(can || vary); $('stayBtn').classList.toggle('armed', armed === state.ply && can);
    var u = undoMode();
    $('undoBtn').disabled = !u; $('undoBtn').title = u === 'here' ? 'Играть с этой позиции' : u === 'ask' ? 'Попросить вернуть ход' : 'Вернуть ход';
    $('undoBtn').setAttribute('aria-label', $('undoBtn').title);
    $('soundBtn').innerHTML = A.icon(S.sound ? 'soundOn' : 'soundOff'); $('soundBtn').setAttribute('aria-pressed', String(S.sound));
    $('againBtn').disabled = !!n && (n.role !== 'host' || !state.over);
    $('netWarning').hidden = !n || LavaLink.ready(); $('netWarningText').textContent = n ? (n.error || 'Ждём игрока, у которого пропала связь. Его место сохранено.') : '';
    $('reconnectBtn').hidden = !n || n.role !== 'guest';
    if (state.over && !busy && !V) {
      var key = netRound + ':' + state.ply + ':' + state.winner;
      if (shownResult !== key) { shownResult = key; clearTimeout(resultTimer); resultTimer = setTimeout(showResult, 700); }
    }
  }
  function showResult() {
    if (!state || !state.over || $('game').hidden || viewing()) return;
    var w = state.winner, n = net();
    $('winnerGem').innerHTML = w === null ? '' : A.gem(state.players[w].corner, { id: 'w' });
    $('resultTitle').textContent = w === null ? 'Все сгорели' : mine(w) && !humansLocal() ? 'Ты победил!' : C[state.players[w].corner].name + ' победил' + (roles[w] === 'bot' ? ' (бот)' : '');
    $('resultText').textContent = 'Прыжков за партию: ' + state.ply + '.' + (n && n.role === 'guest' ? ' Реванш запускает хозяин.' : '');
    $('resultAgain').hidden = !!n && n.role === 'guest';
    if (w !== null && (mine(w) || humansLocal())) SFX.win();
    if (!$('result').open) $('result').showModal();
  }

  // ---------- эффекты ----------
  function bits(i, kind, delay) {
    setTimeout(function () {
      var fx = $('fx'), cs = B / 6, cx = (i % 6 + .5) * cs, cy = (Math.floor(i / 6) + .5) * cs;
      var fire = kind === 'fire', n = fire ? 18 : 14;
      if (fire) {
        var fl = document.createElement('div'); fl.className = 'bit';
        fl.style.cssText = 'width:' + cs + 'px;height:' + cs + 'px;border-radius:50%;background:radial-gradient(circle,#ffe08a 0%,#ff7a1a 35%,rgba(255,60,0,0) 70%);mix-blend-mode:screen';
        fx.appendChild(fl);
        fl.animate([{ transform: 'translate(' + (cx - cs / 2) + 'px,' + (cy - cs / 2) + 'px) scale(.3)', opacity: 1 }, { transform: 'translate(' + (cx - cs / 2) + 'px,' + (cy - cs / 2) + 'px) scale(1.5)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = function () { fl.remove(); };
      }
      for (var k = 0; k < n; k++) {
        var b = document.createElement('div'), sz = cs * (fire ? .07 + Math.random() * .09 : .05 + Math.random() * .07);
        var col = fire ? ['#ffe27a', '#ffa53a', '#ff6a1a', '#d8340c'][k % 4] : ['#efe7df', '#d3c6ba', '#a8998d', '#7d6e64'][k % 4];
        b.className = 'bit';
        b.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;background:' + col + ';border-radius:' + (fire ? '50%' : '18%') + (fire ? ';box-shadow:0 0 ' + sz + 'px ' + col : '');
        fx.appendChild(b);
        var x0 = cx + (Math.random() - .5) * cs * .6 - sz / 2, y0 = cy + (Math.random() - .5) * cs * .6 - sz / 2;
        var ang = Math.random() * Math.PI * 2, dist = cs * (.25 + Math.random() * .4);
        var x1 = x0 + Math.cos(ang) * dist, y1 = y0 + Math.sin(ang) * dist + (fire ? -cs * .35 : cs * .15);
        b.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px) rotate(0deg) scale(1)', opacity: 1 }, { transform: 'translate(' + x1 + 'px,' + y1 + 'px) rotate(' + (Math.random() * 400 - 200) + 'deg) scale(' + (fire ? .2 : .5) + ')', opacity: 0 }],
          { duration: 480 + Math.random() * 320, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = (function (el) { return function () { el.remove(); }; })(b);
      }
    }, delay || 0);
  }
  function sink(el, pos, delay) {
    el.animate([{ transform: tf(pos, 1), filter: 'brightness(1)', opacity: 1 },
      { transform: tf(pos, .75), filter: 'brightness(.7) sepia(1) saturate(5) hue-rotate(-25deg)', opacity: .95, offset: .35 },
      { transform: tf(pos, .12), filter: 'brightness(.15)', opacity: 0 }], { duration: 700, delay: delay, easing: 'ease-in', fill: 'both' });
    bits(pos, 'fire', delay + 120); SFX.fire(delay + 80);
  }
  // анимация хода; done — когда всё закончилось
  function animate(old, nw, done) {
    var e = nw.last, my = epoch;
    if (!e || !pieces[e.seat] || viewing()) { done(); return; }
    busy = true; render();
    paintTiles(old.tiles);
    old.players.forEach(function (p, seat) { var el = pieces[seat]; el.getAnimations().forEach(function (a) { a.cancel(); }); el.classList.toggle('gone', !p.alive); el.style.transform = tf(p.pos); });
    var el = pieces[e.seat], n = e.m % 10, cs = B / 6, dur, tDepart = 0, end;
    var breakTiles = function () { paintTiles(nw.tiles); bits(e.from, e.left > 0 ? 'debris' : 'fire'); if (e.left > 0) SFX.crumble(); else SFX.fire(); };
    el.style.transform = tf(e.to);
    if (e.kind === 'stay') {
      dur = 420; tDepart = 330;
      el.animate([{ transform: tf(e.from, 1) }, { transform: tf(e.from, 1.45), offset: .45 }, { transform: tf(e.from, 1) }], { duration: dur, easing: 'ease-in-out' });
      SFX.jump();
    } else {
      var far = n > 1, fly = far ? 260 + 75 * (n - 1) : 210, up = far ? 1.38 : 1.08;
      if (e.kind === 'bounce') {
        var dv = L.DIRS[e.d], cx = -dv.dc * cs * .42, cy = -dv.dr * cs * .42;
        dur = fly + 170;
        var kf = [{ transform: tf(e.from, 1) }];
        if (far) kf.push({ transform: 'translate(' + ((xy(e.from)[0] + xy(e.land)[0]) / 2) + 'px,' + ((xy(e.from)[1] + xy(e.land)[1]) / 2) + 'px) scale(' + up + ')', offset: fly / dur * .5 });
        kf.push({ transform: tf(e.land, 1, cx, cy), offset: fly / dur });
        kf.push({ transform: tf(e.to, 1) });
        el.animate(kf, { duration: dur, easing: 'ease-in-out' });
        // толкаемые вздрагивают у стены
        var c = e.land, o;
        while (c >= 0 && (o = L.who(old, c)) >= 0) {
          pieces[o].animate([{ transform: tf(c) }, { transform: tf(c, 1, dv.dc * cs * .09, dv.dr * cs * .09), offset: .4 }, { transform: tf(c) }], { duration: 260, delay: fly, easing: 'ease-out' });
          c = L.step(c, e.d, 1);
        }
        SFX.push(fly);
      } else {
        dur = fly;
        el.animate([{ transform: tf(e.from, 1) }, { transform: 'translate(' + ((xy(e.from)[0] + xy(e.land)[0]) / 2) + 'px,' + ((xy(e.from)[1] + xy(e.land)[1]) / 2) + 'px) scale(' + up + ')' }, { transform: tf(e.land, 1) }], { duration: dur, easing: 'ease-in-out' });
      }
      (far ? SFX.jump : SFX.step)(); SFX.land(fly - 20);
    }
    end = dur;
    setTimeout(function () { if (my === epoch) breakTiles(); }, tDepart);
    e.pushed.forEach(function (q) {
      var pe = pieces[q.seat];
      pe.style.transform = tf(q.to);
      pe.animate([{ transform: tf(q.from) }, { transform: tf(q.to) }], { duration: 200, delay: dur, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      if (q.fell) { sink(pe, q.to, dur + 200); end = Math.max(end, dur + 200 + 700); }
      else end = Math.max(end, dur + 200);
    });
    if (e.pushed.length) SFX.push(dur);
    if (e.fell) { sink(el, e.to, dur); end = Math.max(end, dur + 700); }
    setTimeout(function () { if (my !== epoch) return; busy = false; done(); }, end + 60);
  }

  // ---------- ходы ----------
  function after() { render(); schedule(); }
  function commit(m, seat) {
    if (!state || state.turn !== seat || busy) return;
    var next = L.apply(state, m); if (!next) return;
    var old = state; state = next; pending = false; busy = true; armed = -1;
    saveGame(); if (rv) rv.sync();
    if (net()) { LavaLink.update(state); if (VOTE) finishVote(false); }
    animate(old, state, after);
  }
  function act(m) {
    if (viewing()) { if (rv.canPlay()) rv.play(m); return; }
    if (!canAct() || !L.moves(state, state.turn).some(function (x) { return x.m === m; })) return;
    var n = net();
    if (!n) { commit(m, state.turn); return; }
    if (n.role === 'host') { LavaLink.act(m); return; }
    pending = true; render();
    if (!LavaLink.act(m)) { pending = false; render(); return; }
    clearTimeout(pendTimer); pendTimer = setTimeout(function () { pending = false; render(); }, 4000);
  }
  function stayTap() {
    if (viewing()) { if (rv.canPlay()) rv.play(0); return; }
    if (!canAct()) return;
    var mv = L.moves(state, state.turn).filter(function (x) { return x.m === 0; })[0];
    if (armed === state.ply) { armed = -1; act(0); return; }
    armed = state.ply; render();
    toast(mv && mv.fatal ? 'Плитка последняя — прыжок на месте утопит тебя. Нажми ещё раз, если уверен.' : 'Нажми ещё раз — прыжок на месте. Плитка потеряет слой, запрет «назад» снимется.');
  }
  function schedule() {
    clearTimeout(botTimer);
    var n = net();
    if (!state || state.over || busy || VOTE || $('game').hidden || roles[state.turn] !== 'bot' || n && (n.role !== 'host' || !LavaLink.ready())) return;
    var my = epoch, seat = state.turn;
    botTimer = setTimeout(function () {
      if (my !== epoch || !state || state.turn !== seat || busy || net() && !LavaLink.ready()) return;
      var m = L.bot(state); if (m !== null) commit(m, seat);
    }, 600);
  }

  // нажатия и перетаскивание по полю
  var D = null, ghost = null, hoverEl = null;
  function markAt(x, y) { var el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('#marks .mark') : null; }
  function pick(mk) {
    if (!mk || mk.dataset.m === undefined) return;
    if (mk.classList.contains('stay')) stayTap(); else act(+mk.dataset.m);
  }
  $('marks').addEventListener('pointerdown', function (e) {
    var mk = e.target.closest('.mark'); if (!mk || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    D = { mk: mk, x: e.clientX, y: e.clientY, id: e.pointerId, own: mk.classList.contains('stay'), moved: false };
  });
  document.addEventListener('pointermove', function (e) {
    if (!D || e.pointerId !== D.id || !D.own || !canAct()) return;
    if (!D.moved) {
      if (Math.abs(e.clientX - D.x) + Math.abs(e.clientY - D.y) < 8) return;
      D.moved = true; ghost = document.createElement('div'); ghost.id = 'ghost'; ghost.innerHTML = A.gem(state.players[state.turn].corner, { id: 'gh' });
      document.body.appendChild(ghost); pieces[state.turn].classList.add('drag');
    }
    var w = B / 6 * .7; ghost.style.transform = 'translate(' + (e.clientX - w / 2) + 'px,' + (e.clientY - w / 2) + 'px)';
    var h = markAt(e.clientX, e.clientY); if (h && !h.classList.contains('go')) h = null;
    if (h !== hoverEl) { if (hoverEl) hoverEl.classList.remove('hover'); hoverEl = h; if (h) h.classList.add('hover'); }
  });
  function endDrag(e, cancel) {
    if (!D || e.pointerId !== D.id) return;
    var d = D; D = null;
    if (ghost) { ghost.remove(); ghost = null; }
    if (hoverEl) { hoverEl.classList.remove('hover'); hoverEl = null; }
    pieces.forEach(function (p) { p.classList.remove('drag'); });
    if (cancel) return;
    var t = markAt(e.clientX, e.clientY);
    if (d.moved) { if (t && t.classList.contains('go')) pick(t); }
    else if (t === d.mk) pick(t);
  }
  document.addEventListener('pointerup', function (e) { endDrag(e, false); });
  document.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  $('marks').addEventListener('click', function (e) { if (e.detail === 0) pick(e.target.closest('.mark')); });   // клавиатура
  $('stayBtn').onclick = stayTap;
  document.addEventListener('keydown', function (e) {
    if ($('game').hidden || document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.key === ' ') { e.preventDefault(); stayTap(); }
  });

  // ---------- перемотка (как в остальных играх) ----------
  function lineOf() {
    if (!state) return [{ s: L.create(2), mv: null, by: null }];
    if (HC.key !== state) { HC.key = state; HC.line = L.history(state).map(function (st) { return { s: st, mv: st.last ? st.last.m : null, by: st.last ? st.last.seat : null }; }); }
    return HC.line;
  }
  function cname(seat) { return state && state.players[seat] ? C[state.players[seat].corner].name : ''; }
  function moveText(e) {
    var t = e && e.s && e.s.last; if (!t) return '';
    var names = function (arr) { return arr.map(function (x) { return cname(x).toLowerCase(); }).join(', '); };
    if (t.kind === 'stay') return 'прыжок на месте' + (t.fell ? ' — сгорел' : '');
    var out = L.DIRS[t.d].label + ' на ' + (t.m % 10);
    if (t.kind === 'push') out += ', толкнул: ' + names(t.pushed.map(function (q) { return q.seat; }));
    if (t.kind === 'bounce') out += ', отскок от стены';
    if (t.killed.length) out += ' — сгорел ' + names(t.killed);
    if (t.fell) out += ' — сгорел сам';
    return out;
  }
  rv = Review({
    mount: $('rvMount'), status: $('status'), noBar: true,
    line: lineOf,
    play: function (s, mv) { return L.apply(s, mv); },
    over: function (s) { return s.over; }, toMove: function (s) { return s.turn; },
    me: function () { var k = mySeat(); return k < 0 ? 0 : k; }, side: cname,
    moveText: moveText,
    overText: function (s) { return s.winner === null ? 'все сгорели' : cname(s.winner) + ' победил'; },
    engine: function () { return !!state && (!net() || state.over); }, evalOn: function () { return !!S.evalOn || !!(state&&state.over); },
    analyze: function (s, cb) { cb(null); },
    redraw: function () { render(); }, relayout: function () { layout(); },
    active: function () { return !$('game').hidden && !document.querySelector('dialog[open]'); },
    byOf: function (s) { return s.turn; }, same: function (a, b) { return a === b; }
  });

  // ---------- возврат хода ----------
  function mySeat() {
    var n = net();
    if (!n) return roles.indexOf('human');
    return n.role === 'host' ? roles.indexOf('human') : n.seat;
  }
  // позиция перед последним ходом кого-то из seats (индекс в истории), -1 — нечего возвращать
  function lastMoveOf(seats) {
    var h = lineOf();
    for (var k = h.length - 1; k >= 1; k--) if (seats.indexOf(h[k].by) >= 0) return k - 1;
    return -1;
  }
  function humanSeats() { var out = []; roles.forEach(function (r, i) { if (r === 'human') out.push(i); }); return out; }
  function undoMode() {
    if (!state) return '';
    var n = net();
    if (!n) return viewing() ? 'here' : lastMoveOf(humanSeats()) >= 0 ? 'undo' : '';
    return !state.over && !VOTE && !undoWait && LavaLink.ready() && lastMoveOf([mySeat()]) >= 0 ? 'ask' : '';
  }
  function setLocal(ns, msg) {
    stopTimers(); state = ns; armed = -1; shownResult = '';
    if ($('result').open) $('result').close();
    rv.reset(); saveGame(); render(); schedule(); if (msg) toast(msg);
  }
  $('undoBtn').onclick = function () {
    var u = undoMode();
    if (u === 'here') { var ns = L.replay(state, rv.pathHere()); if (ns) setLocal(ns, 'Играем с этой позиции'); }
    else if (u === 'undo') setLocal(L.rewind(state, lastMoveOf(humanSeats())), 'Ход возвращён');
    else if (u === 'ask') requestUndo();
  };
  document.addEventListener('keydown', function (e) {
    if (!$('game').hidden && !net() && (e.ctrlKey || e.metaKey) && /^[zZяЯ]$/.test(e.key)) { e.preventDefault(); $('undoBtn').click(); }
  });
  // онлайн: просьба идёт через хозяина; вернуть можно, если согласны все люди за столом (боты согласны всегда)
  function requestUndo() {
    var n = net(); if (!n) return;
    undoWait = true;
    if (n.role === 'host') hostAsk(mySeat()); else { LavaLink.tell({ k: 'undoAsk', ply: state.ply }); toast('Просим вернуть ход…'); }
    render();
  }
  function hostAsk(R) {
    var t = lastMoveOf([R]);
    if (VOTE || state.over || t < 0) { sendDone({ k: 'undoDone', ok: false, R: R, by: -1 }); return; }
    var voters = []; roles.forEach(function (r, i) { if (i !== R && (r === 'human' || r === 'net')) voters.push(i); });
    VOTE = { R: R, ply: state.ply, target: t, need: voters, yes: {} };
    clearTimeout(botTimer);
    if (!voters.length) { finishVote(true); return; }
    voters.forEach(function (v) { if (v === mySeat()) askVote(R, state.ply); else LavaLink.tellSeat(v, { k: 'undoVote', R: R, ply: state.ply }); });
    if (R === mySeat()) toast('Ждём ответа…');
    render();
  }
  function vote(seat, ok) {
    if (!VOTE || VOTE.need.indexOf(seat) < 0) return;
    if (!ok) { finishVote(false, seat); return; }
    VOTE.yes[seat] = 1;
    if (VOTE.need.every(function (v) { return VOTE.yes[v]; })) finishVote(true);
  }
  function finishVote(ok, by) {
    var v = VOTE; if (!v) return; VOTE = null;
    var res = { k: 'undoDone', ok: !!ok && state.ply === v.ply, R: v.R, by: by === undefined ? -1 : by };
    if (res.ok) { var ns = L.rewind(state, v.target); stopTimers(); state = ns; rv.sync(); LavaLink.update(ns); }
    sendDone(res);
  }
  function sendDone(res) { LavaLink.tellAll(res); undoDone(res); schedule(); }
  function undoDone(d) {
    undoWait = false; askFor = null; if ($('askDialog').open) $('askDialog').close();
    if (d.R === mySeat()) toast(d.ok ? 'Ход вернули' : 'Не согласились вернуть ход');
    else if (d.ok) toast(cname(d.R) + ': ход возвращён');
    render();
  }
  function askVote(R, ply) {
    askFor = { R: R, ply: ply };
    $('askText').textContent = cname(R) + ' просит вернуть свой последний ход. Согласен?';
    if (!$('askDialog').open) $('askDialog').showModal();
  }
  function answer(ok) {
    var a = askFor; askFor = null; if ($('askDialog').open) $('askDialog').close(); if (!a) return;
    var n = net(); if (!n) return;
    if (n.role === 'host') vote(mySeat(), ok); else LavaLink.tell({ k: 'undoAns', ok: ok, ply: a.ply });
  }
  $('askYes').onclick = function () { answer(true); }; $('askNo').onclick = function () { answer(false); };
  $('askDialog').addEventListener('cancel', function (e) { e.preventDefault(); answer(false); });
  function onMsg(d, from) {
    var n = net(); if (!n || !state || !d) return;
    if (n.role === 'host') {
      if (d.k === 'undoAsk' && d.ply === state.ply) hostAsk(from);
      else if (d.k === 'undoAsk') LavaLink.tellSeat(from, { k: 'undoDone', ok: false, R: from, by: -1 });
      else if (d.k === 'undoAns' && VOTE && d.ply === VOTE.ply) vote(from, !!d.ok);
    } else {
      if (d.k === 'undoVote') askVote(d.R, d.ply);
      else if (d.k === 'undoDone') undoDone(d);
    }
  }

  // ---------- старт, меню, реванш ----------
  function stopTimers() { epoch++; busy = false; pending = false; undoWait = false; clearTimeout(botTimer); clearTimeout(pendTimer); clearTimeout(resultTimer); }
  function showGame() {
    if ($('game').hidden) { $('menu').hidden = true; $('game').hidden = false; window.scrollTo(0, 0); }
    layout();
  }
  function startLocal(saved) {
    LavaLink.close(); stopTimers();
    if (saved) { state = saved.state; roles = saved.roles.slice(); gameSetup = saved.setup || null; }
    else { gameSetup = selectedSetup(); roles = gameSetup.roles.slice(); state = L.create(gameSetup); }
    shownResult = ''; if ($('result').open) $('result').close();
    $('menu').hidden = true; $('game').hidden = false; rv.reset(); buildBoard(); layout(); saveGame(); render(); schedule();
  }
  $('playBtn').onclick = function () {
    var err = setupError(); if (err) { toast(err); return; }
    if (activeCorners().some(function (c) { return S.roles[c] === 'net'; })) host(); else startLocal();
  };
  $('resumeBtn').onclick = function () { var s = readSave(); if (s) startLocal(s); };
  $('soundBtn').onclick = function () { S.sound = !S.sound; savePrefs(); if (S.sound) SFX.step(); render(); };
  function showRules() { $('rulesDialog').showModal(); }
  $('gameRulesBtn').onclick = showRules; $('rulesClose').onclick = function () { $('rulesDialog').close(); };
  function home() {
    stopTimers(); LavaLink.close(); state = null; roles = [];
    document.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); });
    $('game').hidden = true; $('menu').hidden = false;
    if (!window.IN_ROOM && location.hash) history.replaceState(null, '', location.pathname + location.search);
    renderMenu(); window.scrollTo(0, 0);
  }
  $('homeBtn').onclick = function () { var n = net(); if (n && state && !state.over) $('leaveDialog').showModal(); else { saveGame(); home(); } };
  $('endMenu').onclick = home; $('leaveConfirm').onclick = home; $('leaveCancel').onclick = function () { $('leaveDialog').close(); };
  function restart() {
    var n = net();
    if (n && (n.role !== 'host' || !state || !state.over || !n.online.every(Boolean))) return;
    stopTimers(); shownResult = '';
    ['result', 'restartDialog'].forEach(function (id) { if ($(id).open) $(id).close(); });
    if (n) { LavaLink.start(L.create(n.cfg)); return; }
    if (!gameSetup) gameSetup = { mapId: state.mapId, corners: state.players.map(function (p) { return p.corner; }), first: 0, roles: roles.slice() };
    var g = { mapId: gameSetup.mapId, corners: gameSetup.corners, first: Math.floor(Math.random() * gameSetup.corners.length) };
    state = L.create(g); roles = gameSetup.roles.slice(); rv.reset(); buildBoard(); saveGame(); render(); schedule();
  }
  $('againBtn').onclick = function () { if (net() || state.over) restart(); else $('restartDialog').showModal(); };
  $('resultAgain').onclick = restart; $('restartConfirm').onclick = restart; $('restartCancel').onclick = function () { $('restartDialog').close(); };
  $('viewBtn').onclick = function () { $('result').close(); };

  // ---------- онлайн ----------
  function renderLobby(n) {
    $('lbCode').textContent = n.ready ? n.code : '…';
    $('lbText').textContent = n.error || (n.role === 'host' ? (n.ready ? 'Отправь друзьям ссылку или код. Начнём, когда все на месте.' : 'Создаём игру…') : n.ready ? 'Выбери свободный угол и дождись старта от хозяина.' : 'Подключаюсь к игре…');
    $('lbLinkRow').hidden = n.role !== 'host' || !n.ready || !!window.IN_ROOM;
    $('lbLink').value = location.origin + location.pathname + location.search + '#' + n.code;
    $('lbStart').hidden = n.role !== 'host'; $('lbStart').disabled = !LavaLink.ready(); $('lbStart').textContent = LavaLink.ready() ? 'Играть' : 'Ждём друзей'; $('lbRetry').hidden = !n.error;
    $('lobbyMap').textContent = n.cfg ? 'Поле: ' + L.map(n.cfg.mapId).name : '';
    var box = $('lobbyPlayers'); box.innerHTML = '';
    if (n.cfg) [0, 1, 3, 2].forEach(function (c) {
      var seat = n.cfg.corners.indexOf(c), role = seat < 0 ? 'off' : n.cfg.roles[seat], me = n.role === 'host' ? role === 'human' : seat === n.seat;
      var el = document.createElement('div'); el.className = 'lp' + (me ? ' mine' : ''); el.innerHTML = A.gem(c, { id: 'l' });
      var body = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
      sm.textContent = C[c].name; b.textContent = role === 'off' ? 'пусто' : me ? 'Ты' : role === 'bot' ? 'Бот' : role === 'human' ? 'Хозяин' : n.online[seat] ? 'Друг' : 'свободно';
      body.append(sm, b); el.appendChild(body);
      if (n.role === 'guest' && role === 'net' && !n.online[seat] && !me) { var t = document.createElement('button'); t.textContent = 'Сюда'; t.onclick = function () { LavaLink.chooseSeat(seat); }; el.appendChild(t); }
      box.appendChild(el);
    });
    if (!$('lobby').open) $('lobby').showModal();
    // в комнате друг уже рядом — начинаем сразу, как только он подключился
    if (window.IN_ROOM && n.role === 'host' && LavaLink.ready() && !n.state) LavaLink.start(L.create(n.cfg));
  }
  function netChange(n) {
    if (!n.state) { renderLobby(n); return; }
    if ($('lobby').open) $('lobby').close();
    if (n.state === state) { render(); return; }
    var old = state, fresh = !old || netRound !== n.round, moved = !fresh && n.state.ply === old.ply + 1;
    netRound = n.round; roles = n.cfg.roles.slice(); gameSetup = n.cfg;
    clearTimeout(pendTimer); pending = false;
    if (fresh) {
      stopTimers(); shownResult = ''; if ($('result').open) $('result').close();
      state = n.state; VOTE = null; $('menu').hidden = true; $('game').hidden = false; rv.reset(); buildBoard(); layout(); render(); schedule(); return;
    }
    if (busy) { state = n.state; rv.sync(); return; }
    state = n.state; rv.sync(); showGame();
    if (moved) animate(old, state, after); else after();
  }
  var handlers = { change: netChange, move: function (m, seat) { commit(m, seat); }, msg: onMsg };
  function host() {
    var err = setupError(); if (err) { toast(err); return; }
    try { var cfg = selectedSetup(); stopTimers(); state = null; netRound = 0; shownResult = ''; LavaLink.host(cfg, handlers); }
    catch (e) { toast(e.message); }
  }
  function join(code) { stopTimers(); state = null; netRound = 0; shownResult = ''; LavaLink.join(code, handlers); }
  $('onCreate').onclick = function () { if (!activeCorners().some(function (c) { return S.roles[c] === 'net'; })) { S.roles = PRESETS.net.slice(); savePrefs(); renderMenu(); } host(); };
  $('onJoin').onclick = function () { $('joinRow').hidden = !$('joinRow').hidden; if (!$('joinRow').hidden) $('joinCode').focus(); };
  $('joinCode').oninput = function () { this.value = LavaLink.clean(this.value); };
  $('joinCode').onkeydown = function (e) { if (e.key === 'Enter') $('joinGo').click(); };
  $('joinGo').onclick = function () { var c = LavaLink.clean($('joinCode').value); if (c.length !== 5) { toast('В коде 5 символов'); return; } join(c); };
  $('lbStart').onclick = function () { var n = net(); if (n) LavaLink.start(L.create(n.cfg)); };
  $('lbCancel').onclick = home;
  $('lobby').addEventListener('cancel', function (e) { e.preventDefault(); home(); });
  function retry() { var n = net(); if (!n) return; if (n.role === 'guest') join(n.code); else host(); }
  $('lbRetry').onclick = retry; $('reconnectBtn').onclick = retry;
  $('copyBtn').onclick = function () {
    var v = $('lbLink').value;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Ссылка скопирована'); }, function () { $('lbLink').focus(); $('lbLink').select(); toast('Выделил ссылку — скопируй её'); });
  };
  renderMenu();
  var hash = /^#([A-Za-z0-9]{5})$/.exec(location.hash);
  if (hash) join(hash[1]);

 BoardView.attach({id:'lava',ref:function(){return state?(net()?'net:'+net().code+':'+netRound:gameSetup):null;},boards:['board'],axes:6,autoFlip:function(){var n=LavaLink.current(),i=n&&n.role==='guest'?n.seat:roles.indexOf('human');return state&&i>=0&&state.players[i].corner<2;},coords:function(){return S.coords;},setCoords:function(v){S.coords=v;savePrefs();},analysis:function(){return state&&state.over;}});
})();
