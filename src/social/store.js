import {
  addDoc, collection, doc, endAt, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, startAt, where
} from 'firebase/firestore';
import RatingView from '../ratings/view-core.cjs';
import {members, pairId, playerId, searchName, timeOf, MESSAGE_LIMIT, PAGE_SIZE} from './core.js';

export async function publishPlayer(db, user, current) {
  const ref = doc(db, 'socialProfiles', user.uid);
  const name = RatingView.nickname(user), search = searchName(name);
  const old = (await getDoc(ref)).data();
  if (current() && (old?.name !== name || old.search !== search)) {
    await setDoc(ref, {name, search, updatedAt: serverTimestamp()});
  }
}

const readRows = snapshot => snapshot.docs.map(item => ({...item.data(), id: item.id}));
const playerRow = snapshot => snapshot.exists() ? {uid: snapshot.id, name: snapshot.data().name} : null;
const visibleResults = snapshot => snapshot.docs.map(playerRow);

export class SocialStore {
  constructor(db, uid) {
    this.db = db;
    this.uid = uid;
  }

  async profile(uid) {
    const current = playerRow(await getDoc(doc(this.db, 'socialProfiles', uid)));
    return current || playerRow(await getDoc(doc(this.db, 'ratingProfiles', uid)));
  }

  async search(input) {
    const term = input.trim();
    if (term.startsWith('#')) {
      const uid = term.slice(1);
      if (!playerId(uid) || uid === this.uid) return [];
      const player = await this.profile(uid);
      return player ? [player] : [];
    }
    const key = searchName(term);
    if (key.length < 2) return [];
    const prefix = (name, field, value) => getDocs(query(collection(this.db, name),
      orderBy(field), startAt(value), endAt(value + '\uf8ff'), limit(20)));
    const recent = await prefix('socialProfiles', 'search', key);
    const found = new Map(visibleResults(recent).map(player => [player.uid, player]));
    // Previously rated accounts are discoverable before their next visit, too.
    if (found.size < 20) {
      const capitalized = term[0].toUpperCase() + term.slice(1).toLowerCase();
      const fallback = await Promise.all([...new Set([term, capitalized])]
        .map(value => prefix('ratingProfiles', 'name', value)));
      for (const result of fallback) {
        for (const player of visibleResults(result)) {
          if (!found.has(player.uid)) found.set(player.uid, player);
        }
      }
    }
    return [...found.values()].filter(player => playerId(player.uid) && player.uid !== this.uid).slice(0, 20);
  }

  watchFriendships(next, error) {
    return onSnapshot(query(collection(this.db, 'friendships'), where('members', 'array-contains', this.uid)),
      snapshot => next(readRows(snapshot)), error);
  }

  watchChallenges(next, error) {
    return onSnapshot(query(collection(this.db, 'friendChallenges'), where('members', 'array-contains', this.uid)),
      snapshot => next(readRows(snapshot)), error);
  }

  watchPresence(uid, next) {
    return onSnapshot(doc(this.db, 'socialPresence', uid),
      snapshot => next(timeOf(snapshot.data()?.lastSeenAt)), () => next(0));
  }

  requestFriend(uid) {
    return setDoc(doc(this.db, 'friendships', pairId(this.uid, uid)), {
      members: members(this.uid, uid), from: this.uid, to: uid, status: 'pending',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }

  changeFriend(link, accept) {
    const ref = doc(this.db, 'friendships', link.id);
    return runTransaction(this.db, async transaction => {
      const current = (await transaction.get(ref)).data();
      if (!current || current.status !== link.status || timeOf(current.createdAt) !== timeOf(link.createdAt)) {
        throw new Error('Запрос уже изменился. Проверьте список друзей.');
      }
      if (accept) transaction.update(ref, {status: 'accepted', updatedAt: serverTimestamp()});
      else transaction.delete(ref);
    });
  }

  messages(link) {
    return collection(this.db, 'friendships', link, 'messages');
  }

  watchMessages(link, next, error) {
    return onSnapshot(query(this.messages(link), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)), next, error);
  }

  olderMessages(link, cursor) {
    return getDocs(query(this.messages(link), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
  }

  sendMessage(link, text) {
    const value = text.trim();
    if (!value || value.length > MESSAGE_LIMIT) throw new Error('Введите сообщение до 1500 символов.');
    return addDoc(this.messages(link), {sender: this.uid, text: value, createdAt: serverTimestamp()});
  }

  newChallenge(uid, game, attempt) {
    return setDoc(doc(this.db, 'friendChallenges', pairId(this.uid, uid)), {
      members: members(this.uid, uid), from: this.uid, to: uid, game, attempt,
      status: 'pending', roomCode: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }

  createAttempt() {
    return doc(collection(this.db, 'friendChallenges')).id;
  }

  changeChallenge(challenge, status, roomCode) {
    const ref = doc(this.db, 'friendChallenges', challenge.id);
    return runTransaction(this.db, async transaction => {
      const current = (await transaction.get(ref)).data();
      if (current?.attempt !== challenge.attempt || current.status !== challenge.status) {
        throw new Error('Вызов уже изменился. Проверьте список вызовов.');
      }
      const patch = {status, updatedAt: serverTimestamp()};
      if (roomCode) patch.roomCode = roomCode;
      transaction.update(ref, patch);
    });
  }
}
