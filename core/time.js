/* Durations, clock times and day keys. No DOM or browser UI: runs in any JavaScript engine. */
function fmt(sec){sec=Math.max(0,Math.ceil(sec));const m=Math.floor(sec/60),s=sec%60;return m?m+':'+String(s).padStart(2,'0'):String(s);}
/* Durations: stored as whole seconds; typed as 90, 1:30, 1.30, 20m, 1m30, 1m 30s, 1h; shown as m:ss */
function parseDur(v){v=String(v??'').trim().toLowerCase().replace(/,/g,'.');if(v==='')return null;
  let m=v.match(/^(\d+)$/);if(m)return +m[1];
  m=v.match(/^(?:(\d+)[:.])?(\d+)[:.](\d{1,2})$/);if(m&&+m[3]<60&&(!m[1]||+m[2]<60))return (+m[1]||0)*3600+ +m[2]*60+ +m[3];
  m=v.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?|s)?)?)?\s*(?:(\d+)\s*(?:s(?:ec(?:onds?|s)?)?)?)?$/);
  if(m&&(m[1]||m[2]||m[3]))return Math.round((+m[1]||0)*3600+(+m[2]||0)*60+(+m[3]||0));
  return NaN;}
function fmtDur(s){s=Math.max(0,Math.round(+s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60,p=n=>String(n).padStart(2,'0');return h?`${h}:${p(m)}:${p(x)}`:`${m}:${p(x)}`;}
function durWords(s){s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return [h&&h+' h',m&&m+' min',(x||!s)&&x+' s'].filter(Boolean).join(' ');}
/* −/+ steppers: 5 s under 1 min, 15 s under 5 min, 30 s under 10 min, then 1 min; hold to repeat */
function durStepSize(s){return s<60?5:s<300?15:s<600?30:60;}
const hhmm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); // field value
const dk=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const kd=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d);};
const dayAdd=(k,n)=>{const d=kd(k);d.setDate(d.getDate()+n);return dk(d.getTime());};
const weekStart=k=>dayAdd(k,-((kd(k).getDay()+6)%7));
const mmss=e=>{e=Math.round(e||0);const h=Math.floor(e/3600),m=Math.floor(e%3600/60),s=e%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;};
export {fmt,parseDur,fmtDur,durWords,durStepSize,hhmm,dk,kd,dayAdd,weekStart,mmss};
