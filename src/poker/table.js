class PokerTable {
  static alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  static code(value) {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : '';
  }

  static generateCode() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), value => PokerTable.alphabet[value % 32]).join('');
  }

  static seatToken(code) {
    const key = 'poker-seat-' + code;
    let token;
    try { token = sessionStorage.getItem(key); } catch (_) {}
    if (!/^[a-f0-9]{32}$/.test(token || '')) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
      try { sessionStorage.setItem(key, token); } catch (_) {}
    }
    return token;
  }

  static name(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
  }

  constructor(render, announce, options) {
    this.render = render;
    this.announce = announce;
    this.options = options;
    this.session = null;
    this.heartbeatAt = 0;
    setInterval(() => this.pulse(), 200);
  }

  host(name, settings) {
    this.leave();
    const config = Holdem.settings(settings);
    const seats = Array(Holdem.SEATS).fill(null);
    seats[0] = {name, stack: config.stack, online: true};
    const session = this.session = {role: 'host', code: PokerTable.generateCode(), seats, config,
      ready: false, error: '', number: 0, hand: null};
    this.openHost(session, 0);
    this.render();
  }

  openHost(session, attempts) {
    const peer = session.peer = new Peer('mdgames-poker-v1-' + session.code, this.options);
    peer.on('open', () => {
      if (this.session !== session || session.peer !== peer) return;
      session.ready = true;
      session.error = '';
      clearTimeout(session.openTimer);
      this.publish();
      this.announce(session.code);
    });
    peer.on('connection', connection => {
      if (this.session !== session) { connection.close(); return; }
      const pending = setTimeout(() => {
        if (!session.seats.some(seat => seat?.connection === connection)) connection.close();
      }, 12000);
      connection.on('data', packet => this.receive(session, connection, packet));
      const lost = () => { clearTimeout(pending); this.drop(session, connection, false); };
      connection.on('close', lost);
      connection.on('error', lost);
    });
    peer.on('disconnected', () => this.reconnectPeer(session, peer));
    peer.on('error', error => {
      if (this.session !== session || session.peer !== peer) return;
      if (!session.ready && error.type === 'unavailable-id' && attempts < 3) {
        peer.destroy();
        session.code = PokerTable.generateCode();
        this.openHost(session, attempts + 1);
      } else if (!session.ready) this.fail(session, 'Не удалось открыть стол. Проверьте подключение и попробуйте снова.');
    });
    clearTimeout(session.openTimer);
    session.openTimer = setTimeout(() => {
      if (!session.ready) this.fail(session, 'Сервер связи не ответил. Откройте стол ещё раз.');
    }, 16000);
  }

  reconnectPeer(session, peer) {
    setTimeout(() => {
      if (this.session === session && session.peer === peer && !peer.destroyed && peer.disconnected) peer.reconnect();
    }, 1200);
  }

  join(code, name) {
    this.leave();
    const session = this.session = {role: 'guest', code, name, token: PokerTable.seatToken(code), ready: false, error: '', seen: Date.now()};
    const peer = session.peer = new Peer(this.options);
    session.openTimer = setTimeout(() => {
      if (!session.ready) this.fail(session, 'Не удалось соединиться со столом. Проверьте код или сеть.');
    }, 16000);
    peer.on('open', () => {
      if (this.session !== session || session.error || session.connection) return;
      const connection = session.connection = peer.connect('mdgames-poker-v1-' + code, {reliable: true, serialization: 'json'});
      connection.on('open', () => this.send(connection, {type: 'hello', token: session.token, name}));
      connection.on('data', packet => {
        if (this.session !== session || session.error || !packet || typeof packet !== 'object') return;
        session.seen = Date.now();
        if (packet.type === 'ping') { this.send(connection, {type: 'pong'}); return; }
        if (packet.type === 'closed') { this.fail(session, 'Хозяин закрыл стол.'); return; }
        if (packet.type === 'full') { this.fail(session, 'Все 6 мест заняты. Попробуйте позже.'); return; }
        if (packet.type !== 'table' || !Array.isArray(packet.seats) || packet.seats.length !== Holdem.SEATS ||
            !Number.isInteger(packet.me) || !packet.seats[packet.me]) return;
        session.ready = true;
        clearTimeout(session.openTimer);
        session.view = packet;
        this.render();
      });
      const lost = () => this.fail(session, 'Связь со столом потеряна. Подключитесь снова, чтобы вернуться на своё место.');
      connection.on('close', lost);
      connection.on('error', lost);
    });
    peer.on('disconnected', () => this.reconnectPeer(session, peer));
    peer.on('error', error => {
      if (!session.ready) this.fail(session, error.type === 'peer-unavailable' ? 'Стол с таким кодом не найден. Проверьте, открыт ли он.' : 'Не удалось подключиться к столу.');
    });
    this.render();
  }

  fail(session, message) {
    if (this.session !== session || session.error) return;
    session.error = message;
    session.ready = false;
    clearTimeout(session.openTimer);
    session.peer?.destroy();
    this.render();
  }

  send(connection, message) {
    if (!connection?.open) return false;
    try { connection.send(message); return true; } catch (_) { return false; }
  }

  active(session = this.session) { return !!(session?.hand && !session.hand.result); }

  receive(session, connection, packet) {
    if (this.session !== session || !session.ready || !packet || typeof packet !== 'object') return;
    let seat = session.seats.findIndex(p => p?.connection === connection && p.online);
    if (seat < 0) {
      if (packet.type === 'hello') this.admit(session, connection, packet);
      return;
    }
    session.seats[seat].seen = Date.now();
    if (packet.type === 'leave') { this.drop(session, connection, true); return; }
    if (packet.type === 'rebuy') { this.rebuy(seat); return; }
    if (packet.type === 'act') {
      const {hand, number} = session;
      if (hand && packet.number === number && packet.revision === hand.revision &&
          Holdem.act(hand, seat, packet.action)) this.afterAction(session);
      else this.send(connection, this.snapshot(session, seat));
    }
  }

  admit(session, connection, packet) {
    const name = PokerTable.name(packet.name);
    if (!name || typeof packet.token !== 'string' || !/^[a-f0-9]{32}$/.test(packet.token)) return;
    this.prune(session, Date.now());
    let index = session.seats.findIndex(seat => seat?.token === packet.token && !seat.released);
    if (index < 0) index = session.seats.indexOf(null);
    if (index < 0) {
      this.send(connection, {type: 'full'});
      setTimeout(() => connection.close(), 100);
      return;
    }
    const existing = session.seats[index];
    const oldConnection = existing?.connection;
    session.seats[index] = Object.assign(existing || {name, stack: session.config.stack}, {
      connection, online: true, seen: Date.now(), offlineAt: null, token: packet.token
    });
    if (oldConnection && oldConnection !== connection) oldConnection.close();
    this.publish();
  }

  drop(session, connection, released) {
    if (this.session !== session) return;
    const seat = session.seats.find(p => p?.connection === connection && p.online);
    if (!seat) return;
    seat.online = false;
    seat.offlineAt = Date.now();
    seat.released = released;
    this.prune(session, seat.offlineAt);
    this.publish();
  }

  prune(session, now) {
    if (this.active(session)) return false;
    let removed = false;
    session.seats.forEach((seat, i) => {
      if (seat && !seat.online && (seat.released || now - seat.offlineAt >= 60000)) {
        session.seats[i] = null;
        removed = true;
      }
    });
    return removed;
  }

  configure(settings) {
    const session = this.session;
    if (session?.role !== 'host' || this.active(session)) return false;
    session.config = Holdem.settings(settings);
    if (!session.hand) {
      for (const seat of session.seats) if (seat) seat.stack = session.config.stack;
    }
    this.publish();
    return true;
  }

  deal(firstDealer) {
    const session = this.session;
    if (session?.role !== 'host' || !session.ready || this.active(session)) return false;
    const previous = session.hand;
    const players = session.seats.map(seat => seat?.online && seat.stack ? seat : null);
    if (players.filter(Boolean).length < 2) return false;
    let previousButton = previous?.button ?? -1;
    if (!previous && Number.isInteger(firstDealer) && players[firstDealer]) {
      previousButton = (firstDealer + Holdem.SEATS - 1) % Holdem.SEATS;
    }
    // With two players, the previous big blind becomes the small blind when still seated.
    if (previous && players.filter(Boolean).length === 2 && players[previous.big]) {
      previousButton = players.findIndex((seat, index) => seat && index !== previous.big);
    }
    session.hand = Holdem.newHand(players, session.config, previousButton);
    session.handSeats = players;
    session.number++;
    this.afterAction(session);
    return true;
  }

  rebuy(index) {
    const session = this.session;
    if (session?.role === 'guest') return this.send(session.connection, {type: 'rebuy'});
    const seat = session?.seats[index];
    if (!seat?.online || seat.stack !== 0 || this.active(session)) return false;
    seat.stack = session.config.stack;
    this.publish();
    return true;
  }

  act(action) {
    const session = this.session;
    if (!session?.ready) return false;
    if (session.role === 'guest') {
      const {hand, number} = session.view;
      if (!hand?.options) return false;
      return this.send(session.connection, {type: 'act', number, revision: hand.revision, action});
    }
    if (!session.hand || !Holdem.act(session.hand, 0, action)) return false;
    this.afterAction(session);
    return true;
  }

  afterAction(session) {
    if (session.hand.result) {
      for (const player of session.hand.players) if (player) session.seats[player.seat].stack = player.stack;
      this.prune(session, Date.now());
    }
    this.publish();
  }

  snapshot(session, me) {
    const hand = session.hand ? Holdem.view(session.hand, me) : null;
    const seats = session.seats.map(seat => seat && ({name: seat.name, stack: seat.stack, online: seat.online}));
    if (hand?.result) {
      // A replacement in the same seat cannot see a previous player's hole cards.
      hand.players.forEach((player, index) => {
        if (player && session.handSeats[index] !== session.seats[index]) {
          if (!hand.result.showdown || player.folded) player.cards = [];
          if (seats[index]) hand.players[index] = null;
        }
      });
    }
    return {type: 'table', code: session.code, me, number: session.number, config: session.config, seats, hand};
  }

  publish() {
    const session = this.session;
    if (!session?.ready || session.role !== 'host') return;
    session.view = this.snapshot(session, 0);
    session.seats.forEach((seat, index) => {
      if (index && seat?.online) this.send(seat.connection, this.snapshot(session, index));
    });
    this.render();
  }

  pulse() {
    const session = this.session;
    if (!session?.ready) return;
    const now = Date.now();
    if (session.role === 'guest') {
      if (now - session.seen > 12000) this.fail(session, 'Стол не отвечает. Попробуйте подключиться снова.');
      return;
    }
    if (now - this.heartbeatAt >= 2000) {
      this.heartbeatAt = now;
      for (const seat of session.seats) if (seat?.online && seat.connection) {
        if (now - seat.seen > 10000) {
          this.drop(session, seat.connection, false);
          seat.connection.close();
        } else this.send(seat.connection, {type: 'ping'});
      }
      if (this.prune(session, now)) this.publish();
    }
    if (!this.active(session)) return;
    const seat = session.seats[session.hand.turn];
    const disconnected = !seat.online && now - seat.offlineAt >= 12000;
    if (Holdem.tick(session.hand, now, disconnected)) this.afterAction(session);
  }

  leave() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    clearTimeout(session.openTimer);
    if (session.role === 'host') {
      session.seats.forEach(seat => this.send(seat?.connection, {type: 'closed'}));
    } else {
      this.send(session.connection, {type: 'leave'});
    }
    setTimeout(() => session.peer?.destroy(), 100);
  }
}
