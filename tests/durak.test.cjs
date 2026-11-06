const test=require('node:test'), assert=require('node:assert/strict');
const D=require('../src/durak/core.js');
const cards=Array.from({length:36},(_,i)=>i);
const card=(s,c)=>D.play(s,s.actor,{type:'card',card:c});
const action=(s,type)=>D.play(s,s.actor,{type});
const fixture=(hands,deck=[])=>{
  const used=new Set([...hands.flat(),...deck]);
  return {...D.create(hands.length,cards),hands,deck,discard:cards.filter(c=>!used.has(c)),attacker:0,defender:1,actor:0,
    trump:0,trumpCard:deck[0]??0,limit:Math.min(6,hands[1].length)};
};

test('36 unique cards, six per player, bottom trump and lowest trump starts',()=>{
  const ordered=cards.slice();
  [ordered[34],ordered[1]]=[ordered[1],ordered[34]];
  const s=D.create(4,ordered);
  assert.deepEqual(s.hands.map(h=>h.length),[6,6,6,6]);
  assert.equal(s.deck.length,12);
  assert.equal(s.trumpCard,ordered[0]);
  assert.equal(s.attacker,1);
  assert.equal(s.defender,2);
  assert.throws(()=>D.create(2,Array(36).fill(0)));
});

test('defense obeys suit, rank and trump; wrong seat and absent cards are rejected',()=>{
  assert.ok(D.beats(10,9,0));
  assert.ok(D.beats(0,17,0));
  assert.ok(!D.beats(9,0,0));
  assert.ok(!D.beats(18,9,0));
  let s=fixture([[9,17],[10,0,18]]);
  assert.equal(D.play(s,1,{type:'card',card:10}),null);
  s=card(s,9);
  assert.deepEqual(D.legal(D.view(s,1)).cards,[10,0]);
  assert.equal(card(s,18),null);
  assert.equal(card(s,35),null);
});

test('successful defense refills attacker before defender; defender leads next',()=>{
  let s=D.create(2,cards);
  s=card(s,27);
  const next=card(s,28);
  assert.equal(next.round,2);
  assert.equal(next.attacker,1);
  assert.ok(next.hands[0].includes(23));
  assert.ok(next.hands[1].includes(22));
  assert.deepEqual(next.resolved.draws,[0,1]);
  const guest = D.view(next,1);
  assert.deepEqual(guest.resolved.draws,[0,1]);
  assert.ok(D.validView(guest,1));
  assert.ok(D.validView({...guest,resolved:{...guest.resolved,draws:undefined}},1));
  assert.ok(!D.validView({...guest,resolved:{...guest.resolved,draws:[23,22]}},1));
  guest.resolved.draws.pop();
  assert.deepEqual(next.resolved.draws,[0,1]);
  assert.deepEqual(next.discard,[27,28]);
  assert.equal(s.discard.length,0);
});

test('taking allows matching throws, skips defender for the next attack and respects the limit',()=>{
  let s=fixture([[9,18,12],[10,20],[27,29]]);
  s=card(s,9);
  s=action(s,'take');
  assert.equal(s.phase,'throw');
  assert.equal(s.actor,0);
  assert.deepEqual(D.legal(D.view(s,0)).cards,[18]);
  assert.equal(card(s,12),null);
  s=card(s,18);
  assert.equal(s.round,2);
  assert.equal(s.attacker,2);
  assert.deepEqual(s.hands[1],[10,20,9,18]);
  assert.equal(s.resolved.table.length,2);
  assert.equal(s.resolved.taking,true);
});

test('throwing can use the cover rank and passes allow another player to throw',()=>{
  let s=fixture([[9,19,13],[10,22,23],[28,31]]);
  s=card(card(s,9),10);
  assert.deepEqual(D.legal(D.view(s,0)).cards,[19]);
  s=action(s,'pass');
  assert.equal(s.actor,2);
  assert.deepEqual(D.legal(D.view(s,2)).cards,[28]);
  assert.equal(card(s,28).actor,1);
});

test('last player with cards loses; both empty after a defense is a draw',()=>{
  const lose=card(card(fixture([[0],[1,2]]),0),1);
  assert.deepEqual(lose.result,{loser:1,reason:'cards'});
  const draw=card(card(fixture([[0],[1]]),0),1);
  assert.deepEqual(draw.result,{loser:null,reason:'draw'});
  assert.equal(card(draw,2),null);
});

test('guest snapshots expose only their hand, public cards and counts',()=>{
  const s=D.create(2,cards), v=D.view(s,1);
  assert.deepEqual(v.hand,s.hands[1]);
  assert.deepEqual(v.counts,[6,6]);
  for(const secret of ['hands','deck','discard','passed']) assert.ok(!Object.hasOwn(v,secret));
  assert.ok(D.validView(v,1));
  assert.equal(D.validView({...v,hand:[99]},1),false);
  assert.equal(D.validView({...v,seat:0},1),false);
  assert.equal(D.validView({...v,table:[{attack:0,cover:99,by:0}]},1),false);
  v.hand.pop();
  assert.equal(s.hands[1].length,6);
});

test('complete bot games conserve every card and always reach a result',()=>{
  let seed=31;
  function deck() {
    const a=cards.slice();
    for(let i=a.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  for(const count of [2,3,4])for(let game=0;game<30;game++){
    let s=D.create(count,deck());
    for(let step=0;step<500&&!s.result;step++){
      const a=D.bot(D.view(s,s.actor));
      s=D.play(s,s.actor,a);
      assert.ok(s);
      assert.ok(s.table.length<=s.limit);
      const all=[...s.deck,...s.discard,...s.hands.flat(),...s.table.flatMap(p=>p.cover===null?[p.attack]:[p.attack,p.cover])];
      assert.equal(all.length,36);
      assert.equal(new Set(all).size,36);
      if(count===2)assert.ok(D.validView(D.view(s,1),1));
    }
    assert.ok(s.result);
  }
});
