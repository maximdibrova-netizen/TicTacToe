const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const root=path.resolve(__dirname,'..');
test('Firebase publishes only the built site, with all eleven games and engine assets',()=>{
 const tool=path.join(root,'prepare_firebase.py');assert.ok(fs.existsSync(tool),'hosting packager is implemented');
 const result=spawnSync('python',[tool],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));assert.equal(cfg.hosting.public,'firebase-public');assert.equal(cfg.hosting.rewrites,undefined,'each game keeps its real page');
 const pub=path.join(root,cfg.hosting.public);
 for(const g of ['chess','checkers','go','ttt','tochki','battleship','lava','abalone','falling4','quoridor','durak'])assert.ok(fs.existsSync(path.join(pub,g,'index.html')),g);
 for(const name of ['src','tests','node_modules','.git','package.json','firebase-debug.log','firebase.json'])assert.equal(fs.existsSync(path.join(pub,name)),false,name+' stays private');
 for(const name of ['account.js','game-rating.js','sw.js','manifest.webmanifest','chess/sf/stockfish-19-lite-single.wasm','durak/cards/deck-full.webp'])assert.ok(fs.existsSync(path.join(pub,name)),name);
 assert.match(fs.readFileSync(path.join(pub,'index.html'),'utf8'),/accountOpen/);
 assert.ok(cfg.hosting.headers.some(h=>h.source==='/sw.js'&&h.headers.some(x=>x.key==='Cache-Control'&&x.value.includes('no-cache'))));
});
