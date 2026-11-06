export const $ = id => document.getElementById(id);

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function status(node, text) {
  node.textContent = text;
  node.hidden = !text;
}

export function errorText(error) {
  if (!navigator.onLine || error.code === 'unavailable') return 'Нет связи. Попробуйте ещё раз после подключения.';
  if (error.code === 'permission-denied') return 'Действие недоступно. Обновите список и попробуйте ещё раз.';
  return error.code ? 'Не получилось выполнить действие. Попробуйте ещё раз.' : error.message;
}

export function presenceLabel(online) {
  return element('span', online ? 'В сети' : 'Не в сети', 'social-presence' + (online ? ' online' : ''));
}
