import {onAuthStateChanged} from 'firebase/auth';
import {auth, database} from '../account/firebase.js';
import {challengeActive, ONLINE_MS, pairId, playerId, timeOf} from './core.js';
import {SocialStore} from './store.js';
import {FriendRooms} from './challenge-flow.js';
import {SocialChat} from './chat.js';
import {$, element, errorText, presenceLabel, status} from './dom.js';

const friendsTab = $('friendsTab'), gamesTab = $('gamesTab'), page = $('friendsPage');
const challengeDialog = $('socialChallengeDialog');
const games = new Map(Array.from(document.querySelectorAll('a.game[data-g]'),
  link => [link.dataset.g, link.dataset.name]));
const gameSelect = $('socialGameSelect');
for (const [id, name] of games) gameSelect.add(new Option(name, id));

let store = null, unsubs = [], links = new Map(), inviteRows = [], loaded = false;
let searchVersion = 0, searchResults = [], challengeFriend = null;
const profiles = new Map(), presence = new Map(), online = new Set();
const nameOf = uid => profiles.get(uid)?.name || 'Игрок ' + uid.slice(0, 6);
const other = link => link.from === store.uid ? link.to : link.from;
const chat = new SocialChat(nameOf, uid => online.has(uid));
const rooms = new FriendRooms(text => notice(text, true), () => {
  $('socialResume').hidden = !window.ROOM.context().game;
  renderChallenges();
});

function notice(text = '', error = false) {
  const node = $('socialNotice');
  status(node, text);
  node.classList.toggle('error', error);
}

function selectTab(friends) {
  page.hidden = !friends;
  $('gamesPage').hidden = friends;
  friendsTab.setAttribute('aria-selected', String(friends));
  gamesTab.setAttribute('aria-selected', String(!friends));
  friendsTab.tabIndex = friends ? 0 : -1;
  gamesTab.tabIndex = friends ? -1 : 0;
  if (friends) {
    refreshOnline();
    renderChallenges();
  }
}

gamesTab.onclick = () => selectTab(false);
friendsTab.onclick = () => selectTab(true);
for (const tab of [gamesTab, friendsTab]) {
  tab.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const friends = event.key === 'End' || (event.key !== 'Home' && tab === gamesTab);
    selectTab(friends);
    (friends ? friendsTab : gamesTab).focus();
  };
}

$('stageFriends').onclick = () => {
  window.ROOM.home();
  selectTab(true);
  friendsTab.focus();
};
$('socialResume').onclick = () => $('resumeBtn')?.click();
$('socialSignIn').onclick = () => window.GameAccount.signIn();
$('socialCode').onclick = async () => {
  if (!store) return;
  const current = store, code = '#' + current.uid;
  try {
    await navigator.clipboard.writeText(code);
    if (store === current) notice('Код игрока скопирован.');
  } catch (_) {
    if (store === current) notice('Мой код игрока ' + code);
  }
};
$('socialChatBack').onclick = () => {
  const uid = chat.state?.uid;
  chat.close();
  $('socialFriends').querySelector('[data-uid="' + uid + '"] .btn')?.focus();
};

async function action(button, work, report = text => notice(text, true)) {
  if (!store || button.disabled) return;
  const current = store;
  button.disabled = true;
  report('');
  try {
    if (!navigator.onLine) throw new Error('Нет связи. Попробуйте ещё раз после подключения.');
    await work(current);
  } catch (error) {
    if (store === current) report(errorText(error));
  } finally {
    button.disabled = false;
  }
}

function button(label, callback, kind = '') {
  const node = element('button', label, 'btn' + (kind ? ' ' + kind : ''));
  node.type = 'button';
  node.onclick = () => callback(node);
  return node;
}

function row(uid, subtitle, buttons, extraClass = '') {
  const node = element('li', '', 'social-row');
  node.dataset.uid = uid;
  const info = element('div', '', 'social-row-info');
  info.append(element('strong', nameOf(uid)));
  if (typeof subtitle === 'string') info.append(element('small', subtitle, extraClass));
  else {
    const line = element('small');
    line.append(subtitle);
    info.append(line);
  }
  node.append(info);
  if (buttons.length) {
    const actions = element('div', '', 'social-row-actions');
    actions.append(...buttons);
    node.append(actions);
  }
  return node;
}

function list(id, nodes) {
  const node = $(id);
  node.replaceChildren(...nodes);
  node.hidden = !nodes.length;
}

function remember(uid) {
  if (profiles.has(uid)) return;
  profiles.set(uid, null);
  const current = store;
  current.profile(uid).then(profile => {
    if (store !== current || !profile) return;
    profiles.set(uid, profile);
    renderLinks();
    renderChallenges();
  }).catch(() => { if (store === current && !profiles.get(uid)) profiles.delete(uid); });
}

function friendAction(link, label, accept, kind = '') {
  return button(label, node => action(node, current => current.changeFriend(link, accept)), kind);
}

function renderSearch() {
  list('socialSearchResults', searchResults.map(player => {
    const link = links.get(pairId(store.uid, player.uid));
    const controls = !link ? [button('Добавить', node => action(node, current => current.requestFriend(player.uid)), 'main')]
      : link.status === 'pending' && link.to === store.uid ? [friendAction(link, 'Принять', true, 'main')]
      : [];
    const text = !link ? '#' + player.uid : link.status === 'accepted' ? 'Уже в друзьях'
      : link.to === store.uid ? 'Хочет добавить вас в друзья' : 'Запрос отправлен';
    return row(player.uid, text, controls, link ? '' : 'social-player-code');
  }));
}

$('socialSearchForm').onsubmit = event => {
  event.preventDefault();
  if (!store) return;
  const input = $('socialSearch').value.trim();
  const hint = $('socialSearchStatus'), current = store, version = ++searchVersion;
  searchResults = [];
  renderSearch();
  if (input.startsWith('#') ? !playerId(input.slice(1)) : input.length < 2) {
    status(hint, 'Введите хотя бы два символа имени или полный код игрока с #.');
    return;
  }
  status(hint, 'Ищем игроков…');
  current.search(input).then(results => {
    if (store !== current || version !== searchVersion) return;
    searchResults = results;
    for (const player of results) profiles.set(player.uid, player);
    status(hint, results.length ? '' : 'Игроки не найдены.');
    renderSearch();
  }).catch(error => {
    if (store === current && version === searchVersion) status(hint, errorText(error));
  });
};

function acceptedLinks() {
  return [...links.values()].filter(link => link.status === 'accepted');
}

function renderLinks() {
  if (!store) return;
  const friends = acceptedLinks().sort((a, b) => Number(online.has(other(b))) - Number(online.has(other(a)))
    || nameOf(other(a)).localeCompare(nameOf(other(b)), 'ru'));
  status($('socialFriendsEmpty'), !loaded ? 'Загружаем список…' : friends.length ? '' : 'Здесь появятся ваши друзья.');
  status($('socialOnlineCount'), friends.length ? online.size + ' в сети' : '');
  list('socialFriends', friends.map(link => {
    const uid = other(link);
    return row(uid, presenceLabel(online.has(uid)), [
      button('Написать', () => chat.open(store, link.id, uid)),
      button('Вызвать', () => openChallenge(uid)),
      friendAction(link, 'Удалить', false, 'social-quiet')
    ]);
  }));
  const pending = [...links.values()].filter(link => link.status === 'pending')
    .sort((a, b) => Number(b.to === store.uid) - Number(a.to === store.uid) || timeOf(b.createdAt) - timeOf(a.createdAt));
  $('socialRequestsWrap').hidden = !pending.length;
  list('socialRequests', pending.map(link => {
    const incoming = link.to === store.uid;
    const controls = incoming ? [friendAction(link, 'Принять', true, 'main'), friendAction(link, 'Отклонить', false)]
      : [friendAction(link, 'Отменить', false)];
    return row(other(link), incoming ? 'Хочет добавить вас в друзья' : 'Запрос отправлен', controls);
  }));
  if (chat.state && links.get(chat.state.link)?.status !== 'accepted') chat.close();
  chat.heading();
  renderSearch();
  renderBadge();
}

function refreshOnline() {
  let changed = false;
  const now = Date.now();
  for (const [uid, item] of presence) {
    const active = item.seen > 0 && now - item.seen < ONLINE_MS;
    if (active === online.has(uid)) continue;
    changed = true;
    if (active) online.add(uid); else online.delete(uid);
  }
  if (changed) renderLinks();
}

function watchFriends(rows) {
  links = new Map(rows.map(link => [link.id, link]));
  loaded = true;
  const friendIds = new Set(acceptedLinks().map(other));
  for (const [uid, item] of presence) {
    if (friendIds.has(uid)) continue;
    item.unsubscribe();
    presence.delete(uid);
    online.delete(uid);
  }
  for (const uid of friendIds) {
    if (presence.has(uid)) continue;
    const current = store, item = {seen: 0};
    presence.set(uid, item);
    item.unsubscribe = current.watchPresence(uid, seen => {
      if (store !== current || presence.get(uid) !== item) return;
      item.seen = seen;
      refreshOnline();
    });
  }
  for (const link of rows) remember(other(link));
  updateRoomInvites();
  renderLinks();
  renderChallenges();
}

function openChallenge(uid) {
  const invite = inviteRows.find(row => other(row) === uid && challengeActive(row));
  if (invite) {
    $('socialChallengesWrap').scrollIntoView({block: 'nearest'});
    notice('У вас уже есть действующий вызов с этим другом.');
    return;
  }
  challengeFriend = uid;
  $('socialChallengePlayer').textContent = nameOf(uid);
  status($('socialChallengeError'), '');
  challengeDialog.showModal();
  gameSelect.focus();
}

$('socialChallengeCancel').onclick = () => challengeDialog.close();
challengeDialog.addEventListener('close', () => { challengeFriend = null; });
$('socialChallengeForm').onsubmit = event => {
  event.preventDefault();
  const uid = challengeFriend, game = gameSelect.value;
  if (!uid || !games.has(game)) return;
  action(event.currentTarget.querySelector('[type="submit"]'), async current => {
    const attempt = current.createAttempt();
    await current.newChallenge(uid, game, attempt);
    if (store !== current) return;
    rooms.automatic.add(attempt);
    rooms.schedule();
    challengeDialog.close();
  }, text => status($('socialChallengeError'), text));
};

function challengeAction(invite, label, next, kind = '') {
  return button(label, node => action(node, async current => {
    if (next === 'accepted' && !rooms.canOpen(invite)) {
      throw new Error('Завершите текущую комнату, чтобы принять вызов.');
    }
    await current.changeChallenge(invite, next);
    if (store === current && next === 'accepted') {
      rooms.automatic.add(invite.attempt);
      rooms.schedule();
    }
  }), kind);
}

function renderChallenges() {
  if (!store) return;
  const context = window.ROOM.context();
  const rows = inviteRows.filter(invite => (links.get(invite.id)?.status === 'accepted' && challengeActive(invite))
    || (invite.from === store.uid && ['declined', 'cancelled'].includes(invite.status)
      && Date.now() - timeOf(invite.updatedAt) < 120_000))
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  $('socialChallengesWrap').hidden = !rows.length;
  list('socialChallenges', rows.map(invite => {
    const incoming = invite.to === store.uid, uid = other(invite);
    const cancel = () => challengeAction(invite, 'Отменить', 'cancelled', 'social-quiet');
    let hint, controls = [];
    if (invite.status === 'pending') {
      hint = incoming ? 'Приглашает сыграть' : 'Ждём ответа';
      controls = incoming ? [challengeAction(invite, 'Принять', 'accepted', 'main'), challengeAction(invite, 'Отклонить', 'declined')]
        : [cancel()];
    } else if (invite.status === 'declined' || invite.status === 'cancelled') {
      hint = invite.status === 'declined' ? 'Вызов отклонён' : 'Вызов отменён';
    } else {
      const connecting = context.friendAttempt === invite.attempt && context.state !== 'error';
      const ready = invite.status === 'ready' || !incoming;
      hint = connecting ? 'Подключаемся' : ready ? 'Вызов принят' : 'Ждём, когда друг откроет комнату';
      if (ready && rooms.canOpen(invite, context)) controls.push(button('Открыть комнату', () => rooms.open(invite), 'main'));
      if (!context.game || context.friendAttempt !== invite.attempt) controls.push(cancel());
    }
    return row(uid, (games.get(invite.game) || 'Игра') + ' · ' + hint, controls);
  }));
  renderBadge();
}

function renderBadge() {
  const count = [...links.values()].filter(link => link.to === store?.uid && link.status === 'pending').length
    + inviteRows.filter(invite => invite.to === store?.uid && invite.status === 'pending'
      && links.get(invite.id)?.status === 'accepted' && challengeActive(invite)).length;
  for (const id of ['friendsBadge', 'stageFriendsBadge']) status($(id), count ? String(count) : '');
  $('stageFriends').setAttribute('aria-label', count ? 'Друзья, новые приглашения: ' + count : 'Друзья');
}

function updateRoomInvites() {
  if (loaded) rooms.update(inviteRows.filter(invite => links.get(invite.id)?.status === 'accepted'));
}

function switchAccount(user) {
  for (const unsubscribe of unsubs) unsubscribe();
  unsubs = [];
  for (const item of presence.values()) item.unsubscribe();
  profiles.clear();
  presence.clear();
  online.clear();
  links.clear();
  inviteRows = [];
  loaded = false;
  searchResults = [];
  $('socialSearch').value = '';
  status($('socialSearchStatus'), '');
  if (challengeDialog.open) challengeDialog.close();
  challengeFriend = null;
  chat.close();
  notice();

  const db = playerId(user?.uid) ? database() : null;
  const current = db ? new SocialStore(db, user.uid) : null;
  store = current;
  rooms.reset(store);
  $('socialGuest').hidden = !!user;
  $('socialPane').hidden = !user;
  if (!current) {
    for (const id of ['socialFriends', 'socialRequests', 'socialChallenges', 'socialSearchResults']) list(id, []);
    renderBadge();
    if (user) notice('Друзья сейчас недоступны.', true);
    return;
  }

  renderLinks();
  renderChallenges();
  const failure = error => {
    if (store === current) notice(error.code === 'permission-denied' ? 'Список друзей сейчас недоступен.' : errorText(error), true);
  };
  unsubs.push(current.watchFriendships(rows => { if (store === current) watchFriends(rows); }, failure));
  unsubs.push(current.watchChallenges(rows => {
    if (store !== current) return;
    inviteRows = rows;
    for (const invite of rows) if (challengeActive(invite)) remember(other(invite));
    updateRoomInvites();
    renderChallenges();
  }, failure));
}

onAuthStateChanged(auth, switchAccount);
setInterval(() => {
  if (!store || document.hidden) return;
  refreshOnline();
  rooms.schedule();
  if (!page.hidden) renderChallenges();
}, 15_000);
