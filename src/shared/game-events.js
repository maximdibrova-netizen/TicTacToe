// Structured lifecycle facts shared by the catalogue, simultaneous games and ratings.
// This module never decides rating changes and never exposes private board/hand data.
var GameEvents = (function () {
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value); } return value; }
  function publish(event) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('game:state', { detail: event }));
    try { if (window.parent !== window && window.parent.ROOM && window.parent.ROOM.gameEvent) window.parent.ROOM.gameEvent(window, event); } catch (_) {}
  }
  function service(event) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('game:service', { detail: event })); }
  function create(emit, emitService) {
    emit = emit || publish; emitService = emitService || service;
    var providers = [], clocks = {}, latest = null, policy = { rated: false, ready: true, session: null };
    function attach(a, options) {
      options = options || {}; var contexts = Object.create(null), context = null, origins = Object.create(null), pendingOrigin = null, pendingResults = Object.create(null), pendingEliminations = Object.create(null);
      var meta = a.events || {};
      function getState() { return a.state ? a.state() : null; }
      function getToken() { return options.token ? options.token() : null; }
      function normalize(result, roster) {
        if (!result) return null;
        if (result.draw) return { draw: true, winners: [], reason: result.reason || 'draw' };
        var winners = Array.isArray(result.winners) ? result.winners : result.winner !== undefined && result.winner !== null ? [result.winner] : [];
        winners = winners.filter(function (id, i) { return winners.indexOf(id) === i && roster.some(function (p) { return p.id === id; }); });
        return winners.length ? { draw: false, winners: winners, reason: result.reason || 'normal' } : null;
      }
      function refresh() {
        var s = getState(), token = getToken();
        if (!s || s.analysis || s.ready === false || !token) { if (context && latest && latest.token === context.token) latest = null; return null; }
        token = String(token);
        context = contexts[token];
        if (!context) {
          var players = (meta.fullPlayers ? meta.fullPlayers(s) : s.players || []).map(function (p) { return { id: p.id, kind: p.kind, label: p.label || String(p.id) }; });
          var origin = origins[token] || pendingOrigin || {};
          pendingOrigin = null;
          var online = !!(a.role && a.role()) || players.some(function (p) { return p.kind === 'remote'; });
          context = contexts[token] = {
            token: token, players: copy(players), mine: copy(s.mine || []),
            mode: online ? 'online' : players.some(function (p) { return p.kind === 'bot'; }) ? 'bot' : 'local',
            continued: typeof origin.continued === 'boolean' ? origin.continued : !!(meta.continued && meta.continued(s)),
            evaluationEnabled: typeof origin.evaluationEnabled === 'boolean' ? origin.evaluationEnabled : !!(meta.evaluation && meta.evaluation(s)),
            botLevel: meta.botLevel ? meta.botLevel(s) : null,
            clock: copy(origin.clock || clocks[a.id] || { enabled: false, left: [], inc: [] }),
            eliminated: copy(origin.eliminated || pendingEliminations[token] || []),
            started: false, done: false, signature: '', override: pendingResults[token] || null, clockLoser: undefined
          };
        }
        if (!s.over && meta.eliminated) (meta.eliminated(s) || []).forEach(function (id) { if (context.eliminated.indexOf(id) < 0) context.eliminated.push(id); });
        var result = null;
        if (s.over) {
          result = normalize(context.override || (meta.result && meta.result(s)), context.players);
          if (context.clockLoser !== undefined) {
            result = result || normalize({ winners: context.players.filter(function (p) { return p.id !== context.clockLoser; }).map(function (p) { return p.id; }) }, context.players);
            if (result) result.reason = 'time';
          }
        }
        if (result && result.draw && context.eliminated.length) result.eliminated = context.eliminated.slice();
        if (context.done) result = context.result;
        var score = result && context.mine.length === 1 ? result.draw ? result.eliminated && result.eliminated.indexOf(context.mine[0]) >= 0 ? 0 : .5 : result.winners.indexOf(context.mine[0]) >= 0 ? 1 : 0 : null;
        var event = {
          game: a.id, token: token, phase: !context.started ? 'start' : result && !context.done ? 'result' : 'update',
          mode: context.mode, players: copy(context.players), mine: copy(context.mine),
          version: s.version, turn: s.turn, over: !!s.over, result: result,
          score: score, evaluationEnabled: context.evaluationEnabled, continued: context.continued,
          botLevel: context.botLevel == null ? null : copy(context.botLevel),
          clock: copy(context.clock)
        };
        var signature = JSON.stringify([event.version, event.turn, event.over, event.result, event.clock, event.evaluationEnabled]);
        latest = freeze(copy(event));
        if (!context.started) {
          context.started = true; context.signature = signature; emit(latest);
          if (result) { event.phase = 'result'; context.done = true; context.result = copy(result); latest = freeze(copy(event)); emit(latest); }
        } else if (!context.done && (event.phase === 'result' || signature !== context.signature)) {
          context.signature = signature;
          if (event.phase === 'result') { context.done = true; context.result = copy(result); }
          emit(latest);
        }
        return latest;
      }
      function origin() {
        refresh();
        return context ? { continued: context.continued, evaluationEnabled: context.evaluationEnabled, clock: copy(context.clock), eliminated: context.eliminated.slice() } : null;
      }
      function setOrigin(value) { if (!value || typeof value !== 'object') return; var token = getToken(); if (token) origins[String(token)] = copy(value); else pendingOrigin = copy(value); }
      function adjudicate(result) {
        var s = getState(), token = getToken();
        if (!s || !token || !result) return;
        var prior = contexts[String(token)];
        if (result.type === 'resign' && result.winner == null) {
          var eliminated = prior ? prior.eliminated : pendingEliminations[String(token)] || (pendingEliminations[String(token)] = []);
          if (eliminated.indexOf(result.actor) < 0) eliminated.push(result.actor);
          return;
        }
        if (!s.over || result.type !== 'draw' && result.winner == null) return;
        var value = result.type === 'draw' ? { draw: true, winners: [], reason: 'agreement' } : { draw: false, winners: [result.winner], reason: result.type || 'resign' };
        var ctx = contexts[String(token)]; if (!ctx) { pendingResults[String(token)] = value; return; }
        if (!ctx.done) ctx.override = value;
      }
      function expire(index) {
        refresh(); var token = getToken(), ctx = token && contexts[String(token)];
        if (!ctx || ctx.done) return;
        var seats = meta.clockSeats ? meta.clockSeats() : ctx.players.map(function (p) { return p.id; });
        ctx.clockLoser = seats[index];
      }
      var provider = { refresh: refresh, origin: origin, setOrigin: setOrigin, adjudicate: adjudicate, expire: expire, adapter: a };
      providers.push(provider); return provider;
    }
    function flush() { providers.forEach(function (p) { p.refresh(); }); return latest; }
    function current() { return latest ? freeze(copy(latest)) : null; }
    function clock(id, value) { clocks[id] = { enabled: !!value.enabled, left: (value.left || []).slice(), inc: (value.inc || []).slice() }; }
    function expire(id, index) { providers.filter(function (p) { return p.adapter.id === id; }).forEach(function (p) { p.expire(index); }); }
    function configure(value) { policy = { rated: !!(value && value.rated), ready: !value || value.ready !== false, session: value && value.session || null }; return freeze(copy(policy)); }
    function waiting() { return policy.rated && !policy.ready; }
    function role() { for (var i = providers.length - 1; i >= 0; i--) { var a = providers[i].adapter; if (a.role && a.role()) return a.role(); } return null; }
    function allows(action) {
      if (!policy.rated || ['undo', 'rematch', 'hint'].indexOf(action) < 0) return true;
      var s = providers.length ? providers[providers.length - 1].adapter.state() : null;
      if (action === 'hint' && s && (s.over || s.analysis)) return true;
      if (action === 'undo' && s && s.analysis) return true;
      return false;
    }
    function send(data) {
      for (var i = providers.length - 1; i >= 0; i--) {
        var a = providers[i].adapter;
        if (a.role && a.role() && a.send) { a.send({ t: 'ratings-v1', data: data }); return true; }
      }
      return false;
    }
    function receive(message, from) { if (!message || message.t !== 'ratings-v1') return false; emitService({ data: message.data, from: from }); return true; }
    return { attach: attach, current: current, flush: flush, clock: clock, expire: expire, configure: configure, setPolicy: configure, policy: function () { return freeze(copy(policy)); }, waiting: waiting, role: role, allows: allows, send: send, receive: receive };
  }
  var api = create(); api.create = create;
  try { if (typeof window !== 'undefined' && window.parent !== window && window.parent.ROOM && window.parent.ROOM.context && window.parent.ROOM.context().ranked) api.configure({ rated: true, ready: false }); } catch (_) {}
  if (typeof document !== 'undefined') {
    var undo = '#undoBtn,#endUndo', rematch = '#againBtn,#endAgain,#resultAgain,#matchAgain', hints = '#hintBtn,#bestMove,#ckBestMove,#hintArrowsToggle';
    var scheduled = false;
    function later() { if (scheduled) return; scheduled = true; Promise.resolve().then(function () { scheduled = false; api.flush(); }); }
    function capture(event) {
      api.flush();
      var target = event.target && event.target.closest ? event.target : null;
      if (api.waiting() && target && target.closest('#board,#big,#tiles,#myGrid,#enGrid,#passBtn,#stayBtn,#hand,#dropZone')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      var action = target && target.closest(undo) ? 'undo' : target && target.closest(rematch) ? 'rematch' : target && target.closest(hints) ? 'hint' : 'move';
      if (event.type === 'click' && !api.allows(action)) {
        event.preventDefault(); event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('game:policy', { detail: { action: action, session: api.policy().session } })); return;
      }
      if (event.type === 'keydown' && api.policy().rated && (event.ctrlKey || event.metaKey) && /^[zZяЯ]$/.test(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      later();
    }
    ['pointerdown', 'click', 'keydown'].forEach(function (name) { document.addEventListener(name, capture, true); });
  }
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GameEvents;
