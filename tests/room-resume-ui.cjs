const {chromium} = require('playwright');
const {PeerServer} = require('peer');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

async function main() {
  const web = http.createServer((request, response) => {
    let route = new URL(request.url, 'http://localhost').pathname;
    if (route.endsWith('/')) route += 'index.html';
    if (route === '/peerjs.min.js') route = '/node_modules/peerjs/dist/peerjs.min.js';
    fs.readFile(path.join(root, route), (error, body) => {
      response.statusCode = error ? 404 : 200;
      response.setHeader('Content-Type', route.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript');
      response.end(error ? '' : body);
    });
  });
  await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
  const peer = await new Promise(resolve => PeerServer({port: 0, path: '/'}, resolve));
  const base = 'http://127.0.0.1:' + web.address().port;
  const url = base + '/?peer=127.0.0.1:' + peer.address().port + '&peerlib=' + base + '/peerjs.min.js';
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const errors = [];
  const views = [];
  async function page() {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const p = await context.newPage();
    p.setDefaultTimeout(10000);
    p.on('pageerror', error => errors.push(error.message));
    await p.addInitScript(() => {
      if (window !== parent) return;
      let peer;
      Object.defineProperty(window, 'Peer', {
        configurable: true,
        get: () => peer,
        set: value => {
          peer = value;
          const connect = value.prototype.connect;
          value.prototype.connect = function (...args) {
            const connection = connect.apply(this, args);
            window.roomLinkForTest = connection;
            return connection;
          };
        }
      });
    });
    await p.goto(url);
    views.push(p);
    return p;
  }
  const frame = p => p.frameLocator('#frame');
  const select = p => p.locator('a[data-g="ttt"]').click();
  const back = p => p.locator('#backBtn').click();
  const resume = p => p.locator('#resumeBtn').click();
  const instance = p => p.evaluate(() => ROOM.context().instance);
  const version = p => p.evaluate(() => document.querySelector('#frame').contentWindow.GameEvents.current()?.version);
  const ready = p => p.waitForFunction(() => document.querySelector('#frame').contentWindow.GameEvents?.current()?.mode === 'online');
  async function start(host) {
    await frame(host).locator('#netCreate').click();
    for (const p of views) await ready(p);
  }
  try {
    const host = await page(), guest = await page();
    await host.locator('#mkRoom').click();
    const code = (await host.locator('#room .code').textContent()).trim();
    await guest.locator('#joinCode').fill(code);
    await guest.locator('#joinGo').click();
    await host.waitForFunction(() => ROOM.context().state === 'live' && ROOM.context().online);
    await select(host);
    await guest.locator('#choiceAccept').click();
    await start(host);
    const match = await instance(host);
    const first = await host.evaluate(() => { const e = document.querySelector('#frame').contentWindow.GameEvents.current(); return e.mine.includes(e.turn); }) ? host : guest;
    await frame(first).locator('#big [data-i="0"]').click();
    for (const p of views) await p.waitForFunction(() => document.querySelector('#frame').contentWindow.GameEvents.current()?.version === 1);

    await frame(guest).locator('#homeBtn').click();
    await guest.evaluate(() => { document.querySelector('#frame').contentWindow.resumeProbe = 42; });
    await host.evaluate(() => { const c = ROOM.context(); Net2P.send({t: 'pick', inst: c.instance, g: c.game, ranked: c.ranked}); });
    await guest.waitForTimeout(400);
    assert.equal(await guest.locator('#home').isVisible(), true, 'room re-announcement must not reopen or replace the game');
    assert.equal(await guest.evaluate(() => document.querySelector('#frame').contentWindow.resumeProbe), 42);
    await resume(guest);
    assert.equal(await version(guest), 1);
    await back(host);
    await select(host);
    await host.locator('#sameGameResume').click();
    assert.equal(await version(host), 1);
    assert.equal(await instance(host), match);

    await back(guest);
    await select(guest);
    await guest.locator('#sameGameNew').click();
    await host.locator('#choiceDecline').click();
    await guest.locator('#choiceDialog').waitFor({state: 'hidden'});
    await resume(guest);
    assert.equal(await instance(guest), match);
    assert.equal(await version(guest), 1);
    console.log('Both players can browse and resume an unchanged game; declining a new game keeps it PASS');

    await back(guest);
    await guest.evaluate(() => window.roomLinkForTest.close());
    await guest.waitForFunction(() => ROOM.context().state === 'joining');
    assert.equal(await guest.locator('#resumeBtn').isVisible(), true);
    await guest.waitForFunction(() => {
      const game = document.querySelector('#frame').contentWindow.GameEvents?.current();
      return ROOM.context().state === 'live' && ROOM.context().online && game?.version === 1;
    });
    assert.equal(await guest.locator('#home').isVisible(), true);
    await resume(guest);
    assert.equal(await instance(guest), match);
    await frame(guest).locator('#game').waitFor();
    console.log('Real room-link reconnect restores the guest board and preserves the menu choice PASS');

    await frame(guest).locator('#surrenderBtn').click();
    await frame(guest).locator('#matchYes').click();
    await frame(guest).locator('#matchMenu').click();
    await guest.locator('#home').waitFor();
    await resume(guest);
    await frame(guest).locator('#matchAnalyze').waitFor();
    await back(guest);
    await select(guest);
    await guest.locator('#sameGameNew').click();
    await host.locator('#choiceAccept').click();
    await start(host);
    assert.notEqual(await instance(guest), match);
    assert.equal(await version(guest), 0);

    await guest.locator('#interruptGame').click();
    await guest.locator('#interruptCancel').click();
    assert.equal(await version(guest), 0);
    await guest.locator('#interruptGame').click();
    await guest.locator('#interruptConfirm').click();
    for (const p of views) {
      await p.waitForFunction(() => !ROOM.context().game && ROOM.context().state === 'live' && ROOM.context().online);
      await p.locator('#home').waitFor();
      assert.equal(await p.locator('#resumeBtn').isVisible(), false);
    }
    console.log('Result menu keeps analysis; new game requires acceptance; guest can interrupt without closing room PASS');

    await host.evaluate(() => localStorage.setItem('clock-ttt', JSON.stringify({v:2, enabled:true, preset:'custom', min:.045, inc:0, per:false, pmin:[.045,.045], pinc:[0,0]})));
    await select(host);
    await guest.locator('#choiceAccept').click();
    await start(host);
    const flag = await host.evaluate(() => document.querySelector('#frame').contentWindow.GameEvents.current().turn);
    await back(host);
    await frame(guest).locator('.gc-result').waitFor();
    assert.match(await frame(guest).locator('.gc-result p').textContent(), /поражение по времени/);
    await frame(guest).locator('.gc-menu').click();
    await guest.locator('#home').waitFor();
    for (const p of views) {
      await resume(p);
      await frame(p).locator('.gc-analyze').waitFor();
      const result = await p.evaluate(() => document.querySelector('#frame').contentWindow.GameEvents.current());
      assert.equal(result.result.reason, 'time');
      assert.equal(result.score, result.mine.includes(flag) ? 0 : 1);
      await frame(p).locator('.gc-analyze').click();
      assert.equal(await frame(p).locator('.gc-result').isVisible(), false);
      assert.equal(await frame(p).locator('#game').isVisible(), true);
    }
    await host.locator('#interruptGame').click();
    await host.locator('#interruptConfirm').click();
    await guest.waitForFunction(() => !ROOM.context().game && ROOM.context().state === 'live');
    assert.deepEqual(errors, []);
    console.log('Clock continues in catalogue, both see time loss, and both can return to analysis PASS');
  } finally {
    await browser.close();
    web.close();
    peer.close();
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
