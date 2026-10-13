"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Brain, Download, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { apiClient } from '@/lib/api-client';

type Course = { id: string; name: string; subjectKey?: string | null; chapters: { id: string; name: string; order: number; _count?: { cards: number } }[]; _count: { cards: number } };
type CardItem = { id: string; title: string; cardType: string; prompt: string; answer: string; explanation?: string | null; conditions?: string | null; pitfalls?: string | null; tags: string[]; dueAt: string; intervalDays: number; repetitions: number; course: { name: string }; chapter?: { name: string } | null };
type Stats = { total: number; due: number; reviewsToday: number; accuracy: number; weakChapters?: { name: string; course: string; count: number }[]; courses: { id: string; name: string; count: number }[] };

const defaultCourses = ['考研英语一', '高等数学', '线性代数', '概率论与数理统计', '信号与系统'];

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [dueCards, setDueCards] = useState<CardItem[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedChapter, setSelectedChapter] = useState('all');
  const [tab, setTab] = useState<'dashboard' | 'cards' | 'review'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<'due' | 'mistakes'>('due');
  const importRef = useRef<HTMLInputElement>(null);
  const [newCourse, setNewCourse] = useState('');
  const [newChapter, setNewChapter] = useState('');
  const [cardForm, setCardForm] = useState({ title: '', prompt: '', answer: '', explanation: '', conditions: '', pitfalls: '', tags: '', cardType: 'basic' });
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', prompt: '', answer: '', explanation: '', conditions: '', pitfalls: '', tags: '', cardType: 'basic' });

  const activeCourse = courses.find(c => c.id === selectedCourse);
  const filteredChapters = activeCourse?.chapters || [];
  const currentReview = dueCards[reviewIndex];

  async function reload() {
    setLoading(true);
    try {
      const [courseData, statsData] = await Promise.all([
        apiClient.get<Course[]>('/api/study/courses'),
        apiClient.get<Stats>('/api/study/stats'),
      ]);
      setCourses(courseData);
      setStats(statsData);
      const params = selectedCourse === 'all' ? '' : `?courseId=${encodeURIComponent(selectedCourse)}${selectedChapter !== 'all' ? `&chapterId=${encodeURIComponent(selectedChapter)}` : ''}`;
      const [cardData, dueData] = await Promise.all([
        apiClient.get<CardItem[]>(`/api/study/cards${params}`),
        apiClient.get<CardItem[]>(`/api/study/review?limit=50&mode=${reviewMode}${selectedCourse === 'all' ? '' : `&courseId=${encodeURIComponent(selectedCourse)}`}`),
      ]);
      setCards(cardData);
      setDueCards(dueData);
      if (reviewIndex >= dueData.length) setReviewIndex(0);
    } catch (error: any) {
      setMessage(error?.data?.message || '加载记忆系统失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, [selectedCourse, selectedChapter, reviewMode]);

  async function createCourse() {
    if (!newCourse.trim()) return;
    await apiClient.post('/api/study/courses', { name: newCourse.trim() });
    setNewCourse(''); setMessage('课程已创建'); await reload();
  }

  async function createChapter() {
    if (!newChapter.trim() || !activeCourse) return;
    await apiClient.post(`/api/study/courses/${activeCourse.id}/chapters`, { name: newChapter.trim() });
    setNewChapter(''); setMessage('章节已创建'); await reload();
  }

  async function createCard() {
    if (!activeCourse || !cardForm.title.trim() || !cardForm.prompt.trim() || !cardForm.answer.trim()) {
      setMessage('请先选择课程，并填写标题、正面和答案'); return;
    }
    await apiClient.post('/api/study/cards', {
      ...cardForm,
      courseId: activeCourse.id,
      chapterId: selectedChapter === 'all' ? undefined : selectedChapter,
      tags: cardForm.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean),
    });
    setCardForm({ title: '', prompt: '', answer: '', explanation: '', conditions: '', pitfalls: '', tags: '', cardType: 'basic' });
    setMessage('记忆卡已保存'); await reload();
  }

  async function review(rating: 'again' | 'hard' | 'good' | 'easy') {
    if (!currentReview) return;
    await apiClient.post('/api/study/review', { cardId: currentReview.id, rating, mode: 'recall' });
    setRevealed(false);
    if (reviewIndex + 1 < dueCards.length) setReviewIndex(reviewIndex + 1);
    else { setReviewIndex(0); setMessage('本轮待复习卡片完成'); }
    await reload();
  }

  async function importFile(file: File) {
    const text = await file.text();
    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
    if (!activeCourse) { setMessage('请先选择一个课程'); return; }
    const result = await apiClient.post<{ imported: number }>('/api/study/import', { format, data: text, courseId: activeCourse.id });
    setMessage(`已导入 ${result.imported} 张卡片`); await reload();
  }

  function startEdit(card: CardItem) {
    setEditingCardId(card.id);
    setEditForm({ title: card.title, prompt: card.prompt, answer: card.answer, explanation: card.explanation || '', conditions: card.conditions || '', pitfalls: card.pitfalls || '', tags: card.tags.join('，'), cardType: card.cardType });
  }

  async function saveEdit() {
    if (!editingCardId) return;
    await apiClient.patch(`/api/study/cards/${editingCardId}`, { ...editForm, tags: editForm.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean) });
    setEditingCardId(null); setMessage('卡片已更新'); await reload();
  }

  async function deleteCard(id: string) {
    if (!window.confirm('确定删除这张记忆卡吗？历史复习记录也会删除。')) return;
    await apiClient.delete(`/api/study/cards/${id}`);
    setMessage('卡片已删除'); await reload();
  }

  const courseName = useMemo(() => activeCourse?.name || '全部课程', [activeCourse]);

  return (
    <main className="min-h-screen bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/"><Button variant="outline">返回错题本</Button></Link>
          <div className="flex-1"><h1 className="text-2xl font-bold">考研全科记忆训练</h1><p className="text-sm text-muted-foreground">主动回忆、间隔复习、公式与模板统一管理</p></div>
          <Button variant="outline" onClick={reload}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>
        </header>

        {message && <div className="rounded-md border bg-background px-4 py-3 text-sm">{message}</div>}

        <div className="flex flex-wrap gap-2">
          {(['dashboard', 'cards', 'review'] as const).map(item => <Button key={item} variant={tab === item ? 'default' : 'outline'} onClick={() => setTab(item)}>{item === 'dashboard' ? '今日概览' : item === 'cards' ? '卡片管理' : `开始复习${stats?.due ? ` (${stats.due})` : ''}`}</Button>)}
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader><CardTitle className="text-sm">全部卡片</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats?.total ?? '-'}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">待复习</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-orange-600">{stats?.due ?? '-'}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">今日完成</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-green-600">{stats?.reviewsToday ?? '-'}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">近期掌握率</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats?.accuracy ?? 0}%</div></CardContent></Card>
        </section>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit"><CardHeader><CardTitle className="text-base">课程与章节</CardTitle></CardHeader><CardContent className="space-y-3">
            <Select value={selectedCourse} onValueChange={value => { setSelectedCourse(value); setSelectedChapter('all'); }}><SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger><SelectContent><SelectItem value="all">全部课程</SelectItem>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c._count.cards})</SelectItem>)}</SelectContent></Select>
            {activeCourse && <Select value={selectedChapter} onValueChange={setSelectedChapter}><SelectTrigger><SelectValue placeholder="选择章节" /></SelectTrigger><SelectContent><SelectItem value="all">全部章节</SelectItem>{filteredChapters.map(ch => <SelectItem key={ch.id} value={ch.id}>{ch.name} ({ch._count?.cards || 0})</SelectItem>)}</SelectContent></Select>}
            <div className="flex gap-2"><Input value={newCourse} onChange={e => setNewCourse(e.target.value)} placeholder="新课程" /><Button size="icon" onClick={createCourse}><Plus className="h-4 w-4" /></Button></div>
            {activeCourse && <div className="flex gap-2"><Input value={newChapter} onChange={e => setNewChapter(e.target.value)} placeholder="新章节" /><Button size="icon" onClick={createChapter}><Plus className="h-4 w-4" /></Button></div>}
            <div className="space-y-1 pt-2 text-sm text-muted-foreground">{defaultCourses.map(name => <div key={name}>• {name}</div>)}</div>
          </CardContent></Card>

          <div className="space-y-5">
            {tab === 'dashboard' && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" />学习建议</CardTitle></CardHeader><CardContent className="space-y-4"><p>先完成待复习卡片，再新增知识。公式卡建议把“公式主体、适用条件、易错点”分开填写。</p><div className="grid gap-3 sm:grid-cols-2">{stats?.courses.map(c => <div key={c.id} className="rounded-lg border p-3"><div className="font-medium">{c.name}</div><div className="text-sm text-muted-foreground">{c.count} 张卡片</div></div>)}</div><div className="rounded-lg border bg-orange-50/60 p-4"><h3 className="font-semibold text-orange-900">薄弱章节</h3>{stats?.weakChapters?.length ? <div className="mt-2 space-y-1 text-sm">{stats.weakChapters.map((w, i) => <div key={`${w.course}-${w.name}-${i}`} className="flex justify-between gap-3"><span>{w.course} · {w.name}</span><span className="text-muted-foreground">失误权重 {w.count}</span></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">完成几次复习后，这里会显示反复忘记的章节。</p>}</div><Button onClick={() => setTab('review')} disabled={!dueCards.length}>开始今日复习</Button></CardContent></Card>}

            {tab === 'review' && <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2"><Brain className="h-5 w-5" />主动回忆 · {courseName}<span className="ml-auto flex gap-2"><Button size="sm" variant={reviewMode === 'due' ? 'default' : 'outline'} onClick={() => { setReviewMode('due'); setReviewIndex(0); }}>今日待复习</Button><Button size="sm" variant={reviewMode === 'mistakes' ? 'default' : 'outline'} onClick={() => { setReviewMode('mistakes'); setReviewIndex(0); }}>错题重练</Button></span></CardTitle></CardHeader><CardContent>{currentReview ? <div className="space-y-5"><div className="text-sm text-muted-foreground">第 {reviewIndex + 1} / {dueCards.length} 张 · {currentReview.cardType}</div><div className="rounded-xl border bg-background p-5"><h2 className="mb-4 text-xl font-semibold">{currentReview.title}</h2><MarkdownRenderer content={currentReview.prompt} /></div>{revealed && <div className="space-y-3 rounded-xl border bg-muted/20 p-5"><h3 className="font-semibold">答案</h3><MarkdownRenderer content={currentReview.answer} />{currentReview.conditions && <div><h4 className="font-medium">适用条件</h4><MarkdownRenderer content={currentReview.conditions} /></div>}{currentReview.pitfalls && <div><h4 className="font-medium">易错点</h4><MarkdownRenderer content={currentReview.pitfalls} /></div>}</div>}{!revealed ? <Button className="w-full" onClick={() => setRevealed(true)}>显示答案</Button> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Button variant="destructive" onClick={() => review('again')}>忘记了 · 10分钟</Button><Button variant="outline" onClick={() => review('hard')}>困难 · 约1天</Button><Button onClick={() => review('good')}>掌握 · 延长</Button><Button className="bg-green-600 hover:bg-green-700" onClick={() => review('easy')}>熟练 · 更久</Button></div>}</div> : <div className="py-10 text-center text-muted-foreground">当前没有待复习卡片。可以去卡片管理新增，或稍后再来。</div>}</CardContent></Card>}

            {editingCardId && <Card><CardHeader><CardTitle>编辑记忆卡</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /><Select value={editForm.cardType} onValueChange={value => setEditForm({ ...editForm, cardType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basic">基础回忆</SelectItem><SelectItem value="translation">中译英</SelectItem><SelectItem value="formula">公式默写</SelectItem><SelectItem value="condition">条件判断</SelectItem><SelectItem value="compare">易混辨析</SelectItem></SelectContent></Select><Textarea className="sm:col-span-2" value={editForm.prompt} onChange={e => setEditForm({ ...editForm, prompt: e.target.value })} /><Textarea className="sm:col-span-2" value={editForm.answer} onChange={e => setEditForm({ ...editForm, answer: e.target.value })} /><Textarea value={editForm.explanation} onChange={e => setEditForm({ ...editForm, explanation: e.target.value })} placeholder="解释" /><Textarea value={editForm.conditions} onChange={e => setEditForm({ ...editForm, conditions: e.target.value })} placeholder="条件 / 收敛域" /><Textarea value={editForm.pitfalls} onChange={e => setEditForm({ ...editForm, pitfalls: e.target.value })} placeholder="易错点" /><Input value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} placeholder="标签" /><div className="flex gap-2 sm:col-span-2"><Button onClick={saveEdit}>保存修改</Button><Button variant="outline" onClick={() => setEditingCardId(null)}>取消</Button></div></CardContent></Card>}

            {tab === 'cards' && <><Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />新增记忆卡 · {courseName}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Input placeholder="标题，例如：时域卷积定理" value={cardForm.title} onChange={e => setCardForm({ ...cardForm, title: e.target.value })} /><Select value={cardForm.cardType} onValueChange={value => setCardForm({ ...cardForm, cardType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basic">基础回忆</SelectItem><SelectItem value="translation">中译英</SelectItem><SelectItem value="formula">公式默写</SelectItem><SelectItem value="condition">条件判断</SelectItem><SelectItem value="compare">易混辨析</SelectItem></SelectContent></Select><Textarea className="sm:col-span-2" placeholder="正面：回忆问题 / 中文提示 / 公式名称" value={cardForm.prompt} onChange={e => setCardForm({ ...cardForm, prompt: e.target.value })} /><Textarea className="sm:col-span-2" placeholder="答案：支持 Markdown 和 LaTeX，例如 $$X(jω)=...$$" value={cardForm.answer} onChange={e => setCardForm({ ...cardForm, answer: e.target.value })} /><Textarea placeholder="详细解释（可选）" value={cardForm.explanation} onChange={e => setCardForm({ ...cardForm, explanation: e.target.value })} /><Textarea placeholder="适用条件 / 收敛域（可选）" value={cardForm.conditions} onChange={e => setCardForm({ ...cardForm, conditions: e.target.value })} /><Textarea placeholder="易错点（可选）" value={cardForm.pitfalls} onChange={e => setCardForm({ ...cardForm, pitfalls: e.target.value })} /><Input placeholder="标签，用逗号分隔" value={cardForm.tags} onChange={e => setCardForm({ ...cardForm, tags: e.target.value })} /><div className="flex flex-wrap gap-2 sm:col-span-2"><Button onClick={createCard}><Plus className="mr-2 h-4 w-4" />保存卡片</Button><Button variant="outline" onClick={() => window.open(`/api/study/export?courseId=${selectedCourse === 'all' ? '' : selectedCourse}`, '_blank')}><Download className="mr-2 h-4 w-4" />导出 JSON</Button><Button variant="outline" onClick={() => importRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />导入 JSON/CSV</Button><input ref={importRef} type="file" accept=".json,.csv" className="hidden" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} /></div></CardContent></Card><Card><CardHeader><CardTitle>卡片列表（{cards.length}）</CardTitle></CardHeader><CardContent className="space-y-3">{loading ? <p>加载中…</p> : cards.map(card => <div key={card.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{card.title}</h3><div className="text-xs text-muted-foreground">{card.course.name}{card.chapter ? ` · ${card.chapter.name}` : ''} · {card.cardType}</div></div><span className="text-xs text-muted-foreground">{card.repetitions} 次复习</span></div><div className="mt-3"><MarkdownRenderer content={card.prompt} /></div><details className="mt-2"><summary className="cursor-pointer text-sm text-primary">查看答案</summary><div className="mt-2 rounded bg-muted/30 p-3"><MarkdownRenderer content={card.answer} /></div></details><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => startEdit(card)}>编辑</Button><Button variant="ghost" size="sm" onClick={() => deleteCard(card.id)}><Trash2 className="mr-1 h-4 w-4" />删除</Button></div></div>)}{!loading && !cards.length && <p className="py-8 text-center text-muted-foreground">还没有卡片，先创建一张吧。</p>}</CardContent></Card></>}
          </div>
        </div>
      </div>
    </main>
  );
}
