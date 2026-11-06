// Run with the demo-mdgames Auth and Firestore emulators and built site.
const {chromium} = require('playwright');
const {PeerServer} = require('peer');
const {createServer} = require('node:http');
const {readFile} = require('node:fs');
const {resolve, sep} = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const authPort = process.env.AUTH_EMULATOR_PORT || 9099;
const firestorePort = process.env.FIRESTORE_EMULATOR_PORT || 8080;
const stamp = Date.now();
const local = '127.0.0.1';

async function test() {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://' + local).pathname;
    const relative = pathname === '/peerjs.min.js' ? '/node_modules/peerjs/dist/peerjs.min.js' : pathname;
    const file = resolve(root, '.' + relative + (relative.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) {
      response.writeHead(404).end();
      return;
    }
    readFile(file, (error, body) => {
      response.writeHead(error ? 404 : 200, {'Content-Type': file.endsWith('.html')
        ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'}).end(error ? '' : body);
    });
  }).listen(0, local);
  await new Promise(done => server.once('listening', done));
  const peerServer = await new Promise(done => PeerServer({host: local, port: 0, path: '/'}, done));
  const base = 'http://' + local + ':' + server.address().port;
  const params = new URLSearchParams({
    authEmulator: authPort,
    firestoreEmulator: firestorePort,
    peer: local + ':' + peerServer.address().port,
    peerlib: base + '/peerjs.min.js'
  });
  let browser;
  const errors = [];

  async function player(name, suffix, viewport) {
    const context = await browser.newContext({viewport, serviceWorkers: 'block'});
    await context.route('**/*', route => new URL(route.request().url()).hostname === local ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => errors.push(suffix + ': ' + error.message));
    await page.goto(base + '/?' + params);
    await page.locator('#friendsTab').click();
    await page.locator('#socialSignIn').click();
    await page.locator('#accountRegisterTab').click();
    await page.locator('#accountName').fill(name);
    await page.locator('#accountEmail').fill('social-' + stamp + '-' + suffix + '@example.com');
    await page.locator('#accountPassword').fill('social-testing-123');
    await page.locator('#accountSubmit').click();
    await page.locator('#accountDialog').waitFor({state: 'hidden'});
    await page.locator('#socialSearch').waitFor();
    await page.waitForFunction(async ({name, firestorePort}) => {
      const user = window.GameAccount.currentUser();
      if (user?.displayName !== name) return false;
      const response = await fetch('http://127.0.0.1:' + firestorePort
        + '/v1/projects/demo-mdgames/databases/(default)/documents/socialProfiles/' + user.uid, {
        headers: {Authorization: 'Bearer ' + await user.getIdToken()}
      });
      return response.ok && (await response.json()).fields.name.stringValue === name;
    }, {name, firestorePort});
    return page;
  }

  const search = async (page, term, expected) => {
    await page.locator('#socialSearch').fill(term);
    await page.locator('#socialSearchForm button').click();
    return page.locator('#socialSearchResults li').filter({hasText: expected});
  };
  const openChat = page => page.locator('#socialFriends').getByRole('button', {name: 'Написать'}).click();
  const send = async (page, text) => {
    await page.locator('#socialMessage').fill(text);
    await page.locator('#socialMessageForm button').click();
  };
  const invite = async (page, game) => {
    await page.locator('#socialFriends').getByRole('button', {name: 'Вызвать'}).click();
    await page.locator('#socialGameSelect').selectOption(game);
    await page.locator('#socialChallengeForm button[type=submit]').click();
    await page.locator('#socialChallengeDialog').waitFor({state: 'hidden'});
  };

  try {
    browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
    const alice = await player('Алёна ' + stamp, 'a', {width: 1300, height: 920});
    const bob = await player('Борис ' + stamp, 'b', {width: 390, height: 844});
    const aliceId = await alice.evaluate(() => window.GameAccount.currentUser().uid);
    const bobId = await bob.evaluate(() => window.GameAccount.currentUser().uid);
    await (await search(bob, '#' + aliceId, 'Алёна ' + stamp)).waitFor();
    await bob.locator('#gamesTab').click();
    await (await search(alice, 'бОРис ' + stamp, 'Борис ' + stamp)).getByRole('button', {name: 'Добавить'}).click();
    await bob.locator('#friendsBadge').filter({hasText: '1'}).waitFor();
    await bob.locator('#friendsTab').click();
    await bob.locator('#socialRequests').getByRole('button', {name: 'Принять'}).click();
    for (const page of [alice, bob]) await page.locator('#socialFriends .social-presence.online').waitFor();
    console.log('Search by name and code, incoming badge, friendship consent and live presence PASS');

    await openChat(alice);
    await openChat(bob);
    const text = '<b>Привет!</b>';
    await send(alice, text);
    await bob.locator('#socialMessageList p').getByText(text, {exact: true}).waitFor();
    assert.equal(await bob.locator('#socialMessageList b').count(), 0);
    await send(bob, 'Играем?');
    await alice.locator('#socialMessageList p').getByText('Играем?', {exact: true}).waitFor();
    for (const page of [alice, bob]) {
      assert.ok(await page.evaluate(() => document.getElementById('home').scrollWidth <= document.getElementById('home').clientWidth));
    }
    if (process.env.SOCIAL_SCREENSHOTS) {
      await alice.screenshot({path: resolve(root, 'test-results/social-desktop.png')});
      await bob.screenshot({path: resolve(root, 'test-results/social-mobile.png')});
    }
    await bob.reload();
    await bob.locator('#friendsTab').click();
    await openChat(bob);
    await bob.locator('#socialMessageList p').getByText(text, {exact: true}).waitFor();
    await bob.locator('#socialChatBack').click();
    console.log('Two-way chat, safe text rendering, retained history and narrow layout PASS');

    await invite(alice, 'chess');
    await bob.locator('#socialChallenges').getByRole('button', {name: 'Отклонить'}).click();
    await alice.locator('#socialChallenges').getByText(/Вызов отклонён/).waitFor();
    await invite(alice, 'ttt');
    await bob.locator('#socialChallenges').getByRole('button', {name: 'Принять'}).click();
    try {
      for (const page of [alice, bob]) {
        await page.waitForFunction(() => !document.querySelector('#stage').hidden && window.ROOM.context().game === 'ttt');
      }
    } catch (error) {
      for (const page of [alice, bob]) console.error(await page.evaluate(() => ({
        room: window.ROOM.context(), status: document.getElementById('socialNotice').textContent,
        challenges: document.getElementById('socialChallenges').textContent,
        connection: document.getElementById('room').textContent
      })));
      throw error;
    }
    const hostContext = await alice.evaluate(() => {
      const {role, instance, friendAttempt, peerUid, ranked} = window.ROOM.context();
      return {role, instance, friendAttempt, peerUid, ranked};
    });
    const guestContext = await bob.evaluate(() => {
      const {role, instance, friendAttempt, peerUid} = window.ROOM.context();
      return {role, instance, friendAttempt, peerUid};
    });
    assert.equal(hostContext.role, 'host');
    assert.equal(guestContext.role, 'guest');
    assert.equal(hostContext.instance, guestContext.instance);
    assert.equal(hostContext.friendAttempt, guestContext.friendAttempt);
    assert.equal(hostContext.peerUid, bobId);
    assert.equal(guestContext.peerUid, aliceId);
    assert.equal(hostContext.ranked, false);
    const host = alice.frameLocator('#frame'), guest = bob.frameLocator('#frame');
    await host.locator('#netCreate').click();
    await host.locator('#game').waitFor();
    await guest.locator('#game').waitFor();
    const hostStarts = /Твой ход/.test(await host.locator('#status').textContent());
    const cell = '#big [data-i="0"]';
    await (hostStarts ? host : guest).locator(cell).click();
    await (hostStarts ? guest : host).locator(cell + ' svg').waitFor();
    await alice.locator('#stageFriends').click();
    await alice.locator('#socialResume').click();
    await host.locator('#game').waitFor();
    assert.deepEqual(errors, []);
    console.log('Decline, accepted private game, shared instance, real move and return from Friends PASS');
  } finally {
    await browser?.close();
    server.close();
    peerServer.close();
  }
}

test().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
