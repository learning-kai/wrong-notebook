import type {StudyStats} from './types';
export function weeklyStats(daily:StudyStats['daily']):StudyStats['daily'] {
 const weeks=new Map<string,StudyStats['daily'][number]>();
 for(const row of daily){const date=new Date(`${row.date}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));const key=date.toISOString().slice(0,10);const week=weeks.get(key)||{date:key,reviews:0,successes:0,forgotten:0};week.reviews+=row.reviews;week.successes+=row.successes;week.forgotten+=row.forgotten;weeks.set(key,week);}
 return [...weeks.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
