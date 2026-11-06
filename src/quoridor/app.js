(function () {
  'use strict';

  const Q = Quoridor, $ = id => document.getElementById(id);
  const ID = 'quoridor', PREFIX = 'quoridor-v1-';
  const COLORS = ['#f1817c', '#76c5f2', '#85d5a9', '#bba2f3'];
  const DARK = ['#9d4445', '#305e8f', '#3d8262', '#6b4e9f'];
  const NAMES = ['Красные', 'Синие', 'Зелёные', 'Фиолетовые'];
  const LEVELS = ['Лёгкая', 'Средняя', 'Сильная'];
  const ERRORS = {
    cross: 'Стены не могут пересекаться.',
    overlap: 'Здесь уже проходит другая стена.',
    blocked: 'Эта стена перекроет последний путь к цели.',
    empty: 'Стены закончились.',
    outside: 'Выбери стык внутри поля.',
    over: 'Партия уже закончена.'
  };
  const settings = {mode: 'bot', count: 2, side: 0, level: 1};
  try { Object.assign(settings, JSON.parse(localStorage.getItem(ID + '-settings') || '{}')); } catch (e) {}
  if (!['bot','duo','net'].includes(settings.mode)) settings.mode = 'bot';
  if (settings.count !== 4) settings.count = 2;
  if (!Number.isInteger(settings.side) || settings.side < 0 || settings.side >= settings.count) settings.side = 0;
  if (!LEVELS[settings.level]) settings.level = 1;

  let game = null, epoch = 0, toastTimer = 0, continuation = null, lastJoin = null;
  let tool = 'p', selected = null, hovering = null, wallFocus = 27;

  const save = () => { try { localStorage.setItem(ID + '-settings', JSON.stringify(settings)); } catch (e) {} };
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
  }
  function setPressed(root, key, value) {
    root.querySelectorAll('[data-' + key + ']').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === String(value))));
  }
  function renderMenu() {
    const online = settings.mode === 'net', count = online ? 2 : settings.count;
    if (settings.side >= count) settings.side = 0;
    setPressed($('modeSeg'), 'mode', settings.mode);
    setPressed($('countSeg'), 'count', settings.count);
    setPressed($('levelSeg'), 'level', settings.level);
    $('countCard').hidden = online;
    $('sideCard').hidden = settings.mode === 'duo';
    $('levelCard').hidden = settings.mode !== 'bot';
    $('netCard').hidden = !online;
    $('playBtn').hidden = online;
    clock.settings.hidden = count === 4;
    $('sideSeg').style.setProperty('--seats', count);
    $('sideSeg').innerHTML = COLORS.slice(0,count).map((color,i) =>
      '<button data-side="'+i+'"><i class="side-dot" style="--seat:'+color+'"></i>'+NAMES[i]+'</button>').join('');
    setPressed($('sideSeg'), 'side', settings.side);
  }
  for (const [id,key] of [['modeSeg','mode'],['countSeg','count'],['sideSeg','side'],['levelSeg','level']]) {
    $(id).addEventListener('click', e => {
      const button = e.target.closest('[data-'+key+']');
      if (!button) return;
      settings[key] = key === 'mode' ? button.dataset[key] : Number(button.dataset[key]);
      renderMenu(); save();
    });
  }

  // The same engine runs on a worker for play and analysis.
  let worker = null, job = 0;
  const waiting = new Map();
  try {
    const source = $('core').textContent + '\nself.onmessage=function(e){var d=e.data;try{postMessage({id:d.id,result:Quoridor.think(d.state,d.level)});}catch(err){postMessage({id:d.id,result:null});}};';
    const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = e => {
      const cb = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (cb) cb(e.data.result);
    };
    worker.onerror = () => {
      worker.terminate(); worker = null;
      for (const cb of waiting.values()) cb(null);
      waiting.clear();
    };
  } catch (e) {}
  function think(state, level, cb) {
    if (worker) {
      const id = ++job;
      waiting.set(id, cb);
      try { worker.postMessage({id, state, level}); return; }
      catch (e) { waiting.delete(id); }
    }
    setTimeout(() => cb(Q.think(state, Math.min(level, 1))), 0);
  }

  function canLive() {
    return !!game && !Q.over(game.state) && !game.motion && !game.pending && !game.thinking
      && game.roles[game.state.turn] === 'human' && (!game.online || Net2P.online());
  }
  function canUse(display) {
    return display.mode === 'live' ? canLive() : !game.motion && review.canPlay();
  }
  function name(seat) { return NAMES[seat]; }
  const blankLine = [{s: Q.create(), mv: null, by: null}];
  const review = Review({
    mount: $('rvMount'), status: $('status'), noBar: true,
    line: () => game ? game.line : blankLine,
    play: Q.play, over: Q.over, toMove: s => s.turn,
    me: () => game && game.side != null ? game.side : 0,
    side: name, same: (a,b) => a === b, moveText: e => Q.notation(e.mv),
    overText: s => s.draw ? 'Ничья' : name(s.winner) + ' победили',
    engine: () => !!game && (!game.online || Q.over(game.state)),
    evalOn: () => true,
    analyze: (s, cb) => think(s, 1, result => cb(result || Q.think(s, 0))),
    redraw: () => { if (game) { resetTool(); render(); runBot(); } },
    active: () => !!game && !$('game').hidden && !$('lobby').open
  });

  function newGame(options) {
    const line = Q.replay(options.count, options.keys || []);
    epoch++;
    game = {
      ...options, line, keys: line.slice(1).map(e => e.mv), state: line.at(-1).s,
      motion: null, pending: false, thinking: false
    };
    continuation = null;
    if ($('lobby').open) $('lobby').close();
    $('menu').hidden = true; $('game').hidden = false;
    resetTool(); review.reset(); render(); runBot();
  }
  function localRoles(count, mode, side) {
    return Array.from({length:count}, (_,i) => mode === 'bot' && i !== side ? 'bot' : 'human');
  }
  function startLocal() {
    Net2P.close();
    newGame({count:settings.count, side:settings.mode === 'bot' ? settings.side : null,
      roles:localRoles(settings.count,settings.mode,settings.side), level:settings.level});
  }

  const STEP = 51, ORIGIN = 56;
  const xAt = cell => ORIGIN + (cell % 9) * STEP;
  const yAt = cell => ORIGIN + Math.floor(cell / 9) * STEP;
  const xWall = index => ORIGIN + (index % 8 + .5) * STEP;
  const yWall = index => ORIGIN + (Math.floor(index / 8) + .5) * STEP;
  const wallCoord = index => Q.coord(Math.floor(index / 8) * 9 + index % 8);

  function wallMarkup(dir, index, color, last) {
    const x = xWall(index), y = yWall(index);
    const w = dir === 'h' ? 96 : 8, h = dir === 'h' ? 8 : 96;
    return '<rect x="'+(x-w/2)+'" y="'+(y-h/2+1)+'" width="'+w+'" height="'+h+'" rx="3.5" fill="'+color
      +'" stroke="'+(last ? '#fff0c4' : '#4a3426')+'" stroke-width="'+(last ? 2.2 : .8)+'"/>';
  }
  function pawnMarkup(seat, cell, active, motion) {
    const moving = motion && motion.seat === seat;
    const x = moving ? motion.x : xAt(cell), y = moving ? motion.y : yAt(cell);
    const icon = ['<circle r="4.3"/>','<circle r="5" fill="none" stroke="#102034" stroke-width="2.3"/>',
      '<path d="M0 -6 6 4h-12z"/>','<path d="m0 -6 6 6-6 6-6-6z"/>'][seat];
    return '<g data-pawn="'+seat+'" transform="translate('+x+' '+y+')">'
      +(active ? '<circle r="20" fill="none" stroke="'+COLORS[seat]+'" stroke-width="2.3"/>' : '')
      +'<ellipse cy="6" rx="15" ry="14" fill="#090f1b" opacity=".64"/>'
      +'<circle cy="2" r="15" fill="'+DARK[seat]+'"/><circle cy="-1" r="14.5" fill="url(#token'+seat+')" stroke="'+COLORS[seat]+'" stroke-width="1.2"/>'
      +'<g fill="#102034" opacity=".75" transform="translate(0 -1)">'+icon+'</g></g>';
  }
  function drawBoard(display, editable) {
    const s = display.s, wallMode = editable && tool !== 'p', live = display.mode === 'live';
    const motion = live && s === game.state ? game.motion : null;
    const targets = editable && tool === 'p' ? new Set(Q.pawnMoves(s)) : new Set();
    const hint = display.hint;
    const out = ['<defs><linearGradient id="tray" x2="0" y2="1"><stop stop-color="#27354d"/><stop offset="1" stop-color="#162236"/></linearGradient>',
      '<linearGradient id="timber" x2="0" y2="1"><stop stop-color="#f6d69f"/><stop offset="1" stop-color="#c39152"/></linearGradient>'];
    COLORS.forEach((color,i) => out.push('<linearGradient id="token'+i+'" x2="0" y2="1"><stop stop-color="'+color
      +'"/><stop offset="1" stop-color="'+DARK[i]+'"/></linearGradient>'));
    out.push('</defs><rect x="17" y="17" width="486" height="486" rx="23" fill="url(#tray)" stroke="#53627a" stroke-width="1.4"/>',
      '<rect x="29" y="29" width="462" height="462" rx="12" fill="#111b2b" stroke="#35435a" stroke-width="1"/>');
    const rims = ['M44 23h432','M44 497h432','M497 44v432','M23 44v432'];
    for (let i = 0; i < s.count; i++) {
      out.push('<path class="board-decor" d="'+rims[i]+'" fill="none" stroke="'+COLORS[i]+'" stroke-width="3" stroke-linecap="round" opacity="'+(s.turn === i || s.winner === i ? '.94' : '.40')+'"/>');
    }
    const lastCell = s.last && s.last[0] === 'p' ? Number(s.last.slice(2)) : -1;
    for (let cell = 0; cell < 81; cell++) {
      const x = xAt(cell), y = yAt(cell), target = targets.has(cell), mark = hint === 'p:'+cell;
      const fill = mark ? '#435e80' : target ? '#42516c' : (Math.floor(cell/9)+cell%9)%2 ? '#303d55' : '#36445d';
      out.push('<g '+(target ? 'class="cell-hit" role="button" tabindex="0" data-step="'+cell+'" aria-label="Ход на '+Q.coord(cell)+'"' : 'class="board-decor"')+'>'
        +'<rect x="'+(x-21)+'" y="'+(y-21)+'" width="42" height="42" rx="6" fill="'+fill+'" stroke="'+(mark ? '#a8d8ff' : cell===lastCell ? '#d2ae76' : '#53617a')+'" stroke-width="'+(mark ? 2 : 1)+'"/>'
        +(target || mark ? '<circle cx="'+x+'" cy="'+y+'" r="4.5" fill="'+(mark ? '#a8d8ff' : COLORS[s.turn])+'" opacity=".92"/>' : '')
        +'</g>');
    }
    for (let i = 0; i < 9; i++) {
      out.push('<text class="coord" x="'+xAt(i)+'" y="514" text-anchor="middle">'+'ABCDEFGHI'[i]+'</text>',
        '<text class="coord" x="8" y="'+(yAt(i*9)+4)+'" text-anchor="middle">'+(9-i)+'</text>');
    }
    out.push('<g class="board-decor">');
    for (const dir of ['h','v']) for (let i = 0; i < 64; i++) {
      if (s[dir][i]) out.push(wallMarkup(dir,i,'url(#timber)',s.last === dir+':'+i));
    }
    if (hint && /^[hv]:/.test(hint) && !wallMode) out.push(wallMarkup(hint[0],Number(hint.slice(2)),'#8fc9fb',true));
    out.push('</g><g id="pawnLayer">');
    s.pawns.forEach((cell,seat) => {
      if (cell >= 0) out.push(pawnMarkup(seat,cell,Q.over(s) ? s.winner === seat : s.turn === seat,motion));
    });
    out.push('</g><g id="wallGhost"></g>');
    if (wallMode) {
      for (let i = 0; i < 64; i++) {
        const x = xWall(i), y = yWall(i);
        out.push('<g class="wall-hit" role="button" tabindex="'+(wallFocus === i ? 0 : -1)+'" data-wall="'+i+'" aria-label="Стык '+wallCoord(i)+'">'
          +'<rect x="'+(x-23)+'" y="'+(y-23)+'" width="46" height="46" rx="6" fill="transparent"/>'
          +'<circle cx="'+x+'" cy="'+y+'" r="2.2" fill="#d4b681" opacity=".86"/></g>');
      }
    }
    $('board').innerHTML = out.join('');
    paintWall(display, editable);
  }
  function resetTool() { tool = 'p'; selected = hovering = null; }
  function paintWall(display, editable) {
    const show = editable && tool !== 'p';
    $('wallPanel').hidden = !show;
    if (!show) return;
    const index = hovering == null ? selected : hovering;
    const error = index == null ? null : Q.wallError(display.s,tool,index);
    const selectedError = selected == null ? null : Q.wallError(display.s,tool,selected);
    const ghost = $('wallGhost');
    if (ghost) ghost.innerHTML = index == null ? '' : wallMarkup(tool,index,error ? '#ed817a' : '#f4d294',true);
    $('wallMessage').textContent = error ? ERRORS[error] : selected == null ? 'Выбери стык на поле.' : 'Стена у '+wallCoord(selected)+' · подтверди ход.';
    $('wallMessage').classList.toggle('invalid', !!error);
    $('wallConfirm').disabled = selected == null || !!selectedError;
  }
  function setTool(next) {
    if (!game) return;
    const display = review.display();
    if (!canUse(display) || (next !== 'p' && !display.s.remaining[display.s.turn])) return;
    tool = next; selected = hovering = null;
    render();
  }
  $('moveTools').addEventListener('click', e => {
    const b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  function chooseWall(index) {
    const display = review.display();
    if (!canUse(display) || tool === 'p') return;
    wallFocus = selected = index;
    hovering = null;
    paintWall(display,true);
  }
  const board = $('board');
  board.addEventListener('click', e => {
    const hit = e.target.closest('[data-step],[data-wall]');
    if (!hit) return;
    if (hit.dataset.step !== undefined) tryMove('p:'+hit.dataset.step);
    else chooseWall(Number(hit.dataset.wall));
  });
  board.addEventListener('pointermove', e => {
    if (tool === 'p' || e.pointerType === 'touch') return;
    const hit = e.target.closest('[data-wall]');
    const index = hit ? Number(hit.dataset.wall) : null;
    if (index === hovering) return;
    hovering = index;
    const d = review.display();
    paintWall(d,canUse(d));
  });
  board.addEventListener('pointerleave', () => {
    if (!game || hovering === null) return;
    hovering = null; const d = review.display(); paintWall(d,canUse(d));
  });
  board.addEventListener('keydown', e => {
    const hit = e.target.closest('[data-step],[data-wall]');
    if (!hit) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (hit.dataset.step !== undefined) tryMove('p:'+hit.dataset.step);
      else chooseWall(Number(hit.dataset.wall));
      return;
    }
    if (hit.dataset.wall === undefined) return;
    const delta = {ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1]}[e.key];
    if (!delta) return;
    e.preventDefault(); e.stopPropagation();
    const index = Number(hit.dataset.wall), sign = BoardView.isFlipped(ID) ? -1 : 1;
    const r = Math.max(0,Math.min(7,Math.floor(index/8)+delta[0]*sign));
    const c = Math.max(0,Math.min(7,index%8+delta[1]*sign));
    const next = board.querySelector('[data-wall="'+(r*8+c)+'"]');
    hit.setAttribute('tabindex','-1'); next.setAttribute('tabindex','0');
    wallFocus = r*8+c; next.focus();
  });
  $('wallConfirm').onclick = () => {
    if (selected != null && tool !== 'p') tryMove(tool+':'+selected);
  };

  function wallsLabel(n) {
    return n === 1 ? '1 стена' : n >= 2 && n <= 4 ? n+' стены' : n+' стен';
  }
  function render() {
    if (!game) return;
    clock.sync();
    BoardView.refresh(ID);
    const d = review.display(), s = d.s, editable = canUse(d);
    if (tool !== 'p' && !s.remaining[s.turn]) resetTool();
    const shownMode = game.analysis ? 'Анализ' : game.online ? 'Онлайн' : game.roles.includes('bot') ? 'С ботами' : 'На одном экране';
    $('modeTitle').textContent = shownMode + ' · ' + game.count + ' игрока';
    $('players').style.setProperty('--seats',game.count);
    $('players').innerHTML = s.pawns.map((cell,i) => {
      const role = game.roles[i], label = game.analysis ? '' : role === 'bot' ? 'Бот · ' : role === 'remote' ? 'Друг · ' : game.side === i ? 'Ты · ' : '';
      return '<div class="player'+(!Q.over(s)&&s.turn===i?' turn':'')+(cell<0?' retired':'')+'" style="--seat:'+COLORS[i]+'">'
        +'<i class="side-dot"></i><b>'+label+name(i)+'</b><small>'+(cell<0?'Выбыл':wallsLabel(s.remaining[i]))+'</small></div>';
    }).join('');
    if (d.mode === 'live') {
      $('status').textContent = Q.over(s) ? 'Партия завершена' : game.online && !Net2P.online() ? 'Связь с другом потеряна'
        : game.motion ? 'Фишка движется…' : game.pending ? 'Отправляем ход…' : game.thinking ? name(s.turn)+' думают…'
        : 'Ходят '+name(s.turn).toLowerCase();
    }
    $('moveTools').querySelectorAll('[data-tool]').forEach(b => {
      b.disabled = !editable || (b.dataset.tool !== 'p' && !s.remaining[s.turn]);
      b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    });
    drawBoard(d,editable);
    $('hintBtn').hidden = game.online && !Q.over(game.state);
    $('hintBtn').disabled = !editable;
    $('undoBtn').hidden = !!game.online;
    $('undoBtn').disabled = undoIndex() < 0 || !!game.motion;
    $('againBtn').hidden = game.online && Net2P.role() === 'guest';
    $('notation').innerHTML = ['<button data-go="0">Начало</button>'].concat(game.line.slice(1).map((entry,i) =>
      '<button data-go="'+(i+1)+'" class="'+(d.mode!=='var'&&d.k===i+1?'current':'')+'">'+(i+1)+'. '+Q.notation(entry.mv)+'</button>')).join('');
    renderResult();
    continueGame.refresh();
  }
  function renderResult() {
    const s = game.state, show = Q.over(s) && !game.motion && !game.analysis;
    $('endOv').hidden = !show;
    if (!show) return;
    const last = s.last || '';
    $('endTitle').textContent = s.draw ? 'Ничья' : name(s.winner)+' победили';
    $('endText').textContent = s.draw ? 'Партия окончена.'
      : last.startsWith('time:') ? name(Number(last.slice(5)))+' проиграли по времени.'
      : last.startsWith('resign:') ? 'В партии остался один участник.' : 'Фишка достигла противоположного края.';
    $('endAgain').hidden = game.online && Net2P.role() === 'guest';
  }

  function finishMotion() {
    if (!game.motion) return;
    clock.sync();
    game.motion = null;
  }
  function record(next, by, animated) {
    const current = game, turnToken = ++epoch, old = game.state;
    if (game.motion) finishMotion();
    const motion = animated && next.last[0] === 'p' ? {
      seat:by, x:xAt(old.pawns[by]), y:yAt(old.pawns[by]), to:next.pawns[by]
    } : null;
    game.motion = motion;
    game.state = next; game.keys.push(next.last); game.line.push({s:next,mv:next.last,by});
    game.pending = false; game.thinking = false;
    resetTool(); clock.sync(); review.sync();
    if (Q.over(next) && review.viewing()) review.go(-1); else render();
    if (!motion) { runBot(); return; }
    const x0 = motion.x, y0 = motion.y, start = performance.now();
    const timer = setInterval(() => {
      if (game !== current || epoch !== turnToken || game.motion !== motion) { clearInterval(timer); return; }
      const fraction = Math.min(1,(performance.now()-start)/190);
      const ease = 1 - (1-fraction)**2;
      motion.x = x0 + (xAt(motion.to)-x0)*ease;
      motion.y = y0 + (yAt(motion.to)-y0)*ease;
      const pawn = board.querySelector('[data-pawn="'+by+'"]');
      if (pawn && !review.viewing()) pawn.setAttribute('transform','translate('+motion.x+' '+motion.y+')');
      if (fraction === 1) { clearInterval(timer); finishMotion(); render(); runBot(); }
    },16);
  }
  function tryMove(key) {
    if (!game) return;
    const d = review.display();
    if (!canUse(d)) return;
    if (d.mode !== 'live') {
      if (!review.play(key) && key[0] !== 'p') toast(ERRORS[Q.wallError(d.s,key[0],Number(key.slice(2)))] || 'Стена недоступна.');
      return;
    }
    const next = Q.play(game.state,key);
    if (!next) {
      if (key[0] !== 'p') toast(ERRORS[Q.wallError(game.state,key[0],Number(key.slice(2)))] || 'Стена недоступна.');
      return;
    }
    if (!clock.before() || Q.over(game.state)) return;
    if (game.online && Net2P.role() === 'guest') {
      game.pending = Net2P.send({t:'try',id:game.id,ply:game.state.ply,key});
      render();
    } else commit(next);
  }
  function commit(next) {
    const by = game.state.turn;
    if (game.online) Net2P.send({t:'move',id:game.id,ply:game.state.ply,key:next.last});
    record(next,by,true);
  }
  function runBot() {
    if (!game || Q.over(game.state) || game.motion || game.thinking || review.viewing()
      || game.analysis || game.roles[game.state.turn] !== 'bot') return;
    const token = epoch, state = game.state, current = game;
    game.thinking = true; render();
    setTimeout(() => {
      if (epoch !== token || game !== current) return;
      think(state, game.level, result => {
        if (epoch !== token || game !== current || state !== game.state) return;
        game.thinking = false;
        if (review.viewing()) { render(); return; }
        const best = result && result.best || Q.think(state, 0).best;
        const next = best && Q.play(state,best);
        if (next && clock.before() && !Q.over(game.state)) commit(next); else render();
      });
    },140);
  }
  function undoIndex() {
    if (!game || game.online) return -1;
    if (!game.roles.includes('bot')) return game.keys.length-1;
    for (let i=game.line.length-1;i>0;i--) if (game.line[i].by === game.side) return i-1;
    return -1;
  }
  function undo() {
    const to = undoIndex();
    if (to < 0 || game.motion) return;
    epoch++;
    game.line = game.line.slice(0,to+1); game.keys = game.keys.slice(0,to);
    game.state = game.line.at(-1).s; game.thinking = false;
    resetTool(); review.reset(); render(); runBot();
  }
  function analyze() {
    if (!game) return;
    epoch++; finishMotion(); Net2P.close();
    game.online = false; game.analysis = true; game.thinking = false; game.pending = false;
    game.roles = localRoles(game.count,'duo'); game.side = null;
    resetTool(); review.reset(); render();
  }
  function home() {
    epoch++; Net2P.close(); game = null; continuation = null;
    if ($('lobby').open) $('lobby').close();
    $('game').hidden = true; $('menu').hidden = false;
    if (location.hash && !window.IN_ROOM) history.replaceState(null,'',location.pathname+location.search);
    clock.sync(); BoardView.refresh(ID); renderMenu();
  }
  function again() {
    if (!game) return;
    if (game.online) {
      if (Net2P.role() === 'host' && Net2P.online()) hostStart(1-game.side);
      return;
    }
    newGame({count:game.count,side:game.side,roles:game.roles.slice(),analysis:game.analysis,level:game.level});
  }
  $('playBtn').onclick = startLocal;
  $('analyzeBtn').onclick = () => { Net2P.close(); newGame({count:settings.count,roles:localRoles(settings.count,'duo'),analysis:true,side:null}); };
  $('homeBtn').onclick = $('endMenu').onclick = home;
  $('againBtn').onclick = $('endAgain').onclick = again;
  $('endLook').onclick = analyze;
  $('undoBtn').onclick = undo;
  $('hintBtn').onclick = () => {
    if (game && canUse(review.display())) { resetTool(); review.hint(); }
  };
  $('notation').onclick = e => {
    const hit = e.target.closest('[data-go]');
    if (hit) review.go(Number(hit.dataset.go));
  };

  function lobby(message, options = {}) {
    $('lbText').textContent = message;
    $('lbCode').hidden = !options.code; $('lbCode').textContent = options.code || '';
    $('lbLinkRow').hidden = !options.link; $('lbLink').value = options.link || '';
    $('lbRetry').hidden = !options.error;
    if (!$('lobby').open) $('lobby').showModal();
  }
  function networkRoles(side) { return side === 0 ? ['human','remote'] : ['remote','human']; }
  function sendSnapshot() {
    Net2P.send({t:'sync',id:game.id,side:game.side,keys:game.keys});
    clock.publish();
  }
  function hostStart(side) {
    const keys = continuation ? continuation.keys : [];
    const id = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    Net2P.send({t:'sync',id,side,keys});
    newGame({count:2,side,roles:networkRoles(side),keys,id,online:true});
    clock.publish();
  }
  function onPeer(connected) {
    if (game && game.online) {
      if (!connected) game.pending = false;
      render();
    }
  }
  function host() {
    lastJoin = null;
    lobby('Подключаюсь к серверу связи…');
    Net2P.host({prefix:PREFIX, onReady:(code,link) => lobby('Отправь другу ссылку или код. Партия начнётся после подключения.',{code,link}),
      onJoin:() => game && game.online ? sendSnapshot() : hostStart(settings.side),
      onPeer, onData:hostData, onFail:message => lobby(message,{error:true})});
  }
  function join(code) {
    lastJoin = code;
    lobby('Подключаюсь к игре '+Net2P.cleanCode(code)+'…');
    Net2P.join(code,{prefix:PREFIX,onOpen:() => lobby('Подключено. Ждём начала партии…'),
      onPeer,onData:guestData,onFail:message => lobby(message,{error:true})});
  }
  function hostData(d) {
    if (match.receive(d,game ? 1-game.side : null) || clock.receive(d) || !game || !game.online) return;
    if (d.t === 'needsync') { sendSnapshot(); return; }
    if (d.t !== 'try') return;
    const state = game.state;
    const next = d.id === game.id && d.ply === state.ply && game.roles[state.turn] === 'remote'
      && !game.motion && !Q.over(state) && Q.play(state,d.key);
    if (next && clock.before() && !Q.over(game.state)) commit(next);
    else if (d.id !== game.id || d.ply !== state.ply) sendSnapshot();
    else Net2P.send({t:'nack',id:game.id});
  }
  function guestData(d) {
    if (match.receive(d,null) || clock.receive(d)) return;
    if (d.t === 'sync') {
      if ((d.side !== 0 && d.side !== 1) || typeof d.id !== 'string' || d.id.length > 40) return;
      try { newGame({count:2,side:1-d.side,roles:networkRoles(1-d.side),keys:d.keys,id:d.id,online:true}); }
      catch (e) { lobby('Некорректная запись партии.',{error:true}); }
      return;
    }
    if (!game || !game.online || d.id !== game.id) return;
    if (d.t === 'move') {
      if (d.ply < game.state.ply) return;
      const next = d.ply === game.state.ply && Q.play(game.state,d.key);
      if (next) record(next,game.state.turn,true);
      else Net2P.send({t:'needsync'});
    } else if (d.t === 'nack') {
      game.pending = false; render();
    }
  }
  $('netCreate').onclick = host;
  $('netJoinBtn').onclick = () => { $('joinRow').hidden = !$('joinRow').hidden; if (!$('joinRow').hidden) $('joinCode').focus(); };
  $('joinCode').oninput = e => { e.target.value = Net2P.cleanCode(e.target.value); };
  $('joinCode').onkeydown = e => { if (e.key === 'Enter') $('joinGo').click(); };
  $('joinGo').onclick = () => { const code = Net2P.cleanCode($('joinCode').value); if (code.length === 5) join(code); else toast('Введи код из пяти символов.'); };
  $('lbCancel').onclick = home;
  $('lobby').addEventListener('cancel', e => { e.preventDefault(); home(); });
  $('lbRetry').onclick = () => lastJoin ? join(lastJoin) : host();
  $('lbCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('lbLink').value); toast('Ссылка скопирована.'); }
    catch (e) { $('lbLink').focus(); $('lbLink').select(); }
  };

  function finish(type, actor) {
    if (!game) return;
    const next = Q.settle(game.state,type,actor);
    if (next) record(next,type === 'draw' ? game.state.turn : actor,false);
  }
  const clock = GameClock.attach({
    id:ID, labels:NAMES.slice(0,2), resultModal:false,
    state:() => game && game.count === 2 && !game.analysis ? {
      game, turn:game.state.turn, moves:game.state.ply, ready:true,
      over:Q.over(game.state), paused:!!game.motion, noIncrement:/^(time|resign|draw)/.test(game.state.last || '')
    } : null,
    role:Net2P.role, send:Net2P.send, menu:home, analyze,
    expire:seat => { finish('time',seat); clock.publish(); }
  });
  const continueGame = ContinueGame.attach({
    mount:$('game'), clock,
    available:() => !!game && game.count === 2 && !game.motion && (!game.online || Q.over(game.state))
      && !Q.over(review.display().s) && (game.analysis || review.viewing()),
    capture:() => ({keys:review.pathHere().slice()}),
    evalOn:() => false, level:() => settings.level,
    levels:LEVELS.map(label => ({label})), sides:() => NAMES.slice(0,2).map((label,value) => ({label,value})), notify:toast,
    start:(seed, options) => {
      Net2P.close(); settings.mode = options.mode; settings.side = Number(options.side); settings.level = options.level; settings.count = 2; save();
      if (options.mode === 'net') { continuation = seed; host(); }
      else newGame({count:2,side:options.mode==='bot'?settings.side:null,roles:localRoles(2,options.mode,settings.side),level:settings.level,keys:seed.keys});
    }
  });
  $('continueEval').closest('label').hidden = true;
  /*MATCH_ACTIONS*/
  BoardView.attach({id:ID, ref:() => game, boards:['board'], autoFlip:() => game.side === 1, analysis:() => game && game.analysis});
  if (window.IN_ROOM || Net2P.hashCode()) settings.mode = 'net';
  renderMenu();
  if (Net2P.hashCode()) join(Net2P.hashCode());
})();
