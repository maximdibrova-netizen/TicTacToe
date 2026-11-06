import {challengeActive} from './core.js';

export class FriendRooms {
  constructor(report, roomChanged) {
    this.report = report;
    this.store = null;
    this.invites = [];
    this.loaded = false;
    this.automatic = new Set();
    this.writes = new Set();
    this.opened = null;
    this.scheduled = false;
    addEventListener('room:changed', () => { roomChanged(); this.schedule(); });
    addEventListener('room:friend-opened', event => {
      this.opened = event.detail;
      this.schedule();
    });
    addEventListener('room:friend-closed', event => {
      const invite = this.invites.find(row => row.attempt === event.detail);
      this.automatic.delete(event.detail);
      if (invite && challengeActive(invite)) this.publish(invite, 'cancelled');
    });
    document.addEventListener('visibilitychange', () => this.schedule());
  }

  reset(store) {
    this.store = store;
    this.invites = [];
    this.loaded = false;
    this.automatic.clear();
    this.writes.clear();
    this.opened = null;
  }

  update(invites) {
    this.invites = invites;
    this.loaded = true;
    const active = new Set(invites.filter(invite => challengeActive(invite)).map(invite => invite.attempt));
    for (const attempt of this.automatic) if (!active.has(attempt)) this.automatic.delete(attempt);
    for (const key of this.writes) if (!active.has(key.split(':')[0])) this.writes.delete(key);
    this.schedule();
  }

  canOpen(invite, context = window.ROOM.context()) {
    return context.state === 'idle' || (context.state === 'error' && context.friendAttempt === invite.attempt);
  }

  open(invite) {
    if (!challengeActive(invite) || !window.ROOM.openFriend(invite)) {
      this.report('Комнату можно открыть, когда вы свободны и вызов ещё действует.');
      return;
    }
    this.automatic.delete(invite.attempt);
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.sync();
    });
  }

  sync() {
    const store = this.store;
    if (!store || !this.loaded || window.GameAccount.currentUser()?.uid !== store.uid) return;
    const context = window.ROOM.context();
    if (context.friendAttempt) {
      const invite = this.invites.find(row => row.attempt === context.friendAttempt);
      if (this.opened === context.friendAttempt && invite?.status === 'ready' && challengeActive(invite)) {
        this.publish(invite, 'opened');
      } else if (!context.game && (!invite || (invite.status !== 'opened' && !challengeActive(invite)))) {
        window.ROOM.closeFriend(context.friendAttempt);
      } else if (!context.game && context.role === 'guest' && invite?.status === 'ready' && context.code !== invite.roomCode) {
        window.ROOM.closeFriend(context.friendAttempt);
        this.open(invite);
      } else if (context.state === 'waiting' && context.role === 'host' && invite &&
                 (invite.status === 'accepted' || (invite.status === 'ready' && context.code !== invite.roomCode))) {
        this.publish(invite, 'ready', context.code);
      }
      return;
    }
    if (context.state !== 'idle') return;
    const next = this.invites.find(invite => this.automatic.has(invite.attempt) && challengeActive(invite)
      && (invite.status === 'ready' || (invite.from === store.uid && invite.status === 'accepted')));
    if (next) this.open(next);
  }

  publish(invite, status, code) {
    const store = this.store, key = [invite.attempt, status, code].join(':');
    if (this.writes.has(key)) return;
    this.writes.add(key);
    store.changeChallenge(invite, status, code).catch(() => {
      if (this.store !== store) return;
      this.writes.delete(key);
      if (!this.invites.some(row => row.attempt === invite.attempt && row.status === invite.status && challengeActive(row))) return;
      if (status === 'ready') window.ROOM.closeFriend(invite.attempt);
      this.report(status === 'ready' ? 'Комната не открылась. Попробуйте открыть её ещё раз.' : 'Не удалось обновить вызов.');
    });
  }
}
