// Vector artwork: bevelled stone, glowing lava and saturated faceted tokens.
// Shared symbols keep the board light and remain sharp on phones and tablets.
var LavaArt = (function () {
  'use strict';
  var colors = [
    {name:'Фиолетовый',light:'#f54aff',face:'#d500f0',dark:'#790088'},
    {name:'Зелёный',light:'#6aff43',face:'#18df1a',dark:'#086c12'},
    {name:'Синий',light:'#7771ff',face:'#2b2afa',dark:'#10118b'},
    {name:'Красный',light:'#ff6b52',face:'#f11c27',dark:'#8c0715'}
  ];
  var oct='14,3 86,3 97,14 97,86 86,97 14,97 3,86 3,14';
  var lavaPaths=[
    'M-8 18C13 12 28 26 30 42S11 71 22 104M30 42C48 34 58 49 67 45S79 13 106 22M67 45C61 67 87 75 106 69',
    'M-8 75C16 77 19 54 38 56S60 83 66 108M38 56C43 37 21 30 29-9M38 56C64 56 58 27 80 28S104 42 109 17'
  ];
  function definitions() {
    var s='<svg class="art-defs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>'+
      '<linearGradient id="stone-rim" x2=".8" y2="1"><stop stop-color="#eee1c9"/><stop offset=".22" stop-color="#b69f84"/><stop offset=".6" stop-color="#6b5745"/><stop offset="1" stop-color="#cbb69c"/></linearGradient>'+
      '<linearGradient id="stone-face" x2=".85" y2="1"><stop stop-color="#d2bc9d"/><stop offset=".45" stop-color="#ac987d"/><stop offset="1" stop-color="#c6ae8b"/></linearGradient>'+
      '<linearGradient id="strong-face" x2=".8" y2="1"><stop stop-color="#fffcf2"/><stop offset=".6" stop-color="#f5eddf"/><stop offset="1" stop-color="#e1d0b8"/></linearGradient>'+
      '<linearGradient id="tile-glass" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".2"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>'+
      '<radialGradient id="lava-glow"><stop stop-color="#ffcb4a"/><stop offset=".3" stop-color="#ff7619"/><stop offset="1" stop-color="#ec3a07" stop-opacity="0"/></radialGradient>'+
      '<pattern id="lava-micro-grid" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="#100f11"/><path d="M8 2H36L42 8V36L36 42H8L2 36V8Z" fill="#191719" stroke="#282426" stroke-width="2"/><path d="M8 5H36L39 8" fill="none" stroke="#322b29" stroke-opacity=".55"/></pattern>'+
      '<clipPath id="tile-clip"><polygon points="'+oct+'"/></clipPath>';
    [0,1].forEach(function(variant){
      s+='<symbol id="lava-floor-'+variant+'" viewBox="0 0 100 100"><polygon points="'+oct+'" fill="#160e0c" stroke="#704024" stroke-width="2"/>'+
        '<g clip-path="url(#tile-clip)"><path d="'+lavaPaths[variant]+'" fill="none" stroke="#982708" stroke-width="17"/>'+
        '<path d="'+lavaPaths[variant]+'" fill="none" stroke="#ff6710" stroke-width="8"/>'+
        '<path d="'+lavaPaths[variant]+'" fill="none" stroke="#ffbd38" stroke-width="2.4"/>'+
        '<circle cx="'+(variant?38:30)+'" cy="'+(variant?56:42)+'" r="29" fill="url(#lava-glow)"/>'+
        '<path d="M11 12L27 9 35 21 23 32 9 27ZM67 69L88 65 94 84 75 92 64 84Z" fill="#2c1710" opacity=".6"/></g></symbol>';
      s+='<symbol id="lava-stone-'+variant+'" viewBox="0 0 100 100"><polygon points="'+oct+'" fill="url(#stone-rim)" stroke="#8b7560" stroke-width="1.5"/>'+
        '<path d="M17 8H83L92 17V83L83 92H17L8 83V17Z" fill="#665348"/>'+
        '<path d="M19 12H81L88 19V81L81 88H19L12 81V19Z" fill="url(#stone-face)"/>'+
        '<g clip-path="url(#tile-clip)" opacity=".6"><path d="'+lavaPaths[variant]+'" fill="none" stroke="#e68b3d" stroke-width="9"/><path d="'+lavaPaths[variant]+'" fill="none" stroke="#ffc472" stroke-width="3"/></g>'+
        '<path d="M19 12H81L88 19V81L81 88H19L12 81V19Z" fill="url(#tile-glass)" stroke="#f4d9b8" stroke-opacity=".75" stroke-width="1.4"/>'+
        '<path d="M17 7H83L93 17M7 17V83" fill="none" stroke="#fff0d6" stroke-opacity=".65" stroke-width="1.5"/></symbol>';
    });
    s+='<symbol id="lava-strong" viewBox="0 0 100 100"><polygon points="'+oct+'" fill="url(#stone-rim)" stroke="#d4c1a6" stroke-width="1.5"/>'+
      '<path d="M17 7H83L93 17V83L83 93H17L7 83V17Z" fill="#a48e76"/>'+
      '<path d="M20 11H80L89 20V80L80 89H20L11 80V20Z" fill="#e6d6be" stroke="#fff8ed" stroke-width="2"/>'+
      '<path d="M23 16H77L84 23V77L77 84H23L16 77V23Z" fill="url(#strong-face)" stroke="#fffcf4" stroke-width="1.5"/>'+
      '<path d="M18 7H82L92 17M8 18V82" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2"/></symbol>';
    colors.forEach(function(c,i){
      s+='<linearGradient id="gem-face-'+i+'" x2=".8" y2="1"><stop stop-color="'+c.light+'"/><stop offset=".35" stop-color="'+c.face+'"/><stop offset="1" stop-color="'+c.dark+'"/></linearGradient>'+
        '<symbol id="lava-gem-'+i+'" viewBox="0 0 100 100">'+
        '<path d="M28 11H72L89 28V72L72 89H28L11 72V28Z" fill="'+c.dark+'"/>'+
        '<path d="M28 8H72L92 28V72L72 92H28L8 72V28Z" fill="url(#gem-face-'+i+')" stroke="'+c.face+'" stroke-width="2"/>'+
        '<path d="M28 8 33 21H67L72 8ZM8 28 21 33V67L8 72Z" fill="'+c.light+'" opacity=".65"/>'+
        '<path d="M92 28 79 33V67L92 72ZM28 92 33 79H67L72 92Z" fill="'+c.dark+'" opacity=".7"/>'+
        '<path d="M33 21H67L79 33V67L67 79H33L21 67V33Z" fill="'+c.face+'" fill-opacity=".65" stroke="'+c.light+'" stroke-opacity=".7" stroke-width="2"/>'+
        '<path d="M30 20V80M70 20V80M20 30H80M20 70H80" fill="none" stroke="'+c.light+'" stroke-width="3.2" stroke-opacity=".56"/>'+
        '<path d="M29 10H71L90 29M10 29V71" stroke="#fff" stroke-opacity=".3" stroke-width="1.5" fill="none"/></symbol>';
    });
    return s+'</defs></svg>';
  }
  function tile(hp, index) {
    var name=hp===2?'strong':(hp===1?'stone-':'floor-')+(index%2);
    return '<svg class="tile-art" viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate('+(index%4*90)+' 50 50)"><use href="#lava-'+name+'"/></g></svg>';
  }
  function gem(corner, directions) {
    var s='<svg class="gem" viewBox="0 0 100 100" aria-hidden="true"><use href="#lava-gem-'+corner+'"/>';
    if(directions)for(var d=0;d<4;d++)s+='<path class="gem-arrow dir-'+d+'" transform="rotate('+(d*90)+' 50 50)" d="M50-4 57 4H43Z" fill="'+colors[corner].face+'"/>';
    return s+'<g class="turn-ring"><path d="M8 31A46 46 0 0 1 66 7M92 69A46 46 0 0 1 34 93" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/></g></svg>';
  }
  var paths={
    human:'<circle cx="12" cy="6" r="4"/><path d="M4 23v-4a8 8 0 0 1 16 0v4Z"/>',
    bot:'<rect x="4" y="6" width="16" height="13" rx="4"/><path d="M10 1h4v5h-4ZM1 10h2v6H1Zm20 0h2v6h-2ZM8 21h8v2H8Z"/><path d="M8 10v3m8-3v3m-7 3h6" stroke="var(--panel)" stroke-width="2" fill="none"/>',
    net:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3ZM15 4a3 3 0 0 1 0 6 3 3 0 0 0 0-6Zm2 8a6 6 0 0 1 5 6v2h-5Z"/>',
    off:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m5 19 14-14" stroke="currentColor" stroke-width="2.5"/>',
    play:'<path d="M7 3v18l15-9Z"/>',
    home:'<path d="m3 10 9-8 9 8v12h-7v-8h-4v8H3Z"/>',
    restart:'<path d="M5 7a8 8 0 1 1-1 9M5 2v6h6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    sound:'<path d="M2 9h4l6-6v18l-6-6H2Z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2"/>',
    mute:'<path d="M2 9h4l6-6v18l-6-6H2Z"/><path d="m16 8 6 8m0-8-6 8" stroke="currentColor" stroke-width="2"/>',
    jump:'<path d="M5 19h14M12 16V3m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">'+(paths[name]||paths.off)+'</svg>';}
  return {colors:colors,definitions:definitions,tile:tile,gem:gem,icon:icon};
})();
