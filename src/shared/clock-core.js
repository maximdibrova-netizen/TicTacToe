// Часы Фишера. Перед сменой хода сначала проверяется просрочка.
function FischerClock(left, inc, turn, now) {
  this.left = left.slice(); this.inc = inc.slice(); this.turn = turn;
  this.at = now; this.running = true; this.flag = null;
}
FischerClock.prototype.tick = function(now) {
  if (this.running) {
    this.left[this.turn] = Math.max(0, this.left[this.turn] - Math.max(0, now - this.at));
    if (!this.left[this.turn]) { this.flag = this.turn; this.running = false; }
  }
  this.at = now;
};
FischerClock.prototype.move = function(next, now) {
  this.tick(now); if (this.flag !== null || !this.running) return false;
  this.left[this.turn] += this.inc[this.turn]; this.turn = next; return true;
};
FischerClock.prototype.gift = function(seat, now) {
  this.tick(now);
  if (!this.running || this.flag !== null || !Number.isInteger(seat) || seat < 0 || seat >= this.left.length) return false;
  this.left[seat] += 15000;
  return true;
};
FischerClock.prototype.stop = function(now) { this.tick(now); this.running = false; };
if (typeof module !== 'undefined') module.exports = FischerClock;
