/* When routines are planned: days of the week, parts of the day, today, up next and streaks.
   No DOM or browser UI: runs in any JavaScript engine. */
import {dayAdd,dk} from './time.js';
/* part of the day: r.when = 'am' | 'mid' | 'pm'; none = anytime. Today is grouped by it; the clock only decides which part is current */
const WHEN={am:'Morning',mid:'Midday',pm:'Evening'},PARTS=['am','mid','pm'],partOf=r=>WHEN[r.when]?r.when:'';
/* when the parts start: META.parts = {mid, eve} in minutes after midnight (default 12:00 and 17:00) + ts; synced, the newest change wins.
   META.parts.off = the guidance is switched off: Today is one list again, no "now", no Up next, no Next on the done screen; routines keep their part */
const partsOnIn=parts=>!(parts&&parts.off);
function partTimes(parts){const p=parts||{},m=+p.mid,e=+p.eve;return m>0&&e>m&&e<1440?{mid:m,eve:e}:{mid:720,eve:1020};}
function partAt(parts,d=new Date()){const t=partTimes(parts),n=d.getHours()*60+d.getMinutes();return n<t.mid?'am':n<t.eve?'mid':'pm';}
function inToday(r){const now=new Date(),wd=now.getDay(),tk=dk(now.getTime());return !r.archived&&((rDays(r).includes(wd)&&!onDay(r,'skip',tk))||(onDay(r,'add',tk)&&!rDays(r).includes(wd)));}
const doneOnDay=(r,hist,tk=dk(Date.now()))=>hist.some(h=>h.rid===r.id&&dk(h.ts)===tk);
/* up next (label on the home screen, Next on the done screen): the first routine left for today (in your order) from the current part of the day, then Anytime, then earlier parts (missed), then later ones.
   Routines with No logging are never marked done, so they are left out */
function nextUp(list,hist,parts,d=new Date()){const c=PARTS.indexOf(partAt(parts,d)),rk=r=>{const w=partOf(r);if(!w)return 1;const i=PARTS.indexOf(w);return i===c?0:i<c?2:3;};
  const l=list.filter(r=>inToday(r)&&!r.nolog&&!doneOnDay(r,hist));return l.map((r,i)=>[rk(r),i,r]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[2])[0]||null;}
/* r.skip / r.add hold a list of date keys (older data: one key), so every skip and add of the week stays visible in the week view; kept for 14 days */
const dlist=v=>Array.isArray(v)?v:v?[v]:[],onDay=(r,f,k)=>dlist(r[f]).includes(k);
function setDay(r,f,on){const tk=dk(Date.now()),min=dayAdd(tk,-14),l=dlist(r[f]).filter(k=>k!==tk&&k>=min);if(on)l.push(tk);if(l.length)r[f]=l;else delete r[f];}
/* days of the week: r.days = weekday numbers (0 = Sun … 6 = Sat), Monday first in the UI; none = anytime */
const DOW=[1,2,3,4,5,6,0],DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function rDays(r){return Array.isArray(r.days)?DOW.filter(d=>r.days.includes(d)):[];}
function daysTxt(r){const d=rDays(r);if(d.length===7)return 'Every day';const out=[]; // three or more days in a row as a range: Mon–Fri
  for(let i=0;i<d.length;){let j=i;while(j+1<d.length&&DOW.indexOf(d[j+1])===DOW.indexOf(d[j])+1)j++;out.push(j-i>=2?DN[d[i]]+'–'+DN[d[j]]:d.slice(i,j+1).map(x=>DN[x]).join(' · '));i=j+1;}
  return out.join(' · ');}
function streakOf(list){const days=new Set(list.filter(h=>h.streak!==false).map(h=>dk(h.ts))),today=dk(Date.now());
  let cur=0,k=days.has(today)?today:dayAdd(today,-1);while(days.has(k)){cur++;k=dayAdd(k,-1);}
  let best=0,run=0,prev=null;[...days].sort().forEach(d=>{run=prev&&dayAdd(prev,1)===d?run+1:1;best=Math.max(best,run);prev=d;});
  return {cur,best,today:days.has(today)};}
export {WHEN,PARTS,partOf,partsOnIn,partTimes,partAt,doneOnDay,nextUp,onDay,setDay,DOW,DN,rDays,daysTxt,streakOf};
