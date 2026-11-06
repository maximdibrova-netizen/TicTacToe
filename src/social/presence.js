import {onAuthStateChanged} from 'firebase/auth';
import {doc, serverTimestamp, setDoc} from 'firebase/firestore';
import {publishPlayer} from './store.js';
import {playerId} from './core.js';

const HEARTBEAT_MS = 60_000;

export function startPresence(auth, database) {
  if (window.top !== window) return;

  let user = null, db = null, lastBeat = 0, pending = false, blocked = false;
  let profileVersion = 0;

  function publish() {
    if (!user || !db || !navigator.onLine) return;
    const version = ++profileVersion;
    const current = user;
    publishPlayer(db, current, () => version === profileVersion && auth.currentUser?.uid === current.uid).catch(() => {});
  }

  function heartbeat() {
    if (!user || !db || pending || blocked || document.hidden || !navigator.onLine) return;
    const current = user;
    const now = Date.now(), key = 'mdgames-presence-' + current.uid;
    let recent = lastBeat;
    try { recent = Math.max(recent, Number(localStorage.getItem(key)) || 0); } catch (_) {}
    if (now - recent < HEARTBEAT_MS - 5_000) return;
    pending = true;
    setDoc(doc(db, 'socialPresence', current.uid), {lastSeenAt: serverTimestamp()}).then(() => {
      if (auth.currentUser?.uid !== current.uid) return;
      lastBeat = now;
      try { localStorage.setItem(key, String(now)); } catch (_) {}
    }).catch(error => {
      if (auth.currentUser?.uid === current.uid && error.code === 'permission-denied') blocked = true;
    }).finally(() => {
      if (auth.currentUser?.uid === current.uid) pending = false;
    });
  }

  onAuthStateChanged(auth, account => {
    ++profileVersion;
    user = playerId(account?.uid) ? account : null;
    db = user ? database() : null;
    pending = blocked = false;
    lastBeat = 0;
    publish();
    heartbeat();
  });
  addEventListener('account:profile-updated', () => { user = auth.currentUser; publish(); });
  addEventListener('online', () => { publish(); heartbeat(); });
  document.addEventListener('visibilitychange', heartbeat);
  setInterval(heartbeat, HEARTBEAT_MS);
}
