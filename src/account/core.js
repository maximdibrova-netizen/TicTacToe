// Form validation is separate from Firebase so guest play never depends on it.
var AccountCore = (function () {
  function validate(mode, input) {
    if (mode === 'profile' || mode === 'register') {
      var name = String(input.name || '').trim();
      if (name.length < 2 || name.length > 32) return 'Имя игрока должно содержать от 2 до 32 символов.';
    }
    if (mode === 'profile') return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email || '').trim())) return 'Введите корректный адрес почты.';
    if (mode === 'reset') return '';
    if (mode === 'register' && String(input.password || '').length < 8) return 'Придумайте пароль длиной от 8 символов.';
    if (!input.password) return 'Введите пароль.';
    return '';
  }
  function error(e) {
    var code = e && e.code;
    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-login-credentials'].indexOf(code) >= 0) return 'Проверьте почту и пароль или восстановите доступ.';
    var messages = {
      'auth/email-already-in-use': 'С этой почтой уже есть аккаунт. Войдите или восстановите пароль.',
      'auth/weak-password': 'Этот пароль слишком простой. Выберите более длинный пароль.',
      'auth/password-does-not-meet-requirements': 'Пароль не соответствует требованиям. Используйте более длинный пароль с буквами и цифрами.',
      'auth/invalid-email': 'Проверьте адрес почты.',
      'auth/network-request-failed': 'Проверьте подключение к интернету. Игры доступны и без входа.',
      'auth/popup-blocked': 'Разрешите всплывающее окно для входа через Google или войдите по почте.',
      'auth/popup-closed-by-user': 'Окно Google закрыто. Можно попробовать ещё раз или войти по почте.',
      'auth/cancelled-popup-request': 'Дождитесь завершения входа в открытом окне Google.',
      'auth/account-exists-with-different-credential': 'Для этой почты уже выбран другой способ входа. Попробуйте его.',
      'auth/too-many-requests': 'Слишком много попыток. Подождите немного и повторите вход.',
      'auth/user-disabled': 'Этот аккаунт отключён. Обратитесь к владельцу сайта.',
      'auth/operation-not-allowed': 'Этот способ входа пока недоступен. Выберите другой или продолжите гостем.',
      'auth/unauthorized-domain': 'На этом адресе вход через Google пока недоступен. Можно войти по почте.',
      'auth/web-storage-unsupported': 'Браузер ограничивает сохранение входа. Разрешите данные сайта или продолжите гостем.'
    };
    return messages[code] || 'Не удалось войти. Попробуйте ещё раз или продолжите гостем.';
  }
  return { validate: validate, error: error };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AccountCore;
