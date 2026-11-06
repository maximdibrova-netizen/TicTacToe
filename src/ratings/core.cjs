// Glicko-1, one completed match per rating period. Mark Glickman's algorithm is
// public domain: https://www.glicko.net/glicko/glicko.pdf . All stored values are
// integer centipoints; no browser is trusted to choose its own rating delta.
const POOLS=Object.freeze(['chess','checkers','go','ttt','tochki','battleship','lava','abalone','falling4','quoridor','durak','multi3','multi4']);
const Q=Math.log(10)/400,MIN_R=10000,MAX_R=500000,MIN_RD=3000,MAX_RD=35000;
function initial(){return{v:1,r:120000,rd:35000,games:0,wins:0,draws:0,losses:0,lastMatch:''};}
function validPool(pool){return POOLS.includes(pool);}
function provisional(p){return !p||p.games<10;}
function sameRanks(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
function validId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);}
function ratingValid(p){return p&&p.v===1&&Number.isInteger(p.r)&&p.r>=MIN_R&&p.r<=MAX_R&&Number.isInteger(p.rd)&&p.rd>=MIN_RD&&p.rd<=MAX_RD&&['games','wins','draws','losses'].every(k=>Number.isInteger(p[k])&&p[k]>=0&&p[k]<=100000000)&&p.games===p.wins+p.draws+p.losses&&typeof p.lastMatch==='string'&&p.lastMatch.length<=128;}
function validRanks(ranks,n){return Array.isArray(ranks)&&ranks.length===n&&ranks.every(x=>Number.isInteger(x)&&x>=0&&x<n)&&ranks.includes(0);}
function g(rd){return 1/Math.sqrt(1+3*Q*Q*rd*rd/(Math.PI*Math.PI));}
function expected(me,opponent){return 1/(1+Math.pow(10,-g(opponent.rd/100)*(me.r-opponent.r)/40000));}
function update(old,opponents,matchId,outcome){
  if(!ratingValid(old)||!validId(matchId)||old.lastMatch===matchId||!['win','draw','loss'].includes(outcome)||!Array.isArray(opponents)||opponents.length<1||opponents.length>3)throw Error('Invalid rating settlement');
  let weight=0,signal=0;
  for(const opponent of opponents){
    if(!ratingValid(opponent.rating)||![0,.5,1].includes(opponent.score))throw Error('Invalid opponent or score');
    const gg=g(opponent.rating.rd/100),e=expected(old,opponent.rating);
    weight+=gg*gg*e*(1-e);signal+=gg*(opponent.score-e);
  }
  const precision=1/Math.pow(old.rd/100,2)+Q*Q*weight;
  return{v:1,r:Math.round(Math.max(MIN_R,Math.min(MAX_R,old.r+100*Q/precision*signal))),rd:Math.round(Math.max(MIN_RD,Math.min(MAX_RD,100*Math.sqrt(1/precision)))),games:old.games+1,wins:old.wins+(outcome==='win'?1:0),draws:old.draws+(outcome==='draw'?1:0),losses:old.losses+(outcome==='loss'?1:0),lastMatch:matchId};
}
function settle(players,ratings,ranks,matchId){
  if(!Array.isArray(players)||players.length<2||players.length>4||players.some(x=>!validId(x))||new Set(players).size!==players.length||!Array.isArray(ratings)||ratings.length!==players.length||!validRanks(ranks,players.length))throw Error('Invalid match participants or places');
  const draw=ranks.every(x=>x===0);
  return ratings.map((me,i)=>update(me,ratings.flatMap((rating,j)=>i===j?[]:[{rating,score:ranks[i]<ranks[j]?1:ranks[i]===ranks[j]?.5:0}]),matchId,draw?'draw':ranks[i]===0?'win':'loss'));
}
function changes(before,after){if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)throw Error('Invalid rating history');return before.map((p,i)=>({beforeR:p.r,afterR:after[i].r,beforeRd:p.rd,afterRd:after[i].rd}));}
module.exports={POOLS,initial,validPool,provisional,sameRanks,ratingValid,validRanks,expected,update,settle,changes};
