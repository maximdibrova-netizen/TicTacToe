// ===== Разбор партии: история ходов, оценка движка, график, варианты =====
// Общий модуль для игр на двоих. Игра даёт описание (o), модуль хранит, какую позицию сейчас показывать.
//   o.mount        — элемент, куда вставить панель (полоса оценки, график, кнопки ⏮ ◀ ▶ ⏭)
//   o.status       — элемент строки состояния (в режиме просмотра модуль пишет туда сам)
//   o.line()       — основная партия: [{ s: позиция, mv: ход или null, by: кто ходил }], [0] — начальная
//   o.play(s, mv)  — новая позиция после хода (исходную не трогать) или null, если ход невозможен
//   o.over(s)      — партия в позиции закончена?   o.toMove(s) — чья очередь
//   o.me()         — с чьей стороны считать шансы  o.side(x) — название стороны («Белые»)
//   o.moveText(e, prev) — запись хода («e3–f4»)     o.overText(s) — итог («Белые победили»)
//   o.engine()     — можно ли сейчас показывать движок (не онлайн-партия или партия окончена)
//   o.evalOn()     — показывать оценку во время своей партии (настройка)
//   o.analyze(s, cb) — оценка: cb({ p: шанс на победу того, чей ход (0..1), best: лучший ход, text?: подпись })
//   o.redraw()     — перерисовать доску (игра берёт позицию из rv.display())
//   o.relayout()   — панель поменяла высоту
//   o.extra(e, prev) — необязательно: доп. текст к ходу в просмотре (например, «шанс попадания 12%»)
//   o.noBar        — без полосы оценки и графика (только история, варианты и подсказка)
//   o.canVary()    — необязательно: можно ли сейчас играть варианты (например, только после конца партии)
var Review = function (o) {
  var css = '.rv{width:100%;display:flex;flex-direction:column;gap:6px;font-family:inherit}' +
    '.rv-bar{position:relative;height:20px;border-radius:7px;overflow:hidden;background:var(--rv-them,#3b3b46);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}' +
    '.rv-fill{position:absolute;left:0;top:0;bottom:0;width:50%;background:var(--rv-me,#e8e2d0);transition:width .35s}' +
    '.rv-txt{position:absolute;inset:0;display:grid;place-items:center;font:800 12px/1 var(--body,system-ui);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8),0 0 4px rgba(0,0,0,.6);font-variant-numeric:tabular-nums}' +
    '.rv-txt.pend{opacity:.6}' +
    '.rv-graph{height:36px;border-radius:7px;background:rgba(0,0,0,.22);cursor:pointer;display:block;width:100%}' +
    '.rv-graph .mid{stroke:rgba(255,255,255,.18);stroke-width:1}.rv-graph .ln{fill:none;stroke:rgba(255,255,255,.85);stroke-width:1.5}' +
    '.rv-graph .cur{stroke:var(--rv-accent,#f2c14e);stroke-width:2}.rv-graph .mk{stroke:#111;stroke-width:1}' +
    '.rv-graph .mk.b{fill:#ff4d4d}.rv-graph .mk.m{fill:#ff9b3d}.rv-graph .mk.i{fill:#ffe14d}' +
    '.rv-nav{display:flex;align-items:center;justify-content:center;gap:6px}' +
    '.rv-nav button{border:0;border-radius:9px;width:40px;height:32px;background:var(--rv-btn,rgba(255,255,255,.1));color:inherit;display:grid;place-items:center;cursor:pointer}' +
    '.rv-nav button:disabled{opacity:.3;cursor:default}.rv-nav button svg{width:18px;height:18px}' +
    '.rv-nav .cnt{min-width:64px;flex:0 1 auto;white-space:nowrap;text-align:center;font:800 12.5px/1 var(--body,system-ui);opacity:.85;font-variant-numeric:tabular-nums}' +
    '.rv-nav .back{width:auto;padding:0 10px;white-space:nowrap;font:800 12.5px/1 var(--body,system-ui);background:var(--rv-accent,#f2c14e);color:#1d1408}' +
    '.rv-tag{display:inline-block;font:800 10.5px/1 var(--body,system-ui);letter-spacing:.06em;text-transform:uppercase;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.14);margin-right:6px;vertical-align:2px}' +
    '.rv-tag.var{background:var(--rv-accent,#f2c14e);color:#1d1408}' +
    '.rv-vd{display:inline-block;font:800 11.5px/1 var(--body,system-ui);padding:4px 6px;border-radius:6px;margin-left:6px;color:#1d1408;vertical-align:1px}' +
    '.rv-vd.b{background:#ff6b6b}.rv-vd.m{background:#ffa552}.rv-vd.i{background:#ffe066}.rv-vd.g{background:#7fd36b}' +
    '.rv-sub{display:block;font:700 12px/1.3 var(--body,system-ui);opacity:.75;margin-top:3px}';
  if (!document.getElementById('rv-css')) { var st = document.createElement('style'); st.id = 'rv-css'; st.textContent = css; document.head.appendChild(st); }

  var I = {
    first: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 6l-7 6 7 6"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    last: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5v14M6 6l7 6-7 6"/></svg>'
  };
  var root = document.createElement('div'); root.className = 'rv';
  root.innerHTML = (o.noBar ? '' : '<div class="rv-bar" hidden><div class="rv-fill"></div><span class="rv-txt"></span></div><svg class="rv-graph" hidden></svg>') +
    '<div class="rv-nav"><button data-a="first" aria-label="К началу партии">' + I.first + '</button><button data-a="prev" aria-label="Ход назад">' + I.prev + '</button>' +
    '<span class="cnt"></span><button data-a="next" aria-label="Ход вперёд">' + I.next + '</button><button data-a="last" aria-label="К последнему ходу">' + I.last + '</button>' +
    '<button class="back" data-a="main" hidden aria-label="Вернуться к партии">↩ партия</button></div>';
  o.mount.appendChild(root);
  var q = function (s) { return root.querySelector(s); };
  var bar = q('.rv-bar'), fill = q('.rv-fill'), txt = q('.rv-txt'), graph = q('.rv-graph'), cnt = q('.cnt');
  Array.prototype.forEach.call(root.querySelectorAll('[data-a]'), function (b) {
    b.onclick = function () { var a = b.dataset.a; if (a === 'main') exitVar(); else step(a === 'first' ? 'first' : a === 'last' ? 'last' : a === 'prev' ? -1 : 1); };
  });

  // view: -1 — живая партия; k — позиция k основной партии. V — вариант: { base, list: [{ s, mv, by }], idx }
  var view = -1, V = null, hint = null, hintTok = 0, cache = new WeakMap(), busy = false, queue = [], marks = [], shown = false;

  function line() { return o.line(); }
  function lastIdx() { return line().length - 1; }
  function engine() { return !!o.engine(); }
  function liveOver() { var L = line(); return o.over(L[L.length - 1].s); }
  function evalVisible() { return !o.noBar && engine() && (o.evalOn() || liveOver() || view >= 0); }
  function cur() {
    var L = line();
    if (V) { if (V.idx < 0) return { s: L[V.base].s, e: L[V.base], prev: V.base > 0 ? L[V.base - 1].s : null, k: V.base }; var e = V.list[V.idx]; return { s: e.s, e: e, prev: V.idx > 0 ? V.list[V.idx - 1].s : L[V.base].s, k: V.base }; }
    var k = view < 0 ? L.length - 1 : view;
    return { s: L[k].s, e: L[k], prev: k > 0 ? L[k - 1].s : null, k: k };
  }

  // ---------- оценка ----------
  function pctFor(s, r) { return 100 * (o.toMove(s) === o.me() ? r.p : 1 - r.p); }
  function want(s, urgent) { if (!s || cache.has(s)) return; if (urgent) queue.unshift(s); else queue.push(s); }
  function pump() {
    if (busy || !engine()) return;
    var s = null;
    while (queue.length) { var c = queue.shift(); if (!cache.has(c)) { s = c; break; } }
    if (!s) return;
    if (o.over(s)) { var oe = o.overEval ? o.overEval(s) : { p: .5 }; if (oe) cache.set(s, oe); pump(); return; }   // итог ещё не посчитан — спросим позже
    busy = true;
    o.analyze(s, function (r) { busy = false; if (r) cache.set(s, r); paint(); pump(); });
  }
  function fillQueue() {
    if (o.noBar || !engine()) return;
    var c = cur(); want(c.s, true); if (c.prev) want(c.prev, true);
    if (evalVisible()) { var L = line(); for (var k = 0; k < L.length; k++) want(L[k].s); }
    pump();
  }
  function pctOf(s) { var r = s && cache.get(s); return r ? pctFor(s, r) : null; }
  // ход «моей» стороны, после которого мои шансы заметно упали
  function verdict(prevS, e) {
    if (!prevS || !e || e.mv == null || e.by !== o.me()) return null;
    var a = pctOf(prevS), b = pctOf(e.s);
    if (a == null || b == null || a > 97.5 || a < 2.5) return null;
    var d = Math.round(a - b);
    if (d >= 25) return { c: 'b', t: 'грубая ошибка', d: d };
    if (d >= 12) return { c: 'm', t: 'ошибка', d: d };
    if (d >= 6) return { c: 'i', t: 'неточность', d: d };
    return null;
  }

  // ---------- отрисовка панели ----------
  function paint() {
    var vis = evalVisible();
    if (bar) { if (bar.hidden === vis) { bar.hidden = !vis; graph.hidden = !vis; if (o.relayout) o.relayout(); } }
    var c = cur(), L = line(), last = L.length - 1;
    if (vis && bar) {
      var r = cache.get(c.s), s = c.s;
      var me = o.me(), meName = o.meName ? o.meName() : o.side(me);
      if (!r) { var j = V ? -1 : c.k; while (!r && j > 0) r = cache.get(L[--j].s), s = L[j].s; }
      if (!r) { fill.style.width = '50%'; txt.textContent = meName + ' …'; txt.classList.add('pend'); }
      else {
        var pc = pctFor(s, r); fill.style.width = pc + '%';
        txt.textContent = r.text ? r.text : (pc >= 99.5 ? meName + ': выигрыш' : pc <= .5 ? meName + ': проигрыш' : meName + ' ' + Math.round(pc) + '%');
        txt.classList.toggle('pend', s !== c.s);
      }
      drawGraph();
    }
    var at = V ? V.base : (view < 0 ? last : view);
    q('[data-a="first"]').disabled = q('[data-a="prev"]').disabled = !V && at <= 0;
    q('[data-a="next"]').disabled = V ? V.idx >= V.list.length - 1 : view < 0;
    q('[data-a="last"]').disabled = V ? V.idx >= V.list.length - 1 : view < 0;
    q('[data-a="main"]').hidden = !V;
    cnt.textContent = V ? 'вариант ' + (V.idx + 1) + ' / ' + V.list.length : (at === 0 ? 'старт' : 'ход ' + at) + ' / ' + last;
    if (view >= 0 || V) o.status.innerHTML = statusHtml();
  }
  function drawGraph() {
    var w = graph.clientWidth, h = graph.clientHeight; if (!w || !h) return;
    var L = line(), last = L.length - 1, n = Math.max(last, 1);
    var X = function (i) { return 4 + (w - 8) * i / n; }, Y = function (p) { return 3 + (h - 6) * (1 - p / 100); };
    var pts = [];
    for (var i = 0; i <= last; i++) { var p = pctOf(L[i].s); if (p != null) pts.push([X(i), Y(p)]); }
    var out = '<defs><clipPath id="rvTop"><rect x="0" y="0" width="' + w + '" height="' + (h / 2) + '"/></clipPath><clipPath id="rvBot"><rect x="0" y="' + (h / 2) + '" width="' + w + '" height="' + (h / 2) + '"/></clipPath></defs>' +
      '<line class="mid" x1="0" x2="' + w + '" y1="' + h / 2 + '" y2="' + h / 2 + '"/>';
    if (pts.length > 1) {
      var ln = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      var area = pts[0][0].toFixed(1) + ',' + h / 2 + ' ' + ln + ' ' + pts[pts.length - 1][0].toFixed(1) + ',' + h / 2;
      out += '<polygon clip-path="url(#rvTop)" points="' + area + '" fill="var(--rv-me,#e8e2d0)" opacity=".55"/><polygon clip-path="url(#rvBot)" points="' + area + '" fill="var(--rv-them,#3b3b46)" opacity=".9"/><polyline class="ln" points="' + ln + '"/>';
    }
    var at = V ? V.base : (view < 0 ? last : view);
    out += '<line class="cur" x1="' + X(at) + '" x2="' + X(at) + '" y1="0" y2="' + h + '"/>';
    marks = [];
    for (i = 1; i <= last; i++) { var vd = verdict(L[i - 1].s, L[i]); if (vd) { out += '<circle class="mk ' + vd.c + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(pctOf(L[i].s)).toFixed(1) + '" r="' + (vd.c === 'b' ? 5 : 4) + '"/>'; marks.push([X(i), i]); } }
    graph.setAttribute('viewBox', '0 0 ' + w + ' ' + h); graph.innerHTML = out;
  }
  if (graph) graph.addEventListener('click', function (e) {
    var rc = graph.getBoundingClientRect(), x = e.clientX - rc.left, L = line(), n = Math.max(L.length - 1, 1);
    var mk = marks.filter(function (m) { return Math.abs(m[0] - x) <= 10; }).sort(function (a, b) { return Math.abs(a[0] - x) - Math.abs(b[0] - x); })[0];
    if (mk) { go(mk[1] - 1); showHint(); return; }
    go(Math.max(0, Math.min(L.length - 1, Math.round((x - 4) / (rc.width - 8) * n))));
  });

  function statusHtml() {
    var c = cur(), e = c.e, tag = V ? '<span class="rv-tag var">Вариант</span>' : '<span class="rv-tag">Просмотр</span>';
    var L = line(), at = V ? V.base + V.idx + 1 : c.k, body;
    if (!V && c.k === 0) body = 'Начало партии';
    else if (V && V.idx < 0) body = 'Позиция после хода ' + V.base + ' — сделай ход';
    else body = 'Ход ' + at + ': ' + o.side(e.by) + ' ' + o.moveText(e, c.prev);
    var vd = verdict(c.prev, e), h = tag + body + (vd ? '<span class="rv-vd ' + vd.c + '">' + vd.t + ' −' + vd.d + '%</span>' : '');
    var ex = o.extra && e && e.mv != null && e.mv !== undefined && (V ? V.idx >= 0 : c.k > 0) ? o.extra(e, c.prev) : '';
    if (o.over(c.s)) ex = (ex ? ex + ' · ' : '') + o.overText(c.s);
    else if (canPlay()) ex = (ex ? ex + ' · ' : '') + 'можно сходить и посмотреть, что будет';
    return h + (ex ? '<span class="rv-sub">' + ex + '</span>' : '');
  }

  // ---------- навигация ----------
  function go(k) {
    var last = lastIdx(); V = null; clearHint();
    view = k >= last || k < 0 ? -1 : k;
    shown = view >= 0;
    fillQueue(); paint(); o.redraw();
  }
  function step(d) {
    if (V) {
      if (d === 'first') { go(0); return; }
      if (d === -1 && V.idx < 0) { go(Math.max(0, V.base - 1)); return; }
      if (d === 'last') V.idx = V.list.length - 1; else V.idx = Math.max(-1, Math.min(V.list.length - 1, V.idx + d));
      clearHint(); fillQueue(); paint(); o.redraw(); return;
    }
    var last = lastIdx(), at = view < 0 ? last : view;
    if (d === 'first') go(0); else if (d === 'last') go(-1); else go(Math.max(0, Math.min(last, at + d)));
  }
  function exitVar() { if (!V) return; var b = V.base; V = null; go(b); }
  function canPlay() { return engine() && (view >= 0 || !!V) && !o.over(cur().s) && (!o.canVary || o.canVary()); }
  function play(mv) {
    if (!canPlay()) return false;
    var c = cur(), ns = o.play(c.s, mv); if (!ns) return false;
    var by = o.byOf ? o.byOf(c.s, mv) : o.toMove(c.s), L = line();
    if (!V) V = { base: view < 0 ? L.length - 1 : view, list: [], idx: -1 };
    // если этот ход есть в основной партии — просто идём по ней
    if (V.idx < 0 && V.base + 1 < L.length && o.same && o.same(L[V.base + 1].mv, mv)) { var nb = V.base + 1; V = null; go(nb); return true; }
    V.list.length = V.idx + 1; V.list.push({ s: ns, mv: mv, by: by }); V.idx++;
    view = V.base; clearHint(); fillQueue(); paint(); o.redraw();
    return true;
  }

  // ---------- подсказка ----------
  function clearHint() { hintTok++; hint = null; }
  function showHint(cb) {
    if (!engine()) return false;
    var c = cur(); if (o.over(c.s)) return false;
    var my = ++hintTok, s = c.s;
    var done = function (r) { if (my !== hintTok || cur().s !== s) return; hint = r && r.best != null ? r.best : null; o.redraw(); if (cb) cb(hint); };
    var r = cache.get(s);
    if (r && r.best != null) { done(r); return true; }
    if (o.hint) o.hint(s, done); else o.analyze(s, function (r2) { if (r2) cache.set(s, r2); paint(); done(r2); });
    return true;
  }

  document.addEventListener('keydown', function (e) {
    if (!o.active || !o.active() || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
    var k = e.key;
    if (k === 'ArrowLeft') step(-1); else if (k === 'ArrowRight') step(1); else if (k === 'Home') step('first'); else if (k === 'End') step('last'); else return;
    e.preventDefault();
  });
  window.addEventListener('resize', function () { if (graph && !graph.hidden) drawGraph(); });

  return {
    el: root,
    // что показывать на доске: { mode: 'live'|'view'|'var', s, e (ход, который привёл сюда), hint }
    display: function () { var c = cur(); return { mode: V ? 'var' : view >= 0 ? 'view' : 'live', s: c.s, e: c.e, prev: c.prev, hint: hint, k: c.k }; },
    viewing: function () { return view >= 0 || !!V; },
    inVar: function () { return !!V; },
    canPlay: canPlay,
    play: play,
    go: go, step: step, exitVar: exitVar,
    hint: showHint, clearHint: function () { clearHint(); },
    // после изменения основной партии (новый ход, отмена, новая партия)
    sync: function () {
      var last = lastIdx();
      if (view > last) view = -1;
      if (V && V.base > last) V = null;
      if (view === last && !V) view = -1;
      if (view < 0 && !V) clearHint();
      fillQueue(); paint();
    },
    reset: function () { view = -1; V = null; clearHint(); queue = []; cache = new WeakMap(); fillQueue(); paint(); },
    refresh: function () { fillQueue(); paint(); },
    // путь от начала до показанной позиции (для «играть с этой позиции»)
    pathHere: function () {
      var L = line(), out = [], base = V ? V.base : (view < 0 ? L.length - 1 : view);
      for (var k = 1; k <= base; k++) out.push(L[k].mv);
      if (V) for (k = 0; k <= V.idx; k++) out.push(V.list[k].mv);
      return out;
    },
    evalVisible: evalVisible,
    evalOf: function (s) { return cache.get(s); },
    statusHtml: statusHtml
  };
};
