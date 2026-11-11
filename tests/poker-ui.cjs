const {chromium} = require('playwright');
const {PeerServer} = require('peer');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

async function main() {
  assert.ok(fs.existsSync(path.join(root, 'poker/index.html')), 'poker is built as a twelfth game');
  fs.mkdirSync(path.join(root, 'test-results'), {recursive: true});
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
  const query = '?peer=127.0.0.1:' + peer.address().port + '&peerlib=' + base + '/peerjs.min.js';
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const errors = [];
  async function page(width = 390) {
    const result = await browser.newPage({viewport: {width, height: 860}});
    result.setDefaultTimeout(15000);
    result.on('pageerror', e => errors.push(e.message));
    return result;
  }
  try {
    const host = await page(1320);
    await host.goto(base + '/poker/' + query);
    await host.locator('#pokerName').fill('Хозяин');
    await host.locator('#pokerAnte').fill('2');
    await host.locator('#pokerSeconds').fill('0');
    await host.locator('#pokerCreate').click();
    await host.locator('#pokerCode').waitFor();
    const code = await host.locator('#pokerCode').textContent();
    assert.match(code, /^[A-Z2-9]{8}$/);
    const players = [host];
    for (let index = 1; index <= 6; index++) {
      const guest = await page();
      await guest.goto(base + '/poker/' + query + (index === 1 ? '#' + code : ''));
      await guest.locator('#pokerName').fill('Друг ' + index);
      if (index !== 1) await guest.locator('#pokerJoinCode').fill(code.toLowerCase());
      await guest.locator('#pokerJoin').click();
      if (index === 6) {
        await guest.locator('#pokerNotice').filter({hasText: 'Все 6 мест заняты'}).waitFor();
        await guest.close();
      } else {
        await guest.locator('#pokerCode').filter({hasText: code}).waitFor();
        players.push(guest);
      }
    }
    await host.locator('#pokerSettings summary').click();
    await host.locator('#pokerDealer').selectOption('3');
    await host.locator('#pokerDeal').click();
    await host.locator('#pokerSeats [data-seat="3"] .dealer').waitFor();
    for (const p of players) {
      await p.locator('#pokerStreet').filter({hasText: 'Префлоп'}).waitFor();
      assert.equal(await p.locator('#pokerSeats [data-card]').count(), 2, 'only own cards are visible preflop');
    }
    assert.equal(await players[1].locator('#pokerSeats .poker-seat.is-mine [data-card]').count(), 2);
    await players[1].reload({waitUntil: 'domcontentloaded'});
    await players[1].locator('#pokerStreet').filter({hasText: 'Префлоп'}).waitFor();
    assert.equal(await players[1].locator('#pokerSeats .poker-seat.is-mine [data-seat-name]').textContent(), 'Друг 1');
    for (let i = 0; i < 6; i++) {
      const turn = Number(await host.locator('#pokerSeats .is-turn').getAttribute('data-seat'));
      await players[turn].locator(i === 0 ? '#pokerAllIn' : '#pokerCall').click();
      if (i < 5) await host.waitForFunction(previous => Number(document.querySelector('#pokerSeats .is-turn')?.dataset.seat) !== previous, turn);
    }
    await host.locator('#pokerStreet').filter({hasText: 'Вскрытие'}).waitFor();
    assert.equal(await host.locator('#pokerBoard [data-card]').count(), 5);
    assert.equal(await host.locator('#pokerSeats [data-card]').count(), 12);
    assert.match(await players[1].locator('#pokerResult').textContent(), /банк/i);
    assert.equal(await players[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await host.screenshot({path: path.join(root, 'test-results/poker-desktop.png')});
    await players[1].screenshot({path: path.join(root, 'test-results/poker-mobile.png')});
    console.log('Six independent players, link/code entry, full table, private hands, reconnection and showdown PASS');

    const owner = await page(), friend = await page(), third = await page();
    await owner.goto(base + '/' + query);
    await owner.locator('#mkRoom').click();
    const room = await owner.locator('#room .code').textContent();
    await friend.goto(base + '/' + query);
    await friend.locator('#joinCode').fill(room.trim());
    await friend.locator('#joinGo').click();
    await owner.waitForFunction(() => ROOM.context().state === 'live');
    await friend.locator('a[data-g=poker]').click();
    await owner.locator('#choiceAccept').click();
    const table = owner.frameLocator('#frame');
    const guestTable = friend.frameLocator('#frame');
    await table.locator('#pokerCode').waitFor();
    const pokerCode = await table.locator('#pokerCode').textContent();
    await guestTable.locator('#pokerCode').filter({hasText: pokerCode}).waitFor();
    await third.goto(base + '/poker/' + query + '#' + pokerCode);
    await third.locator('#pokerName').fill('Третий');
    await third.locator('#pokerJoin').click();
    await table.locator('#pokerCount').filter({hasText: '3 / 6'}).waitFor();
    await table.locator('#pokerSettings summary').click();
    await table.locator('#pokerSeconds').fill('2');
    await table.locator('#pokerReserve').fill('1');
    await table.locator('#pokerSave').click();
    await table.locator('#pokerDeal').click();
    await guestTable.locator('#pokerStreet').filter({hasText: 'Префлоп'}).waitFor();
    await third.locator('#pokerStreet').filter({hasText: 'Префлоп'}).waitFor();
    await guestTable.locator('#pokerClock').waitFor();
    await table.locator('#pokerSeats [data-seat="0"].is-folded').waitFor();
    assert.deepEqual(errors, []);
    console.log('Ordinary room proposal opens one real poker table, expandable to more friends PASS');
  } finally {
    await browser.close();
    web.close();
    peer.close();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
