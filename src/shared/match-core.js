// Consent is independent of game rules and engine strength.
var MatchVote = (function () {
  function create(players, proposer, version, id) {
    var pending = players.filter(function (p) { return p.id !== proposer && p.kind !== 'bot'; }).map(function (p) { return p.id; });
    return { id: id, proposer: proposer, version: version, pending: pending, status: pending.length ? 'pending' : 'accepted' };
  }
  function vote(v, seat, ok, version) {
    if (!v || v.status !== 'pending' || v.version !== version || v.pending.indexOf(seat) < 0) return v;
    var n = Object.assign({}, v, { pending: v.pending.filter(function (p) { return p !== seat; }) });
    n.status = !ok ? 'declined' : n.pending.length ? 'pending' : 'accepted';
    return n;
  }
  return { create: create, vote: vote };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MatchVote;
