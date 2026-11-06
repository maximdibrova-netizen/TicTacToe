const GAMES=[['chess','Шахматы'],['checkers','Русские шашки'],['go','Го'],['ttt','Крестики-нолики'],['tochki','Точки'],['battleship','Морской бой'],['lava','Лава'],['abalone','Абалон'],['falling4','Четыре в ряд'],['quoridor','Коридор'],['durak','Дурак'],['multi3','Три игры одновременно'],['multi4','Четыре игры одновременно']];
const MULTI=['tochki','ttt','go','checkers','battleship','quoridor','lava'];
function validBundle(a){return Array.isArray(a)&&[3,4].includes(a.length)&&new Set(a).size===a.length&&a.every(g=>MULTI.includes(g));}
function bundleScore(a){if(!Array.isArray(a)||![3,4].includes(a.length)||a.some(x=>![0,.5,1].includes(x)))return null;const first=a.reduce((x,y)=>x+y,0),second=a.length-first;return{scores:[first,second],ranks:first===second?[0,0]:first>second?[0,1]:[1,0]};}
function ranksFromResult(seats,r){if(r.draw)return seats.map(x=>(r.eliminated||[]).includes(x)?1:0);return seats.map(x=>(r.winners||[]).includes(x)?0:1);}
function eligibility(e){
 if(e.analysis)return{ok:false,reason:'Анализ не меняет рейтинг.'};
 if(e.mode==='bot')return{ok:false,reason:'У бота показана примерная сила. Ваш основной рейтинг не меняется.'};
 if(e.mode!=='online')return{ok:false,reason:'Основной рейтинг меняется в онлайне между разными аккаунтами.'};
 if(e.continued)return{ok:false,reason:'Партия с выбранной позиции играется без изменения рейтинга.'};
 if(e.evaluationEnabled)return{ok:false,reason:'Для рейтинга начните новую партию без оценки и подсказок.'};
 if(!Array.isArray(e.players)||e.players.length<2||e.players.length>4||e.players.some(p=>p.kind==='bot'))return{ok:false,reason:'Для рейтинга все участники должны играть людьми, без ботов.'};
 if(!e.mine||e.mine.length!==1)return{ok:false,reason:'Каждому участнику рейтинговой партии нужен отдельный аккаунт.'};
 return{ok:true};
}
function botEstimate(game,level=0,count=6){const ranges={chess:[400,2800],checkers:[500,2100],go:[300,1900],ttt:[500,1800],tochki:[400,1700],battleship:[400,1700],lava:[500,1300],abalone:[400,2200],falling4:[500,1900],quoridor:[400,1800],durak:[400,1500]},r=ranges[game]||[400,1600],i=Math.max(0,Math.min(count-1,Number(level)||0)),rating=Math.round((r[0]+(r[1]-r[0])*i/Math.max(1,count-1))/50)*50;return{rating,label:'≈'+rating,note:'Ориентировочная сила бота; не калибрована по рейтингу людей.'};}
function nickname(user){return String(user?.displayName||('Игрок '+(user?.uid||'').slice(0,5))).trim().slice(0,32)||'Игрок';}
module.exports={GAMES,MULTI,validBundle,bundleScore,ranksFromResult,eligibility,botEstimate,nickname};
