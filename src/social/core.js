export const ONLINE_MS = 135_000;
export const CHALLENGE_MS = 600_000;
export const MESSAGE_LIMIT = 1_500;
export const PAGE_SIZE = 50;

export function playerId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function members(a, b) {
  if (!playerId(a) || !playerId(b) || a === b) throw new Error('Нужны два разных игрока.');
  return a < b ? [a, b] : [b, a];
}

export function pairId(a, b) {
  return members(a, b).join('~');
}

export function searchName(name) {
  return name.trim().normalize('NFKC').toLowerCase().replace(/ё/g, 'е').slice(0, 96);
}

export function timeOf(stamp) {
  return stamp?.toMillis() ?? 0;
}

export function challengeActive(challenge, now = Date.now()) {
  return ['pending', 'accepted', 'ready'].includes(challenge.status)
    && now < timeOf(challenge.createdAt) + CHALLENGE_MS;
}
