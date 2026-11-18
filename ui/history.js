/* Week view, history & streaks, import/export. */
import {iconKey,logMode,mig,norm,uid} from '../core/routine.js';
import {DN,onDay,rDays,streakOf} from '../core/schedule.js';
import {build} from '../core/steps.js';
import {dayAdd,dk,kd,mmss,weekStart} from '../core/time.js';
import {COLORS,esc,nsTag,svgi} from './html.js';
import {H,HDEL,R,S,persist,saveH,setH,setS} from './storage.js';
import {scheduleSync} from './sync.js';
import {renderList,show} from './views.js';
/* week: this week (Mon–Sun) at a glance: what is planned each day, one-time additions (dashed), done (✓) and skipped (struck
   through), with the planned time per day. Tap a routine to edit it; its Back returns here. */
var WKM=localStorage.getItem('rf2_wkm')||'week'; // week view mode on this device: 'week' (this week) or 'plan' (schedule)
function wkMode(m){WKM=m;try{localStorage.setItem('rf2_wkm',m);}catch(e){}renderWeek();}
function openWeek(){renderWeek();show('week');}
function renderWeek(){const today=dk(Date.now()),ws=weekStart(today),act=R.filter(r=>!r.archived);
  /* per day: planned = scheduled on that weekday or added once, minus skipped (estimated length, done or not); done = workouts logged that day (actual time); a workout done on a day it wasn't planned shows as an extra (dashed) and counts only as done */
  const tot=r=>build(r).reduce((a,s)=>a+(s.dur||0),0),hm=x=>{const m=Math.max(1,Math.round(x/60));return m>=60?`${Math.floor(m/60)} h${m%60?' '+m%60+' min':''}`:`${m} min`;};
  const chip=(r,c,x)=>`<button class="wchip ${c}" style="--c:${COLORS[r.color]}" onclick="openEditor('${r.id}','week')">${svgi(iconKey(r),14)}<span>${esc(r.name)}</span>${x}</button>`;
  const any=act.filter(r=>!rDays(r).length),pm=WKM==='plan',anyH=any.length?`<div class="sech" style="margin-top:20px">Anytime</div><div class="wl">${any.map(r=>chip(r,'',!pm&&logMode(r)==='off'?svgi('nolog',14):'')).join('')}</div>`:'',
    seg=`<div class="wseg">${[['week','This week'],['plan','Schedule']].map(([m,t])=>`<button class="${(m==='plan')===pm?'on':''}" onclick="wkMode('${m}')">${t}</button>`).join('')}</div>`;
  /* Schedule: the usual week, only from the days set in each routine (no skips, additions or done workouts) */
  if(pm){let n=0,sum=0,rows='';const twd=kd(today).getDay();
    for(let i=0;i<7;i++){const wd=(i+1)%7,on=act.filter(r=>rDays(r).includes(wd)),t=on.reduce((a,r)=>a+tot(r),0);n+=on.length;sum+=t;
      rows+=`<div class="wday plan${wd===twd?' today':''}"><div class="wd"><b>${DN[wd]}</b></div><div class="wl">${on.map(r=>chip(r,'','')).join('')||'<span class="muted wrest">Rest day</span>'}${t?`<span class="wt muted">~${hm(t)}</span>`:''}</div></div>`;}
    weekBody.innerHTML=seg+`<p class="muted wsum"><span>Usual week</span> · <span>${n} workout${n!==1?'s':''}${sum?`, ~${hm(sum)}`:''}</span></p><div class="card wcard">${rows}</div>${anyH}<p class="muted wleg">Only the days set in each routine, without skips, additions or done workouts. Tap a routine to change its days.</p>`;return;}
  let P=0,PT=0,D=0,DT=0,K=0,nl=0,rows='';
  for(let i=0;i<7;i++){const k=dayAdd(ws,i),d=kd(k),wd=d.getDay(),hs=H.filter(h=>dk(h.ts)===k);let pt=0,dt=0;const g=[[],[],[]];
    act.forEach(r=>{const pl=rDays(r).includes(wd),hd=hs.filter(h=>h.rid===r.id),sk=pl&&onDay(r,'skip',k)&&!hd.length,plan=(pl||onDay(r,'add',k))&&!sk;
      if(!plan&&!sk&&!hd.length)return;const off=logMode(r)==='off';if(off)nl++;
      if(plan){P++;pt+=tot(r);}if(sk)K++;D+=hd.length;dt+=hd.reduce((a,h)=>a+(h.dur||0),0);
      g[sk?2:plan?0:1].push(chip(r,[hd.length&&'done',!pl&&'add',sk&&'sk',off&&!hd.length&&'nl'].filter(Boolean).join(' '),
        hd.length?svgi('check',14,3)+(hd.length>1?`<small>×${hd.length}</small>`:''):off?svgi('nolog',14):''));});
    PT+=pt;DT+=dt;const all=g.flat().join('');
    rows+=`<div class="wday${k===today?' today':k<today?' past':''}"><div class="wd"><b>${DN[wd]}</b><span>${d.getDate()}</span></div>
      <div class="wl">${all||'<span class="muted wrest">Rest day</span>'}${pt||dt?`<span class="wt muted">${[pt&&`~${hm(pt)} planned`,dt&&`<span class="wdn">${svgi('check',12,3)}${hm(dt)} done</span>`].filter(Boolean).join(' · ')}</span>`:''}</div></div>`;}
  const f=k=>kd(k).toLocaleDateString('en',{month:'short',day:'numeric'});
  const key=[['','Scheduled'],['add','Added once'],['done','Done',svgi('check',13,3)],['miss','Not done (past)'],['sk','Skipped']].concat(nl?[['nl','No logging',svgi('nolog',13)]]:[]).map(([c,t,x=''])=>`<span class="wchip ${c}"><span>${t}</span>${x}</span>`).join('');
  weekBody.innerHTML=seg+`<p class="muted wsum">${[`${f(ws)} – ${f(dayAdd(ws,6))}`,`${P} planned${PT?`, ~${hm(PT)}`:''}`,D&&`<span class="wdn">${svgi('check',12,3)}${D} done, ${hm(DT)}</span>`,K&&`${K} skipped`].filter(Boolean).map(x=>`<span>${x}</span>`).join(' · ')}</p><div class="card wcard">${rows}</div>`+
    anyH+
    `<div class="wkey">${key}</div><p class="muted wleg"><b>Planned</b>: estimated length of the scheduled and added routines, done or not. Skipped ones don't count.<br><b>Done</b>: actual time of the workouts logged that day, extras included.${nl?' Routines with No logging are never marked done.':''}<br>Dashed = not on its usual days: added once, or done as an extra. Tap a routine to change its days.</p>`;}
function streaks(list=H){return streakOf(list);}
function logWorkout(e){const before=streaks().best;if(!H.some(h=>h.id===e.id)&&!HDEL[e.id]){H.push(e);saveH();scheduleSync();}const st=streaks();return {...st,newBest:st.cur>1&&st.cur>before};}
function updHistBtn(){const b=document.getElementById('histBtn');if(!b)return;const st=streaks();b.classList.toggle('on',st.today);b.innerHTML=svgi('flame',20)+(st.cur?`<b>${st.cur}</b>`:'');b.title=st.cur?`${st.cur}-day streak · History`:'History';}
function openHist(){renderHist();show('hist');}
function delHist(id){if(!confirm('Remove this workout from your history?'))return;HDEL[id]=Date.now();setH(H.filter(h=>h.id!==id));saveH();scheduleSync();renderHist();updHistBtn();}
function renderHist(){const st=streaks(),today=dk(Date.now()),ws=weekStart(today);
  const week=H.filter(h=>dk(h.ts)>=ws).length;
  const cnt={},sc={};H.forEach(h=>{const k=dk(h.ts);cnt[k]=(cnt[k]||0)+1;if(h.streak!==false)sc[k]=1;});let nLo=0;
  const W=17,start=dayAdd(ws,-(W-1)*7);let cells='';
  for(let i=0;i<W*7;i++){const k=dayAdd(start,i),c=cnt[k]||0,o=c&&!sc[k];if(o)nLo++;cells+=`<i class="${k>today?'fut':o?'lo':c>=3?'l3':c===2?'l2':c?'l1':''}${k===today?' today':''}" title="${k}: ${c} workout${c!==1?'s':''}${o?' (log only)':''}"></i>`;}
  const mins=Math.round(H.reduce((a,h)=>a+(h.dur||0),0)/60);
  let html=`<div class="hstats">
    <div class="hstat fire"><b>${svgi('flame',20)}${st.cur}</b><span>day streak</span></div>
    <div class="hstat"><b>${st.best}</b><span>best streak</span></div>
    <div class="hstat"><b>${week}</b><span>this week</span></div>
    <div class="hstat"><b>${H.length}</b><span>workouts</span></div></div>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><b>Last ${W} weeks</b><span class="muted" style="font-size:13px">${mins} min total</span></div>
    <div class="heatwrap"><div class="heatdays">${['M','','W','','F','','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="heat">${cells}</div></div>
    <div class="legend">Less <i style="background:rgba(255,255,255,.06)"></i><i style="background:rgba(255,75,22,.38)"></i><i style="background:rgba(255,75,22,.68)"></i><i style="background:#FF4B16"></i> More${nLo?`<i style="background:rgba(255,255,255,.28);margin-left:10px"></i> Log only`:''}</div></div>`;
  if(!H.length)html+=`<p class="muted" style="text-align:center;margin-top:24px">No workouts yet. Finish a routine and it shows up here.</p>`;
  const yest=dayAdd(today,-1);let last='';
  [...H].sort((a,b)=>b.ts-a.ts).slice(0,100).forEach(h=>{const k=dk(h.ts);
    if(k!==last){last=k;html+=`<div class="hday">${k===today?'Today':k===yest?'Yesterday':kd(k).toLocaleDateString([],{weekday:'long',day:'numeric',month:'short'})}</div>`;}
    const c=COLORS[h.color]||COLORS.blue,bits=[new Date(h.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),mmss(h.dur),`${h.rounds} round${h.rounds!==1?'s':''}`];
    if(h.reps)bits.push(`${h.reps} reps`);if(h.calls)bits.push(`${h.calls} combos`);if(h.streak===false)bits.push(nsTag('log only','Logged, not counted for streak',12));
    html+=`<div class="hitem"><div class="dot" style="background:${c}26;color:${c}">${svgi(h.icon||'activity',18)}</div><div class="info"><b>${esc(h.name)}</b><span>${bits.join(' · ')}</span></div><button class="ghost icon" onclick="delHist('${h.id}')" title="Remove" style="padding:6px;color:var(--tx2)">${svgi('trash',16)}</button></div>`;});
  histBody.innerHTML=html;}
function exportAll(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({routines:R,settings:S,history:H},null,2)],{type:'application/json'}));a.download='workout-pacer-routines.json';a.click();}
function importAll(inp){const f=inp.files[0];if(!f)return;f.text().then(t=>{try{const d=JSON.parse(t);const list=d.routines||d;(Array.isArray(list)?list:[list]).forEach(r=>{if(!r||typeof r!=='object')return;r=mig(r);r.id=uid();r=norm({...r,blocks:(r.blocks||[]).map(b=>({...b,id:uid()}))});delete r.upd;R.push(r)});if(d.settings)setS({...S,...d.settings});if(Array.isArray(d.history)){const ids=new Set(H.map(h=>h.id));d.history.forEach(h=>{if(h&&h.id&&!ids.has(h.id)&&!HDEL[h.id])H.push(h);});H.sort((a,b)=>a.ts-b.ts);saveH();}persist();renderList();}catch(e){alert('Invalid file');}});inp.value='';}
export {wkMode,openWeek,renderWeek,streaks,logWorkout,updHistBtn,openHist,delHist,renderHist,exportAll,importAll};
