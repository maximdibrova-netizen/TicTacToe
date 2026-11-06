// One host-authoritative protocol for resignation and unanimous draw offers.
var MatchActions = (function () {
  var CHANNEL = 'match-actions-v1';
  function attach(a) {
    var ref = null, gameId = null, log = [], applied = {}, offer = null, sentVotes = {}, lastHello = 0, updating = false, dialogKey = '', answer = null, wasOver = false, finalResult = null;
    var mount = document.getElementById('game'), row = document.createElement('div');
    row.className = 'match-actions'; row.hidden = true;
    row.innerHTML = '<button type="button" id="surrenderBtn">Сдаться</button><button type="button" id="offerDrawBtn">Предложить ничью</button><button type="button" id="matchReview" hidden>Анализ</button><button type="button" id="matchSummary" hidden>Результат</button><span id="matchWait" role="status"></span>';
    mount.appendChild(row); mount.dataset.matchActions = a.id;
    var dialog = document.createElement('dialog'); dialog.id = 'matchActionDialog'; dialog.className = 'match-dialog';
    dialog.innerHTML = '<h2 id="matchQuestion"></h2><p id="matchDetail"></p><label id="matchSeatRow" hidden>Кто сдаётся? <select id="matchSeat"></select></label><div class="match-buttons"><button type="button" id="matchNo">Отмена</button><button type="button" id="matchYes">Да</button></div>';
    var result = document.createElement('dialog'); result.id = 'matchResult'; result.className = 'match-dialog';
    dialog.setAttribute('aria-labelledby', 'matchQuestion'); result.setAttribute('aria-labelledby', 'matchResultTitle');
    result.innerHTML = '<h2 id="matchResultTitle"></h2><p id="matchResultText"></p><div class="match-buttons"><button type="button" id="matchAnalyze">Анализ</button><button type="button" id="matchAgain">Ещё партию</button><button type="button" id="matchMenu">В меню</button></div>';
    document.body.appendChild(dialog); document.body.appendChild(result);
    function el(id) { return document.getElementById(id); }
    function state() { return a.state(); }
    function role() { return a.role ? a.role() : null; }
    function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
    function send(d) { if (role() && a.send) a.send(Object.assign({ t: CHANNEL, game: gameId }, d)); }
    function note(s) { if (a.notify) a.notify(s); }
    function closeQuestion() { if (dialog.open) dialog.close(); dialogKey = ''; answer = null; }
    function ask(key, title, detail, yes, no, fn, seats) {
      if (dialogKey === key) return;
      closeQuestion(); dialogKey = key; answer = fn;
      el('matchQuestion').textContent = title; el('matchDetail').textContent = detail;
      el('matchYes').textContent = yes; el('matchNo').textContent = no;
      el('matchSeatRow').hidden = !seats || seats.length < 2;
      el('matchSeat').replaceChildren();
      (seats || []).forEach(function (p) { var o = document.createElement('option'); o.value = String(p.id); o.textContent = p.label; el('matchSeat').appendChild(o); });
      dialog.showModal();
    }
    function reply(ok) { var f = answer, seat = el('matchSeat').value; closeQuestion(); if (f) f(ok, seat); refresh(); }
    el('matchYes').onclick = function () { reply(true); }; el('matchNo').onclick = function () { reply(false); };
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); reply(false); });
    result.addEventListener('cancel', function (e) { e.preventDefault(); result.close(); });
    el('matchAnalyze').onclick = function () { result.close(); closeQuestion(); a.analyze(); refresh(); };
    el('matchReview').onclick = el('matchAnalyze').onclick;
    el('matchSummary').onclick = function () { if (!result.open) result.showModal(); };
    el('matchAgain').onclick = function () { result.close(); closeQuestion(); if (a.again) a.again(); refresh(); };
    el('matchMenu').onclick = function () { result.close(); closeQuestion(); a.menu(); refresh(); if (window.IN_ROOM && parent.ROOM) parent.ROOM.home(); };
    function active(s) { return !!s && !s.over && !s.analysis && s.ready !== false && !mount.hidden; }
    function local(s) { return s.players.filter(function (p) { return s.mine.indexOf(p.id) >= 0; }); }
    function actor(s) { var mine = local(s); return mine.find(function (p) { return p.id === s.turn; }) || mine[0]; }
    function cancel(notify) { if (!offer) return; offer = null; sentVotes = {}; closeQuestion(); if (notify && role() === 'host') send({ kind: 'cancel' }); }
    function bind() { send({ kind: 'bind', log: log }); }
    function apply(r) {
      if (applied[r.id]) return;
      applied[r.id] = true;
      a.finish(r);
      var s = state();
      if (s && s.over) {
        finalResult = r;
        el('matchResultTitle').textContent = r.title;
        el('matchResultText').textContent = r.type === 'draw' ? 'Ничья по соглашению игроков.' : r.winnerLabel ? 'Победа: ' + r.winnerLabel + '.' : 'Партия завершена.';
        el('matchAgain').hidden = !a.again || role() === 'guest';
        closeQuestion(); if (a.resultModal !== false && !result.open) result.showModal();
      } else note(r.title + '. Остальные продолжают игру.');
    }
    function commit(type, seat) {
      var s = state(); if (!active(s)) return;
      var p = s.players.find(function (p) { return p.id === seat; }); if (!p) return;
      var others = s.players.filter(function (p) { return p.id !== seat; });
      var r = { id: uid(), type: type, actor: seat, title: type === 'draw' ? 'Ничья' : 'Сдача: ' + p.label, winner: others.length === 1 ? others[0].id : null, winnerLabel: others.length === 1 ? others[0].label : '' };
      cancel(false); log.push(r); send({ kind: 'commit', result: r }); apply(r); refresh();
    }
    function publishOffer() {
      if (!offer) return;
      if (offer.status === 'accepted') { commit('draw', offer.proposer); return; }
      if (offer.status === 'declined') { send({ kind: 'cancel' }); offer = null; closeQuestion(); note('Ничья отклонена. Игра продолжается.'); return; }
      send({ kind: 'offer', offer: offer }); refresh();
    }
    function request(type, seat) {
      var s = state(); if (!active(s) || !s.players.some(function (p) { return p.id === seat; })) return;
      if (role() === 'guest') { if (!gameId || a.online && !a.online()) { note('Ждём связи с хозяином игры.'); return; } send({ kind: 'request', action: type, version: s.version }); return; }
      if (type === 'resign') { commit(type, seat); return; }
      if (type !== 'draw' || offer) return;
      if (role() && a.online && !a.online()) { note('Дождитесь подключения всех игроков.'); return; }
      offer = MatchVote.create(s.players, seat, s.version, uid()); publishOffer();
    }
    el('surrenderBtn').onclick = function () {
      refresh(); var s = state(), p = s && actor(s); if (!p || !active(s)) return;
      var seats = local(s); seats.sort(function (x, y) { return x.id === p.id ? -1 : y.id === p.id ? 1 : 0; });
      ask('resign', 'Сдаться?', 'Это засчитает вам поражение.', 'Сдаться', 'Продолжить игру', function (ok, chosen) { if (ok) { var seat = seats.find(function (x) { return String(x.id) === chosen; }); if (seat) request('resign', seat.id); } }, seats);
    };
    el('offerDrawBtn').onclick = function () { refresh(); var s = state(), p = s && actor(s); if (p && active(s)) request('draw', p.id); };
    function vote(seat, ok) {
      var s = state(); if (!offer || !active(s)) return;
      if (role() === 'guest') { sentVotes[offer.id + ':' + seat] = true; send({ kind: 'vote', id: offer.id, version: s.version, ok: ok }); closeQuestion(); return; }
      offer = MatchVote.vote(offer, seat, ok, s.version); publishOffer();
    }
    function refresh() {
      if (updating) return; updating = true;
      try {
        var s = state();
        if (s && wasOver && !s.over && !s.analysis && a.resume) a.resume();
        if (!s || s.ref !== ref || wasOver && !s.over && !s.analysis) {
          ref = s && s.ref; cancel(false); log = []; applied = {}; gameId = role() === 'guest' ? null : uid(); lastHello = 0;
          finalResult = null;
          if (result.open) result.close(); closeQuestion();
          if (s && role() === 'host') bind();
        }
        wasOver = !!s && s.over;
        var visible = active(s) && local(s).length > 0, ended = !!(a.resultModal !== false && s && s.over && !s.analysis && finalResult && !mount.hidden), shown = visible || ended, changed = row.hidden === shown;
        row.hidden = !shown; mount.classList.toggle('match-actions-active', shown);
        el('surrenderBtn').hidden = el('offerDrawBtn').hidden = !visible;
        el('matchReview').hidden = el('matchSummary').hidden = !ended;
        if (s && role() === 'guest' && !gameId && Date.now() - lastHello > 1000) { lastHello = Date.now(); send({ kind: 'hello' }); }
        if (offer && (!active(s) || offer.version !== s.version || role() && a.online && !a.online())) cancel(true);
        if (!active(s)) closeQuestion();
        el('offerDrawBtn').disabled = !!offer;
        el('matchWait').textContent = offer ? 'Предложена ничья · ждём согласия' : '';
        var height = shown ? row.offsetHeight : 0;
        if (mount.style.getPropertyValue('--match-height') !== height + 'px') { mount.style.setProperty('--match-height', height + 'px'); changed = true; }
        document.body.style.setProperty('--match-height', height + 'px');
        if (changed) setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 0);
        if (offer && visible) {
          var seat = offer.pending.find(function (id) { return s.mine.indexOf(id) >= 0; });
          if (seat !== undefined && !sentVotes[offer.id + ':' + seat]) {
            var p = s.players.find(function (p) { return p.id === seat; });
            ask('vote:' + offer.id + ':' + seat, 'Согласиться на ничью?', (p ? p.label + ': ' : '') + 'соперник предлагает завершить партию вничью.', 'Принять ничью', 'Отклонить', function (ok) { vote(seat, ok); });
          } else if (dialogKey.indexOf('vote:') === 0) closeQuestion();
        }
      } finally { updating = false; }
    }
    function receive(d, from) {
      if (!d || d.t !== CHANNEL) return false;
      refresh(); var s = state(); if (!s) return true;
      if (role() === 'host') {
        if (!s.players.some(function (p) { return p.id === from && p.kind === 'remote'; }) && d.kind !== 'hello') return true;
        if (d.kind === 'hello') { bind(); return true; }
        if (d.game !== gameId || d.version !== s.version || !active(s)) return true;
        if (d.kind === 'request') request(d.action, from);
        else if (d.kind === 'vote' && offer && d.id === offer.id) { offer = MatchVote.vote(offer, from, d.ok === true, s.version); publishOffer(); }
      } else if (role() === 'guest') {
        if (d.kind === 'bind') {
          if (gameId && gameId !== d.game) { applied = {}; log = []; cancel(false); }
          gameId = d.game;
          if (Array.isArray(d.log)) d.log.forEach(function (r) { apply(r); });
        } else if (gameId && d.game === gameId) {
          if (d.kind === 'commit' && d.result) { cancel(false); apply(d.result); }
          else if (d.kind === 'offer' && active(s) && d.offer && d.offer.version === s.version) { offer = d.offer; }
          else if (d.kind === 'cancel') { cancel(false); note('Предложение ничьей закрыто. Игра продолжается.'); }
        }
      }
      refresh(); return true;
    }
    // A timer also catches menu changes, timeout and peer disconnections.
    setInterval(refresh, 200);
    refresh();
    return { refresh: refresh, receive: receive };
  }
  return { attach: attach, space:function(){var row=document.querySelector('.match-actions');return row&&!row.hidden?row.offsetHeight+8:0;} };
})();
