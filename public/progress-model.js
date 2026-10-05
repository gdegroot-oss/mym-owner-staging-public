export function validZone(zone) {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return typeof zone === 'string' && zone.length < 100; } catch { return false; }
}
export function dayKey(time, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}
const shift = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0,10);
export function journeySummary(events, sessions, zone = 'UTC', now = Date.now()) {
  if (!validZone(zone)) throw new Error('Invalid timezone');
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const key=time=>formatter.format(new Date(time));
  const days = {}, categories = {}; let seconds = 0;
  for (const event of events) {
    const credit = Number(event.seconds), end = Date.parse(event.ended_at);
    if (!(credit > 0 && credit <= 15) || !Number.isFinite(end) || end > now) continue;
    seconds += credit;
    // Exact millisecond midnight boundary; most pulses remain in one day.
    const start=end-credit*1000, first=key(start), last=key(end-0.001);
    if(first===last)days[first]=(days[first]||0)+credit;
    else {
      let lo=Math.floor(start),hi=Math.ceil(end);
      while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(key(mid)===first)lo=mid;else hi=mid;}
      const before=(hi-start)/1000;
      days[first]=(days[first]||0)+before;days[last]=(days[last]||0)+credit-before;
    }
    if (event.category) categories[event.category] = (categories[event.category] || 0) + credit;
  }
  const qualified = Object.keys(days).filter(day=>days[day] >= 60 - 1e-6).sort(), today = key(now);
  let longest = 0, run = 0, previous;
  for (const day of qualified) { run = previous && shift(previous,1) === day ? run+1 : 1; longest = Math.max(longest,run); previous = day; }
  let current = 0, cursor = qualified.includes(today) ? today : shift(today,-1);
  while (qualified.includes(cursor)) { current++; cursor=shift(cursor,-1); }
  const weekday = new Date(today+'T12:00Z').getUTCDay(), weekStart=shift(today,-((weekday+6)%7));
  const completed = new Set(sessions.filter(s=>s.completed_at).map(s=>s.meditation_id)).size;
  const milestones = [
    {id:'first',label:'Je eerste meditatie',achieved:completed >= 1},
    {id:'week',label:'Zeven luisterdagen',achieved:qualified.length >= 7},
    {id:'hour',label:'Een uur ruimte',achieved:seconds >= 3600},
    {id:'five-hours',label:'Vijf uur ruimte',achieved:seconds >= 18000},
  ];
  return {seconds,completed,current_streak:current,longest_streak:longest,days,minimum_seconds:60,timezone:zone,
    week_days:qualified.filter(d=>d>=weekStart&&d<=today).length,month_days:qualified.filter(d=>d.startsWith(today.slice(0,7))).length,
    favorite_categories:seconds>=600&&sessions.filter(s=>Number(s.listened_seconds)>0).length>=3 ? Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([category,seconds])=>({category,seconds})) : [],
    milestones,recent:sessions.filter(s=>Number(s.listened_seconds)>0).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,10)};
}
