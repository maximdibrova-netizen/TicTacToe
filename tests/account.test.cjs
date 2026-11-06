const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../src/account/core.js'),A=fs.existsSync(file)?require(file):{};
test('account validation and readable errors are available',()=>assert.equal(typeof A.validate,'function'));
if(A.validate){
 test('registration validates email, nickname and password; sign-in accepts an existing shorter password',()=>{
  assert.equal(A.validate('register',{email:'a@example.com',password:'abcdef12',name:'Максим'}),'');
  assert.match(A.validate('register',{email:'broken',password:'abcdef12',name:'Максим'}),/почт/);
  assert.match(A.validate('register',{email:'a@example.com',password:'short',name:'Максим'}),/8/);
  assert.match(A.validate('register',{email:'a@example.com',password:'abcdef12',name:'a'.repeat(33)}),/32/);
  assert.equal(A.validate('login',{email:'a@example.com',password:'123456'}),'');
  assert.equal(A.validate('reset',{email:'a@example.com'}),'');
 });
 test('authentication failures explain the next action without revealing whether an email is registered',()=>{
  assert.equal(A.error({code:'auth/user-not-found'}),A.error({code:'auth/wrong-password'}));
  assert.equal(A.error({code:'auth/invalid-credential'}),A.error({code:'auth/user-not-found'}));
  assert.match(A.error({code:'auth/popup-blocked'}),/окн/);
  assert.match(A.error({code:'auth/network-request-failed'}),/интернет/);
  assert.doesNotMatch(A.error({code:'auth/operation-not-allowed'}),/Firebase|SDK|API/);
 });
}
