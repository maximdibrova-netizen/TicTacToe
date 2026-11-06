// Общие часы. Состояние партии предоставляет маленький адаптер каждой игры:
//   a.state() → { game, turn, moves, over, ready, active?: [места в игре], paused?: true пока идёт анимация хода }
// Настройка времени — карточка в меню игры (классы .card/.seg берутся из оформления самой игры).
var GameClock = (function () {
  var PRESETS = [[1, 0], [3, 2], [5, 3], [10, 5], [15, 10], [30, 0]];
  var MIN_STEPS = [0.5, 1, 2, 3, 4, 5, 7, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180];
  var INC_STEPS = [0, 1, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60];
  function stepIn(list, v, d) {
    var i = 0, best = Infinity;
    list.forEach(function (x, k) { var e = Math.abs(x - v); if (e < best) { best = e; i = k; } });
    return list[Math.max(0, Math.min(list.length - 1, i + d))];
  }
  function fmtMin(m) { return m < 1 ? '½' : String(m); }
  function fmtTime(m, s) { return fmtMin(m) + ' мин' + (s ? ' + ' + s + ' с' : ''); }

  function attach(a) {
    var model = null, game = null, lastMove = 0, ended = false, received = 0, lastSend = 0, paused = false;
    var n = a.labels.length;
    // ---------- settings ----------
    // cfg: { enabled, preset: 'off'|'1+0'|…|'custom', min, inc, per: bool, pmin: [], pinc: [] }
    var cfg = { enabled: false, preset: 'off', min: 5, inc: 3, per: false, pmin: a.labels.map(function () { return 5; }), pinc: a.labels.map(function () { return 3; }) };
    try {
      var sv = JSON.parse(localStorage.getItem('clock-' + a.id) || 'null');
      if (sv && sv.v === 2) Object.assign(cfg, sv);
      else if (sv && Array.isArray(sv.left)) {            // старый формат: { enabled, left[ms], inc[ms] }
        cfg.enabled = !!sv.enabled; cfg.preset = sv.enabled ? 'custom' : 'off';
        cfg.pmin = sv.left.map(function (x) { return x / 60000; }); cfg.pinc = sv.inc.map(function (x) { return x / 1000; });
        cfg.min = cfg.pmin[0]; cfg.inc = cfg.pinc[0]; cfg.per = cfg.pmin.some(function (x, i) { return x !== cfg.pmin[0] || cfg.pinc[i] !== cfg.pinc[0]; });
      }
    } catch (e) {}
    while (cfg.pmin.length < n) { cfg.pmin.push(cfg.min); cfg.pinc.push(cfg.inc); }

    var root = document.createElement('div'); root.className = 'card gc-card';
    root.innerHTML = '<h2>Время на партию</h2>' +
      '<div class="seg gc-presets" style="--cols:4">' +
      '<button type="button" data-p="off">Без часов</button>' +
      PRESETS.map(function (p) { return '<button type="button" data-p="' + p[0] + '+' + p[1] + '"><b>' + p[0] + '+' + p[1] + '</b><small>' + (p[0] + p[1] * 40 / 60 < 3 ? 'пуля' : p[0] + p[1] * 40 / 60 < 10 ? 'блиц' : 'рапид') + '</small></button>'; }).join('') +
      '<button type="button" data-p="custom"><b>Своё</b><small>настроить</small></button></div>' +
      '<div class="gc-custom" hidden>' +
      '<div class="gc-step" data-k="min"><span>Минут на партию</span><button type="button" data-d="-1" aria-label="Меньше минут">−</button><output></output><button type="button" data-d="1" aria-label="Больше минут">+</button></div>' +
      '<div class="gc-step" data-k="inc"><span>Добавка за ход</span><button type="button" data-d="-1" aria-label="Меньше секунд">−</button><output></output><button type="button" data-d="1" aria-label="Больше секунд">+</button></div>' +
      '<label class="gc-per"><input type="checkbox"> Разное время игрокам (фора)</label>' +
      '<div class="gc-players" hidden>' + a.labels.map(function (lab, i) {
        return '<div class="gc-prow"><b>' + lab + '</b>' +
          '<div class="gc-step sm" data-k="pmin" data-i="' + i + '"><button type="button" data-d="-1" aria-label="' + lab + ': меньше минут">−</button><output></output><button type="button" data-d="1" aria-label="' + lab + ': больше минут">+</button></div>' +
          '<div class="gc-step sm" data-k="pinc" data-i="' + i + '"><button type="button" data-d="-1" aria-label="' + lab + ': меньше добавки">−</button><output></output><button type="button" data-d="1" aria-label="' + lab + ': больше добавки">+</button></div></div>';
      }).join('') + '</div></div>' +
      '<p class="gc-note"></p>';
    var menu = document.querySelector('#menu .col, #menu .menu-col') || document.querySelector('#menu');
    var play = menu.querySelector('#playBtn'); if (play) { var anchor = play; while (anchor.parentElement !== menu) anchor = anchor.parentElement; menu.insertBefore(root, anchor); } else menu.appendChild(root);

    function times() {
      if (!cfg.enabled) return null;
      var m = [], s = [];
      for (var i = 0; i < n; i++) {
        if (cfg.preset !== 'custom') { var p = cfg.preset.split('+'); m.push(+p[0]); s.push(+p[1]); }
        else if (cfg.per) { m.push(cfg.pmin[i]); s.push(cfg.pinc[i]); }
        else { m.push(cfg.min); s.push(cfg.inc); }
      }
      return { m: m, s: s };
    }
    function config() {
      var t = times();
      if (!t) return { enabled: false, left: [], inc: [] };
      return { enabled: true, left: t.m.map(function (x) { return Math.round(x * 60000); }), inc: t.s.map(function (x) { return x * 1000; }) };
    }
    function save() { cfg.v = 2; try { localStorage.setItem('clock-' + a.id, JSON.stringify(cfg)); } catch (e) {} }
    function paint() {
      Array.prototype.forEach.call(root.querySelectorAll('[data-p]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.p === (cfg.enabled ? cfg.preset : 'off'))); });
      var custom = cfg.enabled && cfg.preset === 'custom';
      root.querySelector('.gc-custom').hidden = !custom;
      root.querySelector('.gc-per input').checked = !!cfg.per;
      root.querySelector('.gc-players').hidden = !cfg.per;
      root.querySelector('[data-k="min"]').hidden = root.querySelector('[data-k="inc"]').hidden = !!cfg.per;
      root.querySelector('[data-k="min"] output').textContent = fmtMin(cfg.min) + ' мин';
      root.querySelector('[data-k="inc"] output').textContent = cfg.inc + ' с';
      Array.prototype.forEach.call(root.querySelectorAll('[data-k="pmin"]'), function (el) { el.querySelector('output').textContent = fmtMin(cfg.pmin[+el.dataset.i]) + ' мин'; });
      Array.prototype.forEach.call(root.querySelectorAll('[data-k="pinc"]'), function (el) { el.querySelector('output').textContent = '+' + cfg.pinc[+el.dataset.i] + ' с'; });
      var t = times(), note = root.querySelector('.gc-note');
      if (!t) note.textContent = 'Играете без ограничения времени.';
      else {
        var same = t.m.every(function (x, i) { return x === t.m[0] && t.s[i] === t.s[0]; });
        note.textContent = (same ? 'У каждого ' + fmtTime(t.m[0], t.s[0]) + (t.s[0] ? ' за ход' : '') : a.labels.map(function (l, i) { return l + ': ' + fmtTime(t.m[i], t.s[i]); }).join(' · ')) +
          '. Время кончилось — партия проиграна. Онлайн у всех время хозяина игры.';
      }
    }
    root.addEventListener('click', function (e) {
      var p = e.target.closest('[data-p]');
      if (p) { if (p.dataset.p === 'off') cfg.enabled = false; else { cfg.enabled = true; cfg.preset = p.dataset.p; } save(); paint(); return; }
      var d = e.target.closest('[data-d]'); if (!d) return;
      var st = d.closest('.gc-step'), k = st.dataset.k, dir = +d.dataset.d, i = +st.dataset.i;
      if (k === 'min') cfg.min = stepIn(MIN_STEPS, cfg.min, dir);
      else if (k === 'inc') cfg.inc = stepIn(INC_STEPS, cfg.inc, dir);
      else if (k === 'pmin') cfg.pmin[i] = stepIn(MIN_STEPS, cfg.pmin[i], dir);
      else if (k === 'pinc') cfg.pinc[i] = stepIn(INC_STEPS, cfg.pinc[i], dir);
      save(); paint();
    });
    root.querySelector('.gc-per input').addEventListener('change', function () {
      cfg.per = this.checked;
      if (cfg.per) for (var i = 0; i < n; i++) { cfg.pmin[i] = cfg.min; cfg.pinc[i] = cfg.inc; }
      save(); paint();
    });
    paint();

    // ---------- clock faces in the game ----------
    var bar = document.createElement('div'); bar.className = 'gc-bar'; bar.hidden = true; document.getElementById('game').prepend(bar);
    var result = document.createElement('div'); result.className = 'gc-result'; result.hidden = true; result.setAttribute('role', 'dialog'); result.setAttribute('aria-label', 'Партия завершена по времени');
    result.innerHTML = '<div><h2>Время вышло</h2><p></p><div class="gc-result-actions"><button type="button" class="gc-analyze">Анализ</button><button type="button" class="gc-menu">В меню</button></div></div>'; document.body.appendChild(result);
    result.querySelector('.gc-menu').onclick = function () { result.hidden = true; a.menu(); sync(); };
    result.querySelector('.gc-analyze').onclick = function () { result.hidden = true; a.analyze(); sync(); };
    function guest() { return a.role() === 'guest'; }
    function expire() {
      if (!model || model.flag === null || ended) return;
      ended = true; a.expire(model.flag); result.querySelector('p').textContent = a.labels[model.flag] + ' — поражение по времени. Партия окончена.'; result.hidden = a.resultModal === false;
    }
    function packet() { return model ? { left: model.left.slice(), inc: model.inc.slice(), turn: model.turn, running: model.running && !paused, flag: model.flag } : null; }
    function publish() { if (a.role() === 'host') { a.send({ t: 'clock-v1', clock: packet() }); lastSend = Date.now(); } }
    function sync() {
      var s = a.state(), now = Date.now();
      if (!s) { game = null; model = null; bar.hidden = true; result.hidden = true; paused = false; return; }
      if (game !== s.game) { game = s.game; lastMove = s.moves; ended = false; result.hidden = true; received = 0; var c = config(); model = !guest() && c.enabled && s.ready ? new FischerClock(c.left, c.inc, s.turn, now) : null; }
      if (!model && !guest() && s.ready && !s.over) { var c2 = config(); if (c2.enabled) model = new FischerClock(c2.left, c2.inc, s.turn, now); }
      var wasPaused = paused; paused = !!s.paused;
      if (model && !guest()) {
        if (s.moves > lastMove) {
          // Removing a resigned seat changes history/turn, but is not a played move.
          if (s.noIncrement) { model.tick(now); model.turn = s.turn; }
          else model.move(s.turn, now);
        }
        else if (paused) model.at = now;          // анимация хода: часы стоят
        else model.tick(now);
        // При отмене хода сохраняем потраченное время, не добавляем прибавку.
        if (s.moves < lastMove) { model.turn = s.turn; if (model.flag === null) model.running = !s.over; }
        if (s.over) model.stop(now);
        lastMove = s.moves; expire();
        if (now - lastSend > 500 || wasPaused !== paused) publish();
      }
      draw();
    }
    function draw() {
      bar.hidden = !model; var timed = !!model;
      if (document.body.classList.contains('gc-timed') !== timed) { document.body.classList.toggle('gc-timed', timed); setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 0); }
      if (!model) return;
      var now = Date.now(), s = a.state();
      bar.innerHTML = a.labels.map(function (label, i) {
        if (s && s.active && s.active.indexOf(i) < 0) return '';
        var ms = model.left[i]; if (guest() && model.running && i === model.turn) ms = Math.max(0, ms - (now - received));
        var sec = Math.ceil(ms / 1000), text = ms < 10000 ? (ms / 1000).toFixed(1) : Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2);
        return '<div class="gc-face ' + (model.running && i === model.turn ? 'gc-active ' : '') + (ms < 10000 ? 'gc-low' : '') + '"><span>' + label + (model.inc[i] ? ' <small>+' + model.inc[i] / 1000 + '</small>' : '') + '</span><strong>' + text + '</strong></div>';
      }).join('');
    }
    function receive(d) {
      if (!d || d.t !== 'clock-v1') return false;
      if (!guest()) return true;
      sync(); var c = d.clock;
      if (c && Array.isArray(c.left) && c.left.length === a.labels.length && Array.isArray(c.inc) && Number.isInteger(c.turn) && c.turn >= 0 && c.turn < a.labels.length && c.left.every(function (x) { return Number.isFinite(x) && x >= 0; })) {
        model = new FischerClock(c.left, c.inc, c.turn, Date.now()); model.running = !!c.running; model.flag = c.flag; received = Date.now(); expire();
      } else model = null;
      draw(); return true;
    }
    function before() { sync(); return !(model && model.flag !== null); }
    setInterval(sync, 100);
    // для бота: сколько осталось у каждого (мс) и добавка
    function info() { if (!model) return null; sync(); return { left: model.left.slice(), inc: model.inc.slice(), running: model.running }; }
    return { sync: sync, before: before, receive: receive, publish: publish, info: info, settings: root, enabled: function () { return !!model; } };
  }
  return { attach: attach };
})();
