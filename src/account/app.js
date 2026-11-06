import { auth as sharedAuth } from './firebase.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail, updateProfile, connectAuthEmulator } from 'firebase/auth';
import Core from './core.js';

const $ = id => document.getElementById(id);
let auth, user = null, mode = 'login', busy = false, registration = false;
const dialog = $('accountDialog');

function message(text = '', success = false) {
  $('accountMessage').textContent = text;
  $('accountMessage').classList.toggle('success', success);
}
function setMode(next) {
  mode = next; message();
  $('accountTitle').textContent = next === 'register' ? 'Создать аккаунт' : next === 'reset' ? 'Восстановить пароль' : next === 'profile' ? 'Профиль игрока' : 'Войти в аккаунт';
  $('accountIntro').textContent = next === 'register' ? 'Имя будет видно в вашем профиле.' : next === 'reset' ? 'Пришлём ссылку для смены пароля на вашу почту.' : next === 'profile' ? (user?.email || 'Ваш игровой аккаунт') : 'Выберите удобный способ входа.';
  $('accountGuestPane').hidden = next === 'profile';
  $('accountProfileForm').hidden = next !== 'profile';
  $('accountGuest').hidden = next === 'profile';
  $('accountNameRow').hidden = next !== 'register';
  $('accountPasswordRow').hidden = next === 'reset';
  $('accountGoogle').hidden = next === 'reset';
  $('accountSubmit').textContent = next === 'register' ? 'Создать аккаунт' : next === 'reset' ? 'Отправить письмо' : 'Войти';
  $('accountLoginTab').setAttribute('aria-selected', String(next === 'login'));
  $('accountRegisterTab').setAttribute('aria-selected', String(next === 'register'));
  $('accountPassword').autocomplete = next === 'register' ? 'new-password' : 'current-password';
  $('accountReset').hidden = next === 'reset';
  $('accountPassword').value = '';
}
function open(next) { setMode(next); if (next === 'profile') $('accountProfileName').value = user?.displayName || ''; if (!dialog.open) dialog.showModal(); }
function close() { dialog.close(); $('accountPassword').value = ''; message(); }
function paint() {
  $('accountOpen').hidden = !!user;
  $('accountManage').hidden = $('accountLogout').hidden = !user;
  $('accountLabel').textContent = user ? user.displayName || user.email || 'Игрок' : 'Играть со своего аккаунта';
  $('accountHint').textContent = user ? user.email || 'Вы вошли в аккаунт' : 'Вход через Google или почту. Можно играть гостем.';
}
function lock(value) {
  busy = value;
  for (const id of ['accountSubmit', 'accountGoogle', 'accountSaveProfile', 'accountLogout', 'accountLoginTab', 'accountRegisterTab', 'accountReset']) $(id).disabled = value;
}
function run(operation) {
  if (busy) return;
  message();
  if (!navigator.onLine) { message(Core.error({ code: 'auth/network-request-failed' })); return; }
  if (!auth) { message('Вход пока недоступен. Можно продолжить гостем.'); return; }
  lock(true);
  let result;
  try { result = operation(); } catch (e) { message(Core.error(e)); lock(false); return; }
  return Promise.resolve(result).catch(e => { if (!dialog.open) open(user ? 'profile' : 'login'); message(Core.error(e)); }).finally(() => lock(false));
}

$('accountOpen').onclick = () => open('login');
$('accountManage').onclick = () => open('profile');
$('accountClose').onclick = $('accountGuest').onclick = close;
dialog.addEventListener('cancel', () => { $('accountPassword').value = ''; });
dialog.addEventListener('close', () => { $('accountPassword').value = ''; });
$('accountLoginTab').onclick = () => setMode('login');
$('accountRegisterTab').onclick = () => setMode('register');
$('accountReset').onclick = () => setMode('reset');
$('accountLogout').onclick = () => run(async () => { await signOut(auth); close(); });
$('accountGoogle').onclick = () => run(async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
  user = auth.currentUser; paint(); close();
});
$('accountForm').onsubmit = event => {
  event.preventDefault();
  const input = { email: $('accountEmail').value.trim(), name: $('accountName').value.trim(), password: $('accountPassword').value };
  const problem = Core.validate(mode, input); if (problem) { message(problem); return; }
  const selectedMode = mode;
  run(async () => {
    if (selectedMode === 'reset') {
      await sendPasswordResetEmail(auth, input.email);
      message('Если для этой почты есть аккаунт, на неё придёт письмо для смены пароля.', true); return;
    }
    if (selectedMode === 'register') {
      registration = true;
      try {
        const created = await createUserWithEmailAndPassword(auth, input.email, input.password);
        await updateProfile(created.user, { displayName: input.name });
        window.dispatchEvent(new Event('account:profile-updated'));
      } finally { registration = false; }
    } else await signInWithEmailAndPassword(auth, input.email, input.password);
    user = auth.currentUser; paint(); close();
  });
};
$('accountProfileForm').onsubmit = event => {
  event.preventDefault(); const name = $('accountProfileName').value.trim();
  const problem = Core.validate('profile', { name }); if (problem) { message(problem); return; }
  run(async () => { await updateProfile(auth.currentUser, { displayName: name }); user = auth.currentUser; paint(); close(); window.dispatchEvent(new Event('account:profile-updated')); });
};

try {
  auth = sharedAuth;
  onAuthStateChanged(auth, current => {
    user = current; paint();
    if (!registration && user && dialog.open && mode !== 'profile') close();
    if (!user && dialog.open && mode === 'profile') close();
  }, () => { $('accountHint').textContent = 'Аккаунт сейчас недоступен. Можно играть гостем.'; });
} catch (_) { $('accountHint').textContent = 'Аккаунт сейчас недоступен. Можно играть гостем.'; }
paint();

if(new URLSearchParams(location.search).get('signin')==='1')open('login');
