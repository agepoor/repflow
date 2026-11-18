/* The routine model: presets, migration of older data, repair of blocks, and what a routine's settings mean.
   No DOM or browser UI: runs in any JavaScript engine. */
import {parseDur} from './time.js';
const ROUTINE_ICONS=['activity','wind','zap','flame','glove','dumbbell','timer','heart','target','trending','mountain','repeat','star','basketball','soccer','volleyball','tennis','medball','juggle','bounce'];
const EMOJI2IC={'🌪️':'wind','🌪':'wind','⚡':'zap','🔥':'flame','🥊':'glove','💪':'dumbbell','🏋️':'dumbbell','🏋':'dumbbell','⏱':'timer','⏱️':'timer','❤️':'heart','🎯':'target','🏀':'basketball','⚽':'soccer','🏐':'volleyball','🎾':'tennis','⚾':'tennis','🤹':'juggle'};
const iconKey=r=>ROUTINE_ICONS.includes(r&&r.icon)?r.icon:(EMOJI2IC[r&&r.icon]||'activity');
const uid=()=>Math.random().toString(36).slice(2,10);
const PRESETS=()=>PRESETS0().map(mig);
const PRESETS0=()=>[
 {id:'p-burpees12',name:'Burpees 12-count',icon:'wind',color:'orange',rounds:3,rest:75,prep:10,
  notes:'Breathe in on the way down (1–4), out on the push-up (5) and the jump (12). Pick a pace you can hold for 3 rounds.',
  blocks:[
   {id:uid(),type:'reps',name:'A · Reps',reps:8,counts:12,tempo:1,mode:'guided',repPause:2,cues:'',lastOnly:false,restAfter:0},
   {id:uid(),type:'reps',name:'B · Finisher non-stop',reps:5,counts:12,tempo:0.8,mode:'guided',repPause:0,cues:'',lastOnly:true,restAfter:0}]},
 {id:'p-snack',name:'Quick burpee snack',icon:'zap',color:'yellow',rounds:1,rest:0,prep:5,notes:'Short version: 6 burpees, ~2 min.',
  blocks:[{id:uid(),type:'reps',name:'Burpees',reps:6,counts:12,tempo:1,mode:'guided',repPause:2,cues:'',lastOnly:false,restAfter:0}]},
 {id:'p-tabata',name:'Burpee Tabata',icon:'flame',color:'red',rounds:8,rest:10,prep:10,notes:'20 s max effort, 10 s rest, 8 rounds.',
  blocks:[{id:uid(),type:'timed',name:'Burpees — max reps',work:20,cue:'Go go go',lastOnly:false,restAfter:0}]},
 {id:'p-boxing',name:'Boxing 3 × 3 min',icon:'glove',color:'blue',rounds:3,rest:60,prep:10,notes:'1 jab · 2 cross · 3 lead hook · 4 rear hook · 5 lead uppercut · 6 rear uppercut',
  blocks:[{id:uid(),type:'boxing',name:'Shadow boxing',work:180,combos:'1-2\n1-1-2\n1-2-3\n1-2-3-2\n1-6-3-2\n2-3-2\n1-2 slip slip\n3-2-3\njab body\n1-2-5-2',minGap:1,maxGap:2,lastOnly:false,restAfter:0}]},
 {id:'p-pushup',name:'Push-up tap counter',icon:'dumbbell',color:'green',rounds:3,rest:60,prep:5,notes:'Tap the circle for each rep — set pace yourself.',
  blocks:[{id:uid(),type:'reps',name:'Push-ups',reps:15,counts:1,tempo:2,mode:'tap',repPause:0,cues:'',lastOnly:false,restAfter:0}]}
];
const DEF_SET={voice:true,beeps:true,lang:'en-US',voiceURI:'',pitch:1,speakCounts:'every',countdown:3,vibrate:true,volume:0.8,rate:1.1,wake:true};
/* sound & voice: Settings, or a routine's own (r.snd: all of SND; older routines only had a voice language, r.lang) */
const SND=['beeps','voice','lang','voiceURI','speakCounts','countdown','volume','rate','pitch'];
const sndCopy=o=>Object.fromEntries(SND.map(k=>[k,o[k]]));
const PRESET_IDS=()=>{const m={};PRESETS().forEach(p=>m[p.name]=p.id);return m;};
/* v2: routine count length is absolute seconds; block tempo is an optional override (empty = routine) */
function mig(r){if(r.cv>=2)return r;const rs=r.sec||1;
  return {...r,cv:2,sec:rs,blocks:(r.blocks||[]).map(b=>{if(b.type!=='reps'){const {sec,...x}=b;return x;}
    const {sec,...x}=b;const eff=Math.round((b.tempo||1)*((sec>0?sec:rs))*1000)/1000;
    if(Math.abs(eff-rs)<1e-9)delete x.tempo;else x.tempo=eff;return x;})};}
/* repair blocks: every block needs a unique id (inputs edit blocks by id) and its type's defaults */
const BDEF={reps:{name:'Reps',reps:10,counts:12,mode:'guided',repPause:0,cues:'',display:'both'},timed:{name:'Work',work:30,cue:''},
  boxing:{name:'Shadow boxing',work:120,combos:'1-2',minGap:1,maxGap:2},seq:{name:'Sequence',work:3,steps:''},rest:{name:'Rest',work:30}};
function norm(r){if(!r||typeof r!=='object')return r;const seen=new Set();let fixed=false;
  const blocks=(Array.isArray(r.blocks)?r.blocks:[]).filter(b=>b&&typeof b==='object').map((b,i)=>{const t=BDEF[b.type]?b.type:'timed';
    let id=b.id!=null&&b.id!==''?String(b.id):'';if(!id||seen.has(id)){id=(r.id||'r')+'-b'+i;while(seen.has(id))id+='x';}seen.add(id);
    const x={...BDEF[t],lastOnly:false,restAfter:0,...b,id,type:t};['reps','counts','repPause','work','minGap','maxGap','restAfter','tempo','repeat','poolPause'].forEach(k=>{if(k in x&&typeof x[k]!=='number'){const n=+x[k];x[k]=isFinite(n)?n:(BDEF[t][k]??0);}});
    if(JSON.stringify(x)!==JSON.stringify(b))fixed=true;return x;});
  const out={...r,blocks};if(!(+out.rounds>=1)){out.rounds=1;fixed=true;}if(typeof out.rest!=='number'){out.rest=+out.rest||0;fixed=true;}if(typeof out.prep!=='number'){out.prep=+out.prep||0;fixed=true;}
  if(!out.name){out.name='Routine';fixed=true;}return fixed||!Array.isArray(r.blocks)?out:r;}
function canon(list){list=list.filter(r=>r&&typeof r==='object').map(r=>norm(mig(r)));const P=PRESET_IDS(),have=new Set(list.map(r=>r.id));
  return list.map(r=>{const pid=P[r.name];if(pid&&r.id!==pid&&!have.has(pid)){have.add(pid);return {...r,id:pid};}return r;});}
const sig=r=>{const {upd,...x}=r;return JSON.stringify(x);};
/* Sequence block: one step per line, spoken and shown as typed. "@6" (s), "@1.5", "@1:30" or "@tap" at the end of a line
   gives it its own time or waits for a tap; other lines get the block's time per step; a line with only a time is a silent pause */
function stepSec(v){v=v.replace(/,/g,'.');const m=v.match(/^(\d+(?:\.\d+)?)\s*(?:s|secs?|seconds?)?$/);if(m)return +m[1];const s=parseDur(v);return s>0?s:NaN;}
function seqSteps(b){const d=+b.work>0?+b.work:3;return (b.steps||'').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
  const m=l.match(/^(.*?)\s*@\s*([^@]*)$/);if(!m)return {t:l,dur:d};const t=m[1].trim(),v=m[2].trim().toLowerCase();
  if(v==='tap')return {t,tap:true};const s=stepSec(v);if(!(s>0))return {t:l,dur:d,bad:true,v:m[2].trim()};return t?{t,dur:s}:{t:'Pause',dur:s,q:true};});}
function bDur(b,r){if(b.type==='seq')return seqSteps(b).reduce((a,x)=>a+(x.tap?0:x.dur),0);if(b.type==='reps'){if(b.mode==='tap')return null;const t=b.tempo>0?b.tempo:(r.sec||1),n=Math.max(1,b.reps|0);return n*Math.max(1,b.counts|0)*t+(n-1)*(b.repPause||0);}return +b.work||0;}

// A block runs in every round, or only in the first round (warm-up) or only in the last round (finisher)
function inRound(b,first,last){return b.firstOnly?first:b.lastOnly?last:true;}
/* Continue: '' = auto-start; 'rounds' = wait for a tap before each next round; 'blocks' = before each next block (hold:true from before = rounds) */
function holdMode(r){return r.hold==='blocks'?'blocks':r.hold?'rounds':'';}
/* logging per routine: nolog = No logging; streak:false = Log only (the workout is logged with streak:false: in history, not in streaks); neither = Log and count for streak */
function logMode(r){return r.nolog?'off':r.streak===false?'log':'streak';}
export {ROUTINE_ICONS,iconKey,uid,PRESETS,DEF_SET,sndCopy,mig,norm,canon,sig,seqSteps,bDur,inRound,holdMode,logMode};
