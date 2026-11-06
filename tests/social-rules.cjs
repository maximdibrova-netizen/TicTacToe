// Run against a Firestore emulator. Each test account exists only in this namespace.
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const assert = require('node:assert/strict');
const {initializeTestEnvironment, assertSucceeds, assertFails} = require('@firebase/rules-unit-testing');
const {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp,
  setDoc, setLogLevel, startAt, endAt, Timestamp, updateDoc, where
} = require('firebase/firestore');

async function test() {
  setLogLevel('silent');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-social-rules',
    firestore: {host, port: Number(port), rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8')}
  });

  try {
    await env.clearFirestore();
    const player = uid => env.authenticatedContext(uid).firestore();
    const alice = player('Alice'), bob = player('bob'), other = player('other');
    const guest = env.unauthenticatedContext().firestore();
    const pair = 'Alice~bob', members = ['Alice', 'bob'];
    const profile = (db, uid) => doc(db, 'socialProfiles', uid);
    const seen = (db, uid) => doc(db, 'socialPresence', uid);
    const friendship = db => doc(db, 'friendships', pair);
    const challenge = db => doc(db, 'friendChallenges', pair);
    const message = (db, id) => doc(db, 'friendships', pair, 'messages', id);
    const inbox = (db, name, uid) => query(collection(db, name), where('members', 'array-contains', uid));
    const timestamps = () => ({createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
    const change = status => ({status, updatedAt: serverTimestamp()});

    await assertSucceeds(setDoc(profile(alice, 'Alice'), {name: 'Алёна', search: 'алена', updatedAt: serverTimestamp()}));
    await assertSucceeds(setDoc(profile(bob, 'bob'), {name: 'Боб', search: 'боб', updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(profile(alice, 'Alice'), {email: 'hidden@example.com', updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(profile(other, 'Alice'), {name: 'Wrong', updatedAt: serverTimestamp()}));
    await assertFails(getDoc(profile(guest, 'Alice')));
    await assertFails(getDocs(collection(other, 'socialProfiles')));
    await assertFails(getDocs(query(collection(other, 'socialProfiles'), limit(21))));
    const found = await assertSucceeds(getDocs(query(collection(other, 'socialProfiles'),
      orderBy('search'), startAt('але'), endAt('але\uf8ff'), limit(20))));
    assert.deepEqual(found.docs.map(row => row.id), ['Alice']);

    const pending = () => ({members, from: 'Alice', to: 'bob', status: 'pending', ...timestamps()});
    const text = (sender, value) => ({sender, text: value, createdAt: serverTimestamp()});
    const attempt = 'abcdefghijklmnopqrst';
    const invite = (game, id = attempt) => ({
      members, from: 'Alice', to: 'bob', game, attempt: id, status: 'pending', roomCode: '', ...timestamps()
    });
    await assertSucceeds(setDoc(seen(bob, 'bob'), {lastSeenAt: serverTimestamp()}));
    await assertFails(setDoc(seen(alice, 'bob'), {lastSeenAt: serverTimestamp()}));
    await assertFails(setDoc(seen(bob, 'bob'), {lastSeenAt: Timestamp.fromMillis(Date.now() + 60_000)}));
    await assertFails(getDoc(seen(alice, 'bob')));
    await assertFails(setDoc(doc(alice, 'friendships', 'bob~Alice'), pending()));
    await assertFails(setDoc(friendship(other), pending()));
    await assertFails(setDoc(friendship(alice), {...pending(), status: 'accepted'}));
    await assertSucceeds(setDoc(friendship(alice), pending()));
    await assertFails(setDoc(friendship(bob), {...pending(), from: 'bob', to: 'Alice'}));
    await assertFails(updateDoc(friendship(alice), change('accepted')));
    await assertFails(setDoc(message(alice, 'early'), text('Alice', 'Before acceptance')));
    await assertFails(setDoc(challenge(alice), invite('ttt')));
    assert.equal((await assertSucceeds(getDocs(inbox(bob, 'friendships', 'bob')))).size, 1);
    await assertFails(getDoc(friendship(other)));
    await assertFails(getDocs(inbox(other, 'friendships', 'bob')));
    await assertFails(getDocs(collection(bob, 'friendships')));
    await assertSucceeds(updateDoc(friendship(bob), change('accepted')));

    await assertSucceeds(getDoc(seen(alice, 'bob')));
    await assertFails(getDoc(seen(other, 'bob')));
    await assertFails(getDocs(query(collection(alice, 'socialPresence'), limit(20))));
    await assertSucceeds(setDoc(message(alice, 'hello'), text('Alice', 'Привет')));
    await assertSucceeds(setDoc(message(bob, 'reply'), text('bob', '<b>Ответ</b>')));
    const messages = db => query(collection(db, 'friendships', pair, 'messages'), orderBy('createdAt', 'desc'), limit(50));
    assert.deepEqual((await assertSucceeds(getDocs(messages(bob)))).docs.map(row => row.id), ['reply', 'hello']);
    await assertFails(getDocs(messages(other)));
    await assertFails(getDoc(message(guest, 'hello')));
    await assertFails(setDoc(message(other, 'intrusion'), text('other', 'Wrong')));
    await assertFails(setDoc(message(bob, 'spoof'), text('Alice', 'Wrong sender')));
    await assertFails(setDoc(message(bob, 'long'), text('bob', 'x'.repeat(1501))));
    await assertFails(updateDoc(message(alice, 'hello'), {text: 'Changed'}));

    await assertFails(setDoc(challenge(alice), invite('multi3')));
    await assertFails(setDoc(challenge(alice), {...invite('ttt'), roomCode: 'ABCDE'}));
    await assertSucceeds(setDoc(challenge(alice), invite('ttt')));
    await assertFails(getDoc(challenge(other)));
    assert.equal((await assertSucceeds(getDocs(inbox(bob, 'friendChallenges', 'bob')))).size, 1);
    await assertFails(getDocs(inbox(other, 'friendChallenges', 'Alice')));
    await assertFails(setDoc(challenge(alice), invite('go', 'tuvwxyzabcdefghijklm')));
    await assertFails(updateDoc(challenge(alice), change('accepted')));
    await assertFails(updateDoc(challenge(bob), {...change('accepted'), game: 'go'}));
    await assertSucceeds(updateDoc(challenge(bob), change('accepted')));
    await assertFails(updateDoc(challenge(bob), {...change('ready'), roomCode: 'ABCDE'}));
    await assertFails(updateDoc(challenge(alice), {...change('ready'), roomCode: 'bad'}));
    await assertSucceeds(updateDoc(challenge(alice), {...change('ready'), roomCode: 'ABCDE'}));
    await assertSucceeds(updateDoc(challenge(alice), {...change('ready'), roomCode: 'ABCDF'}));
    await assertFails(updateDoc(challenge(bob), change('opened')));
    await assertSucceeds(updateDoc(challenge(alice), change('opened')));
    await assertSucceeds(setDoc(challenge(alice), invite('go', 'tuvwxyzabcdefghijklm')));
    await env.withSecurityRulesDisabled(context => updateDoc(challenge(context.firestore()), {
      createdAt: Timestamp.fromMillis(Date.now() - 660_000)
    }));
    await assertFails(updateDoc(challenge(bob), change('accepted')));
    await assertSucceeds(setDoc(challenge(alice), invite('ttt')));
    await assertSucceeds(deleteDoc(friendship(bob)));
    await assertFails(getDoc(seen(alice, 'bob')));
    await assertFails(getDoc(message(alice, 'hello')));
    await assertFails(setDoc(message(alice, 'removed'), text('Alice', 'After removal')));
    await assertFails(updateDoc(challenge(bob), change('accepted')));
    await assertSucceeds(updateDoc(challenge(bob), change('cancelled')));
    console.log('Social rules PASS: directory, consent, private presence and messages, challenge transitions and expiry');
  } finally {
    await env.cleanup();
  }
}

test().catch(error => { console.error(error); process.exitCode = 1; });
