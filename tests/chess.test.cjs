const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../src/chess/core.js'),'utf8'),ctx);
 test('legal opening, castling and checkmate',()=>{const c=new ctx.Chess();assert.equal(c.moves().length,20);for(const m of ['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O'])c.move(m);assert.equal(c.get('g1').type,'k');const f=new ctx.Chess();['f3','e5','g4','Qh4#'].forEach(m=>f.move(m));assert.ok(f.isCheckmate());});
 test('en passant and underpromotion',()=>{const c=new ctx.Chess();['e4','a6','e5','d5','exd6'].forEach(m=>c.move(m));assert.equal(c.get('d5'),undefined);const p=new ctx.Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');p.move({from:'a7',to:'a8',promotion:'n'});assert.equal(p.get('a8').type,'n');});
 test('stalemate and simple bot returns a legal move',()=>{const c=new ctx.Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');assert.ok(c.isStalemate());const b=new ctx.Chess();assert.ok(b.moves().includes(ctx.chessBot(b)));});

