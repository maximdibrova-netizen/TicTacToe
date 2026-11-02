// Общие часы. Состояние партии предоставляет маленький адаптер каждой игры.
var GameClock = (function () {
  function attach(a) {
    var model = null, game = null, lastMove = 0, ended = false, received = 0, lastSend = 0;
    var root = document.createElement('div'); root.className = 'gc-settings';
    root.innerHTML = '<label><input type="checkbox" id="gc-enabled"> Играть на время</label><div class="gc-options" hidden><p>Для каждого игрока: минуты + секунды после каждого хода.</p>' + a.labels.map(function(n,i) {
      return '<div class="gc-row"><span>'+n+'</span><label><input type="number" min="0.1" max="180" step="0.1" value="5" id="gc-min-'+i+'" aria-label="'+n+': минуты"> мин</label><b>+</b><label><input type="number" min="0" max="120" step="1" value="3" id="gc-inc-'+i+'" aria-label="'+n+': прибавка"> сек</label></div>';
    }).join('') + '<div class="gc-presets"><button type="button" data-time="1,0">1+0 всем</button><button type="button" data-time="3,2">3+2 всем</button><button type="button" data-time="5,3">5+3 всем</button><button type="button" data-time="10,5">10+5 всем</button></div><p>Онлайн: настройки хозяина для всех. Время идёт при разрыве связи и просмотре истории. Отмена хода не возвращает время. По просрочке партия заканчивается.</p></div>';
    var menu = document.querySelector('#menu .col, #menu .menu-col') || document.querySelector('#menu');
    var play=menu.querySelector('#playBtn'); if(play){var anchor=play;while(anchor.parentElement!==menu)anchor=anchor.parentElement;menu.insertBefore(root,anchor);}else menu.appendChild(root);
    var enabled = root.querySelector('#gc-enabled'), options = root.querySelector('.gc-options');
    function config() { return {enabled: enabled.checked, left:a.labels.map(function(_,i){return Math.max(6000,Math.min(10800000,(+document.getElementById('gc-min-'+i).value||5)*60000));}), inc:a.labels.map(function(_,i){return Math.max(0,Math.min(120000,(+document.getElementById('gc-inc-'+i).value||0)*1000));})}; }
    function save() { options.hidden=!enabled.checked; try {localStorage.setItem('clock-'+a.id,JSON.stringify(config()));}catch(e){} }
    try { var saved=JSON.parse(localStorage.getItem('clock-'+a.id)); if(saved){enabled.checked=!!saved.enabled;a.labels.forEach(function(_,i){document.getElementById('gc-min-'+i).value=(saved.left[i]||300000)/60000;document.getElementById('gc-inc-'+i).value=(saved.inc[i]||0)/1000;});} } catch(e){}
    options.hidden=!enabled.checked; root.addEventListener('change',save);
    root.querySelectorAll('[data-time]').forEach(function(b){b.onclick=function(){var v=b.dataset.time.split(',');a.labels.forEach(function(_,i){document.getElementById('gc-min-'+i).value=v[0];document.getElementById('gc-inc-'+i).value=v[1];});save();};});
    var bar=document.createElement('div');bar.className='gc-bar';bar.hidden=true; document.getElementById('game').prepend(bar);
    var result=document.createElement('div');result.className='gc-result';result.hidden=true;result.setAttribute('role','dialog');result.setAttribute('aria-label','Партия завершена по времени');
    result.innerHTML='<div><h2>Время вышло</h2><p></p><button type="button">В меню</button></div>';document.body.appendChild(result);
    result.querySelector('button').onclick=function(){result.hidden=true;a.menu();sync();};
    function guest(){return a.role()==='guest';}
    function expire() {
      if(!model || model.flag===null || ended)return;
      ended=true;a.expire(model.flag);result.querySelector('p').textContent=a.labels[model.flag]+' — поражение по времени. Партия окончена.';result.hidden=false;
    }
    function packet(){return model?{left:model.left.slice(),inc:model.inc.slice(),turn:model.turn,running:model.running,flag:model.flag}:null;}
    function publish(){if(a.role()==='host'){a.send({t:'clock-v1',clock:packet()});lastSend=Date.now();}}
    function sync() {
      var s=a.state(),now=Date.now();
      if(!s){game=null;model=null;bar.hidden=true;result.hidden=true;return;}
      if(game!==s.game){game=s.game;lastMove=s.moves;ended=false;result.hidden=true;received=0;var c=config();model=!guest()&&c.enabled&&s.ready?new FischerClock(c.left,c.inc,s.turn,now):null;}
      if(!model&&!guest()&&s.ready&&!s.over){var c=config();if(c.enabled)model=new FischerClock(c.left,c.inc,s.turn,now);}
      if(model&&!guest()) {
        if(s.moves>lastMove)model.move(s.turn,now);else model.tick(now);
        // При отмене хода сохраняем потраченное время, не добавляем прибавку.
        if(s.moves<lastMove){model.turn=s.turn;if(model.flag===null)model.running=!s.over;}
        if(s.over)model.stop(now);
        lastMove=s.moves;expire();
        if(now-lastSend>500)publish();
      }
      draw();
    }
    function draw(){
      bar.hidden=!model;var timed=!!model;if(document.body.classList.contains('gc-timed')!==timed){document.body.classList.toggle('gc-timed',timed);setTimeout(function(){window.dispatchEvent(new Event('resize'));},0);}if(!model)return;
      var now=Date.now(),s=a.state();
      bar.innerHTML=a.labels.map(function(label,i){
        if(s&&s.active&&s.active.indexOf(i)<0)return '';
        var ms=model.left[i];if(guest()&&model.running&&i===model.turn)ms=Math.max(0,ms-(now-received));
        var sec=Math.ceil(ms/1000),text=Math.floor(sec/60)+':'+('0'+sec%60).slice(-2);
        return '<div class="gc-face '+(model.running&&i===model.turn?'gc-active ':'')+(ms<10000?'gc-low':'')+'"><span>'+label+' <small>+'+model.inc[i]/1000+'</small></span><strong>'+text+'</strong></div>';
      }).join('');
    }
    function receive(d){
      if(!d||d.t!=='clock-v1')return false;
      if(!guest())return true;
      sync();var c=d.clock;
      if(c&&Array.isArray(c.left)&&c.left.length===a.labels.length&&Array.isArray(c.inc)&&Number.isInteger(c.turn)&&c.turn>=0&&c.turn<a.labels.length&&c.left.every(function(x){return Number.isFinite(x)&&x>=0;})) {
        model=new FischerClock(c.left,c.inc,c.turn,Date.now());model.running=!!c.running;model.flag=c.flag;received=Date.now();expire();
      }else model=null;
      draw();return true;
    }
    function before(){sync();return !(model&&model.flag!==null);}
    setInterval(sync,100);
    return {sync:sync,before:before,receive:receive,publish:publish,enabled:function(){return !!model;}};
  }
  return {attach:attach};
})();
