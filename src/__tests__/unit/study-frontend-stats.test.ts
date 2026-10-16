// @vitest-environment node
import {it,expect} from 'vitest';
it('周统计由真实 daily 条目汇总，不添加伪造日期和记录', async()=>{
 const mod=await import('../../components/study/statistics-data').catch(()=>({}));expect(mod).toHaveProperty('weeklyStats');
 const {weeklyStats}=mod as typeof import('../../components/study/statistics-data');
 expect(weeklyStats([{date:'2026-10-12',reviews:2,successes:1,forgotten:1},{date:'2026-10-13',reviews:3,successes:3,forgotten:0}])).toEqual([{date:'2026-10-12',reviews:5,successes:4,forgotten:1}]);
 expect(weeklyStats([])).toEqual([]);
});
