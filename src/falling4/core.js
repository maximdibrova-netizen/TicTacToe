var FallingFour=(function(){
 var cells=Array.from({length:42},function(_,i){return{q:i%7,r:i/7|0,name:'ABCDEFG'[i%7]+(6-(i/7|0))};});
 function create(){return{b:new Int8Array(42),turn:1,winner:0,win:[],plies:0,path:[],lost:[0,0,0],setup:0};}
 function clone(s){return{b:Int8Array.from(s.b),turn:s.turn,winner:s.winner||0,win:(s.win||[]).slice(),plies:s.plies||0,path:(s.path||[]).slice(),lost:[0,0,0],setup:0};}
 function legal(s,input){if(input==null||typeof input==='boolean'||typeof input==='string'&&!/^[0-6]$/.test(input))return null;var col=typeof input==='object'&&input?input.col:Number(input);if(s.winner||!Number.isInteger(col)||col<0||col>6||s.b[col])return null;var row=5;while(s.b[row*7+col])row--;return{col:col,row:row,key:String(col)};}
 function play(s,input){var m=legal(s,input);if(!m)return null;var n=clone(s),i=m.row*7+m.col;n.b[i]=s.turn;n.turn=3-s.turn;n.plies++;n.last=m.key;n.lastCell=i;n.path.push(m.key);
  [[1,0],[0,1],[1,1],[1,-1]].some(function(d){var line=[i];[-1,1].forEach(function(sign){for(var k=1;k<4;k++){var r=m.row+d[1]*k*sign,c=m.col+d[0]*k*sign;if(r<0||r>5||c<0||c>6||n.b[r*7+c]!==s.turn)break;line.push(r*7+c);}});if(line.length>=4){n.winner=s.turn;n.win=line;return true;}return false;});if(!n.winner&&n.plies===42)n.winner=3;return n;}
 function moves(s){return[3,2,4,1,5,0,6].map(function(c){return legal(s,String(c));}).filter(Boolean);}
 function score(s,side){if(s.winner)return s.winner===3?0:s.winner===side?100000:-100000;var v=0;cells.forEach(function(c,i){if(s.b[i])v+=(s.b[i]===side?1:-1)*(3-Math.abs(c.q-3))*3;});for(var r=0;r<6;r++)for(var c=0;c<7;c++)[[1,0],[0,1],[1,1],[1,-1]].forEach(function(d){var a=0,b=0;for(var k=0;k<4;k++){var y=r+d[1]*k,x=c+d[0]*k;if(y<0||y>5||x<0||x>6)return;var p=s.b[y*7+x];if(p===side)a++;else if(p)b++;}if(!b)v+=[0,1,9,75,10000][a];if(!a)v-=[0,1,9,90,10000][b];});return v;}
 var levels=[{name:'Лёгкий',ms:120,depth:3},{name:'Средний',ms:450,depth:6},{name:'Сильный',ms:1200,depth:11}];
 function think(s,level,ms){var l=levels[level]||levels[1],end=Date.now()+(ms||l.ms),nodes=0,abort={},best=moves(s)[0],v=score(s,s.turn),depth=0;if(!best)return{best:null,v:v,p:s.winner===3?.5:s.winner===s.turn?1:0,depth:0};
  function neg(p,d,a,b){if((++nodes&255)===0&&Date.now()>end)throw abort;if(!d||p.winner)return score(p,p.turn);var top=-Infinity,list=moves(p);for(var i=0;i<list.length;i++){var q=-neg(play(p,list[i]),d-1,-b,-a);top=Math.max(top,q);a=Math.max(a,q);if(a>=b)break;}return top;}
  for(var d=1;d<=l.depth;d++){try{var value=-Infinity,pick=best,list=moves(s);for(var i=0;i<list.length;i++){var q=-neg(play(s,list[i]),d-1,-Infinity,-value);if(q>value){value=q;pick=list[i];}}best=pick;v=value;depth=d;if(Math.abs(v)>90000)break;}catch(e){if(e!==abort)throw e;break;}}return{best:best.key,v:v,p:v>90000?1:v< -90000?0:1/(1+Math.exp(-v/100)),depth:depth,nodes:nodes};}
 return{cells:cells,create:create,clone:clone,legal:legal,play:play,moves:moves,think:think,levels:levels,setups:[{name:'Классическое поле 7 × 6'}],notation:function(m){return'ABCDEFG'[Number(m)];}};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FallingFour;
