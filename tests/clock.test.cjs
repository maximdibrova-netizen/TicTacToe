const {test}=require('node:test');
const assert=require('node:assert/strict');
const Clock=require('../src/shared/clock-core.js');
test('asymmetric Fischer increment, same-player turns and flag before increment',()=>{
 const c=new Clock([180000,300000],[2000,3000],0,1000);
 assert.equal(c.move(1,11000),true); assert.deepEqual(c.left,[172000,300000]);
 c.move(1,16000); assert.deepEqual(c.left,[172000,298000]);
 c.move(0,17000); assert.deepEqual(c.left,[172000,300000]);
 assert.equal(c.move(1,189000),false); assert.equal(c.flag,0); assert.equal(c.left[0],0);
});
test('elapsed wall time survives throttled callbacks; stop freezes clocks',()=>{
 const c=new Clock([60000,60000],[0,0],0,0);
 c.tick(45000); assert.equal(c.left[0],15000); c.stop(50000); c.tick(80000);
 assert.equal(c.left[0],10000); assert.equal(c.flag,null);
});

