// Подключение игры к «комнате» (главная страница). Работает, только если игра открыта внутри главной.
// Подменяет PeerJS мостом комнаты и подстраивает интерфейс: код не нужен, друг подключается сам.
(function () {
  try {
    if (window.parent !== window && window.parent.ROOM && window.parent.ROOM.active()) {
      window.IN_ROOM = true;
      window.Peer = window.parent.ROOM.peerFor(window);
    }
  } catch (e) {}
  if (!window.IN_ROOM) return;
  document.addEventListener('DOMContentLoaded', function () {
    var css = document.createElement('style');
    css.textContent = '#lbCode,#lbLinkRow,#netJoinBtn,#onJoin,#joinRow{display:none!important}';
    document.head.appendChild(css);
    var cr = document.getElementById('netCreate') || document.getElementById('onCreate');
    if (cr) cr.textContent = 'Начать с другом';
    if (!location.hash) { var m = document.getElementById('m-net'); if (m) m.click(); }
    // «В меню», «Меню», «← все игры», «Отмена» в ожидании — назад к списку игр комнаты (партия не рвётся)
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('#homeBtn,#endMenu,#lbCancel,a[href="../"]');
      if (!t) return;
      e.preventDefault(); e.stopImmediatePropagation();
      window.parent.ROOM.home();
    }, true);
    var lt = document.getElementById('lbText');
    if (lt) {
      var fix = function () {
        var x = lt.textContent || '';
        if (/Отправь другу|Скажи другу/.test(x)) lt.textContent = 'Друг в комнате подключится сам, как только у него откроется эта игра.';
        else if (/Подключаюсь к игре/.test(x)) lt.textContent = 'Ждём, пока друг выберет настройки и нажмёт «Начать с другом»…';
      };
      new MutationObserver(fix).observe(lt, { childList: true, characterData: true, subtree: true });
      fix();
    }
  });
})();
