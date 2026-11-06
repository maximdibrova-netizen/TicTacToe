import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { firebaseConfig } from './config.js';
const query=new URLSearchParams(location.search),loopback=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
function port(key){const p=query.get(key)||'';return loopback&&/^\d{4,5}$/.test(p)&&+p<65536?+p:null;}
const authPort=port('authEmulator'),firestorePort=port('firestoreEmulator');
const config={...firebaseConfig};if(authPort)config.projectId='demo-mdgames';
if([firebaseConfig.projectId+'.web.app',firebaseConfig.projectId+'.firebaseapp.com'].includes(location.hostname))config.authDomain=location.hostname;
export const app=initializeApp(config),auth=getAuth(app);auth.languageCode='ru';
if(authPort)connectAuthEmulator(auth,'http://127.0.0.1:'+authPort,{disableWarnings:true});
let db;
export function database(){
  // An Auth-only test must never accidentally access production Firestore.
  if(authPort&&!firestorePort)return null;
  if(!db){db=getFirestore(app);if(firestorePort)connectFirestoreEmulator(db,'127.0.0.1',firestorePort);}
  return db;
}
window.GameAccount={currentUser:()=>auth.currentUser,ready:auth.authStateReady(),signIn:()=>{
  const button=document.getElementById('accountOpen');if(button)button.click();else location.href='../?signin=1&return='+encodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
}};
onAuthStateChanged(auth,user=>window.dispatchEvent(new CustomEvent('account:changed',{detail:{uid:user?.uid||null,name:user?.displayName||''}})));
