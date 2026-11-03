// A fresh game from the displayed analysis branch. Each game owns its rules/seed.
var ContinueGame = {
  attach: function (a) {
    var button = document.createElement('button'); button.id = 'continueBtn'; button.className = 'continue-button'; button.textContent = 'Продолжить с этой позиции'; button.hidden = true;
    a.mount.appendChild(button);
    var dialog = document.createElement('dialog'); dialog.id = 'continueDialog'; dialog.setAttribute('aria-labelledby', 'continueTitle');
    dialog.innerHTML = '<h2 id="continueTitle">Продолжить с этой позиции</h2><p>Новая партия с позиции на доске. Очередь хода и история выбранной ветки сохраняются, часы запускаются заново.</p>' +
      '<label>С кем играть<select id="continueMode"><option value="duo">Друг на одном устройстве</option><option value="bot">С ботом</option><option value="net">Онлайн по коду</option></select></label>' +
      '<label id="continueSideRow">Я играю за<select id="continueSide"></select></label>' +
      '<label id="continueLevelRow">Сложность бота<select id="continueLevel"></select></label>' +
      '<label>Оценка во время партии<select id="continueEval"><option value="0">Без оценки</option><option value="1">С оценкой</option></select></label>' +
      '<div id="continueClock"></div><p id="continueError" role="alert"></p><div class="continue-actions"><button id="continueCancel">Назад к анализу</button><button id="continueStart">Начать</button></div>';
    document.body.appendChild(dialog);
    var q = function (id) { return dialog.querySelector('#' + id); }, seed = null, anchor = null;
    a.levels.forEach(function (level, i) { var option = document.createElement('option'); option.value = level.value == null ? i : level.value; option.textContent = level.label; q('continueLevel').appendChild(option); });
    function modeChanged() { var mode = q('continueMode').value; q('continueSideRow').hidden = mode === 'duo'; q('continueLevelRow').hidden = mode !== 'bot'; q('continueEval').disabled = mode === 'net'; }
    q('continueMode').onchange = modeChanged;
    function restoreSettings() { if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(a.clock.settings, anchor); anchor.remove(); anchor = null; } }
    dialog.addEventListener('close', restoreSettings);
    q('continueCancel').onclick = function () { dialog.close(); };
    button.onclick = function () {
      if (!a.available()) return;
      try { seed = a.capture(); } catch (e) { a.notify(e.message); return; }
      q('continueError').textContent = ''; q('continueMode').value = 'duo'; q('continueEval').value = a.evalOn() ? '1' : '0';
      q('continueLevel').value = String(a.level()); q('continueSide').innerHTML = '';
      a.sides(seed).forEach(function (side) { var option = document.createElement('option'); option.value = side.value; option.textContent = side.label; q('continueSide').appendChild(option); });
      anchor = document.createComment('clock settings'); a.clock.settings.before(anchor); q('continueClock').appendChild(a.clock.settings);
      modeChanged(); dialog.showModal();
    };
    q('continueStart').onclick = function () {
      var options = { mode: q('continueMode').value, side: q('continueSide').value, level: +q('continueLevel').value, evalOn: q('continueEval').value === '1' };
      try { restoreSettings(); a.start(seed, options); dialog.close(); }
      catch (e) { q('continueError').textContent = e.message; if (!anchor) { anchor = document.createComment('clock settings'); a.clock.settings.before(anchor); q('continueClock').appendChild(a.clock.settings); } }
    };
    return { refresh: function () {
      var hidden = !a.available();
      if (button.hidden === hidden) return;
      button.hidden = hidden;
      setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 0);
    } };
  }
};
