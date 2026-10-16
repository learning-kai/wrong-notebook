import { useState } from 'react';
import { weeklyStats } from './statistics-data';
import type { StudyStats } from './types';
export function Statistics({ stats, overview = false }: {
    stats: StudyStats | null;
    overview?: boolean;
}) {
    const [weekly, setWeekly] = useState(false);
    if (!stats)
        return <section className="study-panel" aria-busy="true">正在加载真实统计…</section>;
    const points = weekly ? weeklyStats(stats.daily) : stats.daily;
    const max = Math.max(1, ...points.map(d => d.reviews));
    return <div className="study-stack"><section className="study-metrics" aria-label="学习统计">{[['全部卡片', stats.total], ['今日到期', stats.due], ['今日完成', stats.reviewsToday], ['今日自评掌握率', `${stats.todayAccuracy}%`], ['连续复习', `${stats.streak} 天`], ['自评遗忘率', `${stats.forgettingRate}%`]].map(([label, value]) => <article className="study-panel" key={label}><p className="study-muted">{label}</p><strong>{value}</strong></article>)}</section>
 <section className="study-panel"><div className="study-section-head"><h2>{overview ? '今日学习概览' : '真实复习记录'}</h2><button type="button" onClick={() => setWeekly(v => !v)}>{weekly ? '按日查看' : '按周查看'}</button></div><p className="study-muted">统计基于已同步的自评分与用户时区，不自动判题。未同步离线记录不计入服务器统计。</p><p>今日新卡 {stats.todayNewUsed} · 今日复习 {stats.todayReviewsUsed}</p>
 {!stats.daily.length || !stats.daily.some(d => d.reviews) ? <div className="study-empty">暂无复习记录；完成自评后会显示曲线。</div> : <><div className="study-chart-wrap"><svg viewBox="0 0 720 200" role="img" aria-label="每日复习量曲线"><title>每日复习量（全部 / 掌握 / 遗忘）</title><line x1="25" y1="175" x2="700" y2="175" stroke="currentColor" opacity=".2"/>{(['reviews', 'successes', 'forgotten'] as const).map((key, index) => <polyline key={key} fill="none" stroke={['#0075de', '#278272', '#d65436'][index]} strokeWidth="3" points={points.map((d, i) => `${25 + i / Math.max(1, points.length - 1) * 675},${175 - d[key] / max * 145}`).join(' ')}/>)}</svg></div><p className="study-muted">蓝：复习 · 绿：自评掌握 · 红：遗忘</p><details><summary>查看每日 / 每周数据表</summary><div className="study-table-wrap"><table><thead><tr><th>日期</th><th>复习</th><th>掌握</th><th>遗忘</th></tr></thead><tbody>{points.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.reviews}</td><td>{d.successes}</td><td>{d.forgotten}</td></tr>)}</tbody></table></div></details></>}
 </section><section className="study-panel"><h2>课程掌握度</h2>{stats.courses.length ? stats.courses.map(c => <div className="study-mastery" key={c.id}><span>{c.name} · {c.count} 张</span><progress max={100} value={c.mastery} aria-label={`${c.name}掌握度`}/><strong>{c.mastery}%</strong></div>) : <p className="study-muted">尚无课程卡片。</p>}</section>
 <section className="study-panel"><h2>章节掌握度 / 薄弱章节</h2>{stats.weakChapters.length ? stats.weakChapters.map(ch => <div className="study-mastery" key={ch.id}><span>{ch.course} · {ch.name}（{ch.count} 张）</span><progress max={100} value={ch.mastery} aria-label={`${ch.name}掌握度`}/><span>{ch.mastery}% · 遗忘 {ch.forgettingRate}%</span></div>) : <p className="study-muted">尚无章节复习数据。</p>}</section>
 <section className="study-panel"><h2>最近失误卡片</h2>{stats.weakCards.length ? <ul className="study-list">{stats.weakCards.map(c => <li key={c.id}><strong>{c.title}</strong><span>{c.course}{c.chapter ? ` · ${c.chapter}` : ''} · 连续遗忘 {c.consecutiveFailures} 次 · 累计 {c.lapses} 次</span></li>)}</ul> : <p className="study-muted">暂无当前失误卡片，不把已经纠正的历史错误永久列入错题。</p>}</section></div>;
}
