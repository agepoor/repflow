/* Sync: merging this device's data with the account's. No DOM or browser UI: runs in any JavaScript engine. */
import {canon} from './routine.js';
function merge(L,Rm){const del={...(Rm.deleted||{})};Object.entries(L.deleted||{}).forEach(([k,v])=>{if(!(del[k]>=v))del[k]=v;});
  const by={};[...canon(Rm.routines||[]),...canon(L.routines||[])].forEach(r=>{const o=by[r.id];if(!o||(r.upd||0)>(o.upd||0))by[r.id]=r;});
  let list=Object.values(by).filter(r=>!(del[r.id]>=(r.upd||0)));
  // collapse identical copies (same content, different id) — e.g. presets created on two devices
  const strip=r=>{const {id,upd,...x}=r;return JSON.stringify({...x,blocks:(x.blocks||[]).map(({id,...b})=>b)});};const keep={};
  const rid=new Set((Rm.routines||[]).map(r=>r.id));list.sort((a,b)=>(rid.has(b.id)-rid.has(a.id))||(a.id<b.id?-1:1)).forEach(r=>{const k=strip(r);if(keep[k])del[r.id]=Math.max(Date.now(),r.upd||0);else keep[k]=r;});
  list=list.filter(r=>!(del[r.id]>=(r.upd||0)));
  const lo=L.order||{ids:[],ts:0},ro=Rm.order||{ids:[],ts:0};const [w,o]=(lo.ts||0)>(ro.ts||0)?[lo,ro]:[ro,lo];
  const pos=id=>{let i=w.ids.indexOf(id);if(i>=0)return i;i=o.ids.indexOf(id);return i>=0?1e4+i:2e4;};
  list.sort((a,b)=>pos(a.id)-pos(b.id)||(a.id<b.id?-1:1));
  const hd={...(Rm.hdel||{})};Object.entries(L.hdel||{}).forEach(([k,v])=>{if(!(hd[k]>=v))hd[k]=v;});
  // a workout followed on two devices is logged on both under the same id: the stored copy wins, so devices agree
  const hm={};[...(L.history||[]),...(Rm.history||[])].forEach(h=>{if(h&&h.id)hm[h.id]=h;});
  const history=Object.values(hm).filter(h=>!hd[h.id]).sort((a,b)=>(a.ts-b.ts)||(a.id<b.id?-1:a.id>b.id?1:0));
  const lp=L.parts,rp=Rm.parts,parts=lp&&rp?((lp.ts||0)>=(rp.ts||0)?lp:rp):lp||rp; // parts of the day: the newest change wins
  return {app:'repflow',v:1,routines:list,deleted:del,order:{ids:list.map(r=>r.id),ts:Math.max(lo.ts||0,ro.ts||0)},history,hdel:hd,...(parts?{parts}:{})};}
export {merge};
