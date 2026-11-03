// PGN с рекурсивными вариантами (RAV). Нумерация берётся из FEN родителя.
function exportChessPGN(root, meta) {
  meta=meta||{};var headers=Object.assign({},meta.headers||{}),result=/^(1-0|0-1|1\/2-1\/2|\*)$/.test(meta.result)?meta.result:'*';
  headers.Event=headers.Event||'Chess analysis';headers.Site=headers.Site||'?';headers.Date=headers.Date||'????.??.??';headers.Round=headers.Round||'?';headers.White=headers.White||'White';headers.Black=headers.Black||'Black';headers.Result=result;
  var standard='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  if(root.fen!==standard){headers.SetUp='1';headers.FEN=root.fen;}else{delete headers.SetUp;delete headers.FEN;}
  function quoted(s){return String(s).replace(/[\r\n]/g,' ').replace(/\\/g,'\\\\').replace(/"/g,'\\"');}
  var ordered=['Event','Site','Date','Round','White','Black','Result'];Object.keys(headers).forEach(function(k){if(ordered.indexOf(k)<0&&/^[A-Za-z][A-Za-z0-9_]*$/.test(k))ordered.push(k);});
  function line(first,alternatives){var tokens=[],n=first;while(n){var fields=n.parent.fen.split(' ');tokens.push(fields[5]+(fields[1]==='w'?'.':'...'),n.san);if(alternatives)n.parent.ch.slice(1).forEach(function(alt){tokens.push('('+line(alt,false)+')');});n=n.ch[0];alternatives=true;}return tokens.join(' ');}
  return ordered.map(function(k){return '['+k+' "'+quoted(headers[k])+'"]';}).join('\n')+'\n\n'+(root.ch.length?line(root.ch[0],true)+' ':'')+result+'\n';
}
