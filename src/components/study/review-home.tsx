"use client";
import type { CardDTO, Course, Scope, StudyStats } from './types';
import type { QueueMode } from './use-study-workspace';
import { ReviewView } from './review';
import type { ReviewEvent } from '@/lib/study-offline';

const QUEUES: [QueueMode, string][] = [['due', '今日到期'], ['mistakes', '错题'], ['all', '全部']];

/** The single primary screen: today's summary, one queue choice, then review. */
export function ReviewHome({ stats, courses, scope, onScope, queueMode, onQueueMode, cards, loading, onSubmit, onRestart }: {
    stats: StudyStats | null;
    courses: Course[];
    scope: Scope;
    onScope: (scope: Scope) => void;
    queueMode: QueueMode;
    onQueueMode: (mode: QueueMode) => void;
    cards: CardDTO[];
    loading: boolean;
    onSubmit: (event: ReviewEvent) => Promise<unknown>;
    onRestart: () => void;
}) {
    const course = courses.find(c => c.id === scope.courseId);
    return <div className="study-stack">
        <section className="study-today" aria-label="今日学习">
            <div><strong>{stats?.due ?? 0}</strong><span>待复习</span></div>
            <div><strong>{stats?.reviewsToday ?? 0}</strong><span>今日完成</span></div>
            <div><strong>{stats?.streak ?? 0}</strong><span>连续天数</span></div>
        </section>
        <div className="study-toolbar">
            <div className="study-chips" role="group" aria-label="复习范围">
                {QUEUES.map(([id, label]) => <button key={id} type="button" data-testid={`study-queue-${id}`} aria-pressed={queueMode === id} onClick={() => onQueueMode(id)}>{label}</button>)}
            </div>
            <label className="study-inline">课程
                <select data-testid="course-select" value={scope.courseId} onChange={e => onScope({ ...scope, courseId: e.target.value, chapterId: '' })}>
                    <option value="">全部课程</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </label>
            {course && <label className="study-inline">章节
                <select data-testid="chapter-select" value={scope.chapterId} onChange={e => onScope({ ...scope, chapterId: e.target.value })}>
                    <option value="">全部章节</option>
                    {course.chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
            </label>}
            <button type="button" className="study-ghost" disabled={loading} onClick={onRestart}>刷新队列</button>
        </div>
        {loading ? <section className="study-panel" role="status">正在载入复习队列…</section> : <ReviewView cards={cards} onSubmit={onSubmit}/>}
    </div>;
}
