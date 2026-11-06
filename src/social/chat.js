import {$, element, status, errorText, presenceLabel} from './dom.js';
import {PAGE_SIZE, timeOf} from './core.js';

const date = new Intl.DateTimeFormat('ru', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

export class SocialChat {
  constructor(name, online) {
    this.name = name;
    this.online = online;
    this.state = null;
    this.field = $('socialMessage');
    this.panel = $('socialMessages');
    this.list = $('socialMessageList');
    this.sendButton = $('socialMessageForm').querySelector('button');
    $('socialOlder').onclick = () => this.loadOlder();
    $('socialMessageForm').onsubmit = event => {
      event.preventDefault();
      this.send();
    };
  }

  open(store, link, uid) {
    if (this.state?.link === link && this.state.ready) {
      this.focus();
      return;
    }
    this.close();
    const state = {store, link, uid, rows: new Map(), cursor: null, loaded: false, ready: true};
    this.state = state;
    $('socialChatEmpty').hidden = true;
    $('socialChatOpen').hidden = false;
    $('socialChat').setAttribute('aria-labelledby', 'socialChatName');
    $('socialPane').dataset.chat = 'true';
    this.heading();
    status($('socialChatInfo'), 'Загружаем сообщения…');
    state.unsubscribe = store.watchMessages(link, snapshot => {
      if (this.state !== state) return;
      const pin = !state.loaded || this.panel.scrollHeight - this.panel.scrollTop - this.panel.clientHeight < 56
        || snapshot.docChanges().some(change => change.doc.metadata.hasPendingWrites);
      for (const [id, item] of state.rows) {
        if (item.metadata.hasPendingWrites) state.rows.delete(id);
      }
      for (const item of snapshot.docs) state.rows.set(item.id, item);
      if (!state.cursor && snapshot.size === PAGE_SIZE && !snapshot.docs[PAGE_SIZE - 1].metadata.hasPendingWrites) {
        state.cursor = snapshot.docs[PAGE_SIZE - 1];
        $('socialOlder').hidden = false;
      }
      state.loaded = true;
      this.render();
      if (pin) this.panel.scrollTop = this.panel.scrollHeight;
    }, () => {
      if (this.state !== state) return;
      state.ready = false;
      this.sendButton.disabled = true;
      $('socialOlder').hidden = true;
      this.list.replaceChildren();
      status($('socialChatInfo'), 'Переписка недоступна. Откройте её ещё раз.');
    });
    this.focus();
  }

  focus() {
    if (matchMedia('(max-width: 720px)').matches) $('socialChatBack').focus();
    else this.field.focus();
  }

  heading() {
    if (!this.state) return;
    $('socialChatName').textContent = this.name(this.state.uid);
    $('socialChatStatus').replaceChildren(presenceLabel(this.online(this.state.uid)));
  }

  close() {
    this.state?.unsubscribe?.();
    this.state = null;
    $('socialChat').setAttribute('aria-labelledby', 'socialChatTitle');
    $('socialChatEmpty').hidden = false;
    $('socialChatOpen').hidden = true;
    $('socialPane').dataset.chat = 'false';
    this.field.value = '';
    this.list.replaceChildren();
    this.sendButton.disabled = false;
    $('socialOlder').hidden = true;
    $('socialOlder').disabled = false;
    status($('socialMessageError'), '');
  }

  render() {
    const {store, rows} = this.state;
    const nodes = [...rows.values()].map(row => ({
      id: row.id, pending: row.metadata.hasPendingWrites, ...row.data({serverTimestamps: 'estimate'})
    }))
      .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id))
      .map(message => {
        const mine = message.sender === store.uid;
        const node = element('article', '', 'social-message' + (mine ? ' mine' : ''));
        node.setAttribute('aria-label', mine ? 'Вы' : this.name(message.sender));
        const text = element('p', message.text);
        const stamp = timeOf(message.createdAt);
        const time = element('time', stamp && !message.pending ? date.format(stamp) : 'Отправляется…');
        if (stamp) time.dateTime = new Date(stamp).toISOString();
        node.append(text, time);
        return node;
      });
    this.list.replaceChildren(...nodes);
    status($('socialChatInfo'), nodes.length ? '' : 'Здесь появятся ваши сообщения.');
  }

  async loadOlder() {
    const state = this.state, button = $('socialOlder');
    if (!state?.cursor || button.disabled) return;
    button.disabled = true;
    status($('socialMessageError'), '');
    try {
      const snapshot = await state.store.olderMessages(state.link, state.cursor);
      if (this.state !== state) return;
      const fromBottom = this.panel.scrollHeight - this.panel.scrollTop;
      for (const item of snapshot.docs) state.rows.set(item.id, item);
      state.cursor = snapshot.docs[snapshot.size - 1] || state.cursor;
      button.hidden = snapshot.size < PAGE_SIZE;
      this.render();
      this.panel.scrollTop = this.panel.scrollHeight - fromBottom;
    } catch (error) {
      if (this.state === state) status($('socialMessageError'), errorText(error));
    } finally {
      if (this.state === state) button.disabled = false;
    }
  }

  async send() {
    const state = this.state, value = this.field.value;
    if (!state?.ready || this.sendButton.disabled) return;
    if (!value.trim()) {
      status($('socialMessageError'), 'Введите текст сообщения.');
      return;
    }
    status($('socialMessageError'), '');
    this.sendButton.disabled = true;
    try {
      if (!navigator.onLine) throw new Error('Нет связи. Сообщение можно отправить после подключения.');
      await state.store.sendMessage(state.link, value);
      if (this.state === state && this.field.value === value) this.field.value = '';
    } catch (error) {
      if (this.state === state) status($('socialMessageError'), errorText(error));
    } finally {
      if (this.state === state && state.ready) this.sendButton.disabled = false;
    }
  }
}
