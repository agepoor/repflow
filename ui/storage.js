/* Data on this device: own keys (rf2_*) since v2; v1 data (rf_*) is never written. First open copies v1 routines, settings
   and history (not the gist token). Every write goes through store(). */
import {DEF_SET,PRESETS,canon,sig} from '../core/routine.js';
import {toast} from './html.js';
import {scheduleSync} from './sync.js';
try{if(localStorage.getItem('rf2_routines')===null)['routines','set','meta','hist','hdel'].forEach(k=>{const v=localStorage.getItem('rf_'+k);if(v!==null)localStorage.setItem('rf2_'+k,v);});}catch(e){}
// once: workouts logged in v1 after the first copy (while v2 was a preview) are added to the history too
try{if(!localStorage.getItem('rf2_v1h')){const a=JSON.parse(localStorage.getItem('rf2_hist')||'[]')||[],d=JSON.parse(localStorage.getItem('rf2_hdel')||'{}')||{},ids=new Set(a.map(h=>h&&h.id)),b=(JSON.parse(localStorage.getItem('rf_hist')||'[]')||[]).filter(h=>h&&h.id&&!ids.has(h.id)&&!d[h.id]);if(b.length)localStorage.setItem('rf2_hist',JSON.stringify(a.concat(b).sort((x,y)=>(x.ts||0)-(y.ts||0))));localStorage.setItem('rf2_v1h','1');}}catch(e){}
let S=JSON.parse(localStorage.getItem('rf2_set')||'null')||{...DEF_SET};S={...DEF_SET,...S};
let H=JSON.parse(localStorage.getItem('rf2_hist')||'[]'),HDEL=JSON.parse(localStorage.getItem('rf2_hdel')||'{}');
let R=JSON.parse(localStorage.getItem('rf2_routines')||'null');
let SY={last:(JSON.parse(localStorage.getItem('rf2_sync')||'null')||{}).last||0};
let META=JSON.parse(localStorage.getItem('rf2_meta')||'null')||{deleted:{},orderTs:0};
let SNAP=null;const snapOf=()=>{const m={};R.forEach(r=>m[r.id]=sig(r));return {m,order:R.map(r=>r.id).join(',')};};
if(!R){R=PRESETS().map(r=>({...r,upd:0}));SNAP=snapOf();saveRaw();}else{R=canon(R);SNAP=snapOf();saveRaw();} // fresh defaults never override synced data
/* every write goes through store(): a failed save (storage full/blocked) is shown instead of silently lost */
var storeWarned=false;
function store(area,k,v){try{area.setItem(k,v);storeWarned=false;return true;}catch(e){if(!storeWarned){storeWarned=true;toast('Could not save on this device (storage full or blocked). Export a JSON backup in Settings.');}return false;}}
function saveRaw(){store(localStorage,'rf2_routines',JSON.stringify(R));store(localStorage,'rf2_set',JSON.stringify(S));store(localStorage,'rf2_meta',JSON.stringify(META));}
function persist(){const now=Date.now();let changed=false;const seen=new Set();
  R.forEach(r=>{seen.add(r.id);if(SNAP.m[r.id]!==sig(r)){r.upd=now;changed=true;}});
  Object.keys(SNAP.m).forEach(id=>{if(!seen.has(id)){META.deleted[id]=now;changed=true;}});
  const ord=R.map(r=>r.id).join(',');if(ord!==SNAP.order){META.orderTs=now;changed=true;}
  SNAP=snapOf();saveRaw();if(changed)scheduleSync();}

function saveH(){store(localStorage,'rf2_hist',JSON.stringify(H));store(localStorage,'rf2_hdel',JSON.stringify(HDEL));}
// for the modules that replace these
function setR(v){R=v;}
function setH(v){H=v;}
function setHDEL(v){HDEL=v;}
function setSNAP(v){SNAP=v;}
function setMETA(v){META=v;}
function setS(v){S=v;}
export {S,H,HDEL,R,SY,META,snapOf,store,saveRaw,persist,saveH,setR,setH,setHDEL,setSNAP,setMETA,setS};
