// Лава: рисунки — самоцветы, лава под плитками, рамка поля, иконки.
var LavaArt = (function () {
  'use strict';
  var colors = [
    { name: 'Фиолетовый', who: 'фиолетовый', base: '#c41bd6', light: '#f06bff', dark: '#6d0a7a', glow: 'rgba(222,60,240,.55)' },
    { name: 'Зелёный', who: 'зелёный', base: '#1fb52a', light: '#6bf277', dark: '#0b5e12', glow: 'rgba(60,220,80,.5)' },
    { name: 'Синий', who: 'синий', base: '#2335dd', light: '#7584ff', dark: '#0d1477', glow: 'rgba(70,90,255,.55)' },
    { name: 'Красный', who: 'красный', base: '#d81e27', light: '#ff6b70', dark: '#760a0f', glow: 'rgba(240,50,60,.55)' }
  ];
  // восьмиугольный самоцвет с площадкой и гранями, как в оригинале
  function gem(c, opts) {
    var k = colors[c], id = 'g' + c + (opts && opts.id || '');
    return '<svg viewBox="0 0 100 100" class="gem" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + k.light + '"/><stop offset="1" stop-color="' + k.base + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + k.base + '"/><stop offset="1" stop-color="' + k.dark + '"/></linearGradient></defs>' +
      '<polygon points="29,3 71,3 97,29 97,71 71,97 29,97 3,71 3,29" fill="' + k.dark + '"/>' +
      '<polygon points="31,7 69,7 69,31 31,31" fill="url(#' + id + 't)"/>' +
      '<polygon points="31,7 69,7 70,30 30,30" fill="url(#' + id + 't)"/>' +
      '<polygon points="93,31 93,69 70,70 70,30" fill="' + k.base + '"/>' +
      '<polygon points="69,93 31,93 30,70 70,70" fill="url(#' + id + 'm)"/>' +
      '<polygon points="7,69 7,31 30,30 30,70" fill="' + k.base + '" opacity=".92"/>' +
      '<polygon points="7,31 31,7 30,30" fill="' + k.light + '" opacity=".85"/>' +
      '<polygon points="69,7 93,31 70,30" fill="' + k.base + '"/>' +
      '<polygon points="93,69 69,93 70,70" fill="' + k.dark + '" opacity=".75"/>' +
      '<polygon points="31,93 7,69 30,70" fill="' + k.base + '" opacity=".85"/>' +
      '<rect x="30" y="30" width="40" height="40" fill="' + k.base + '"/>' +
      '<rect x="30" y="30" width="40" height="40" fill="url(#' + id + 'm)" opacity=".55"/>' +
      '<path d="M33 33h22l-3 4H37v15l-4 3z" fill="#fff" opacity=".28"/>' +
      '<polygon points="29,3 71,3 97,29 97,71 71,97 29,97 3,71 3,29" fill="none" stroke="' + k.light + '" stroke-opacity=".55" stroke-width="2"/>' +
      '<path d="M30 30h40v40H30z M31 7l-1 23 M69 7l1 23 M93 31l-23-1 M93 69l-23 1 M69 93l1-23 M31 93l-1-23 M7 69l23 1 M7 31l23-1" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.4"/>' +
      '</svg>';
  }
  // поле: лава под стеклянными плитками, горячая лава в дырах, тёмная рамка с оранжевыми заклёпками
  function board(seed) {
    var s = '', cell = 100, g = 7, i, j;
    s += '<svg viewBox="0 0 600 600" class="lava" aria-hidden="true"><defs>' +
      '<filter id="lvCool" x="0" y="0" width="600" height="600" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.021" numOctaves="3" seed="' + seed + '" result="t"/>' +
      '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="r"/>' +
      '<feComponentTransfer in="r" result="rock"><feFuncA type="table" tableValues="1 1 1 1 .9 0 .9 1 1 1 1"/></feComponentTransfer>' +
      '<feGaussianBlur in="rock" stdDeviation="1.1" result="rs"/>' +
      '<feFlood flood-color="#544944"/><feComposite in2="rs" operator="in" result="rocks"/>' +
      '<feFlood flood-color="#d8742c" result="vein"/>' +
      '<feMerge><feMergeNode in="vein"/><feMergeNode in="rocks"/></feMerge></filter>' +
      '<filter id="lvHot" x="0" y="0" width="600" height="600" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.021" numOctaves="3" seed="' + seed + '" result="t"/>' +
      '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="r"/>' +
      '<feComponentTransfer in="r" result="vein"><feFuncA type="table" tableValues="0 0 0 0 .15 1 .15 0 0 0 0"/></feComponentTransfer>' +
      '<feGaussianBlur in="vein" stdDeviation="4" result="glow"/>' +
      '<feFlood flood-color="#120806"/><feComposite in2="SourceGraphic" operator="in" result="base"/>' +
      '<feFlood flood-color="#ff4a00" flood-opacity=".85"/><feComposite in2="glow" operator="in" result="gl"/>' +
      '<feFlood flood-color="#ffa13a"/><feComposite in2="vein" operator="in" result="vn"/>' +
      '<feMerge><feMergeNode in="base"/><feMergeNode in="gl"/><feMergeNode in="vn"/></feMerge></filter>' +
      '<clipPath id="lvHoles"></clipPath>' +
      '<radialGradient id="lvStud"><stop offset="0" stop-color="#ffd27a"/><stop offset=".55" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>' +
      '</defs>';
    s += '<rect width="600" height="600" filter="url(#lvCool)"/>';
    s += '<g clip-path="url(#lvHoles)"><rect width="600" height="600" fill="#000" filter="url(#lvHot)"/></g>';
    var frame = 'M0 0H600V600H0Z';
    for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) {
      var x = j * cell + g, y = i * cell + g, w = cell - 2 * g, r = 13;
      frame += 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + w - r) + 'Q' + (x + w) + ' ' + (y + w) + ' ' + (x + w - r) + ' ' + (y + w) + 'H' + (x + r) + 'Q' + x + ' ' + (y + w) + ' ' + x + ' ' + (y + w - r) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Z';
    }
    s += '<path d="' + frame + '" fill="#1b1514" fill-rule="evenodd"/>';
    for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) s += '<rect x="' + (j * cell + g - 1.5) + '" y="' + (i * cell + g - 1.5) + '" width="' + (cell - 2 * g + 3) + '" height="' + (cell - 2 * g + 3) + '" rx="14" fill="none" stroke="#3b302c" stroke-width="3"/>';
    for (i = 0; i <= 6; i++) for (j = 0; j <= 6; j++) {
      var cx = j * cell, cy = i * cell;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="url(#lvStud)" opacity=".75"/><path d="M' + cx + ' ' + (cy - 4.5) + 'l4.5 4.5-4.5 4.5-4.5-4.5z" fill="#ff9a3a"/>';
    }
    return s + '</svg>';
  }
  function holes(tiles) {
    var s = '';
    tiles.forEach(function (t, k) { if (t <= 0) s += '<rect x="' + ((k % 6) * 100 + 7) + '" y="' + (Math.floor(k / 6) * 100 + 7) + '" width="86" height="86" rx="13"/>'; });
    return s;
  }
  // мини-карта для меню
  function mini(tiles) {
    var s = '<svg viewBox="0 0 60 60" aria-hidden="true">', fill = ['#1a0d08', '#6e5c52', '#b9a99c', '#f3ece5'];
    tiles.forEach(function (t, k) { s += '<rect x="' + ((k % 6) * 10 + 1) + '" y="' + (Math.floor(k / 6) * 10 + 1) + '" width="8" height="8" rx="1.6" fill="' + fill[t] + '"/>'; });
    return s + '</svg>';
  }
  var I = {
    home: '<path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5"/><path d="M10 20v-5h4v5"/>',
    restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4.5h4.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.1-2.5 3.8"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>',
    soundOn: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    soundOff: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>',
    play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
    stay: '<path d="M12 20V9"/><path d="m7.5 13 4.5-4.5 4.5 4.5"/><path d="M5 4h14"/>',
    flag: '<path d="M6 21V4h11l-2 4 2 4H6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I[n] + '</svg>'; }
  return { colors: colors, gem: gem, board: board, holes: holes, mini: mini, icon: icon };
})();
