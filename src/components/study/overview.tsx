import type {Course,StudyStats} from './types';
import {Statistics} from './statistics';
export function Overview({stats,courses,onStart}:{stats:StudyStats|null;courses:Course[];onStart:()=>void}) {
 return <div className="study-stack">
  <section className="study-panel"><div className="study-section-head"><div><p className="study-eyebrow">今日学习</p><h2>先回忆，再对照</h2><p className="study-muted">先完成到期队列，再新增知识。公式、条件、步骤和写作模板分开保存；所有评分由你确认。</p></div><button className="study-primary" onClick={onStart}>进入训练</button></div></section>
  <Statistics stats={stats} overview/>
  <section className="study-panel"><h2>课程概况</h2>{courses.length?<div className="study-course-grid">{courses.map(c=><article key={c.id}><strong>{c.name}</strong><p className="study-muted">{c._count.cards} 张卡片 · {c.chapters.length} 个章节{c.examYear?` · ${c.examYear}`:''}</p></article>)}</div>:<div className="study-empty">暂无课程。去「课程」创建你的第一个学习范围。</div>}</section>
 </div>;
}
