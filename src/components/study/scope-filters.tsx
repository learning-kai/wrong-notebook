import type {Course,Scope} from './types';
export function ScopeFilters({courses,scope,onChange,disabled=false}:{courses:Course[];scope:Scope;onChange:(s:Scope)=>void;disabled?:boolean}) {
 const course=courses.find(c=>c.id===scope.courseId);
 return <section className="study-filter-grid study-panel" aria-label="学习范围">
  <label>课程<select data-testid="course-select" value={scope.courseId} disabled={disabled} onChange={e=>onChange({...scope,courseId:e.target.value,chapterId:''})}><option value="">全部课程</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}（{c._count.cards} 张）</option>)}</select></label>
  <label>章节<select data-testid="chapter-select" value={scope.chapterId} disabled={disabled||!course} onChange={e=>onChange({...scope,chapterId:e.target.value})}><option value="">全部章节</option>{course?.chapters.map(ch=><option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label>
  <label>卡片类型<input list="study-scope-types" value={scope.cardType} disabled={disabled} placeholder="全部类型" onChange={e=>onChange({...scope,cardType:e.target.value})}/><datalist id="study-scope-types">{['basic','translation','formula','cloze','condition','compare'].map(t=><option key={t} value={t}/>)}</datalist></label>
  <label>考试日期<input type="date" value={scope.examDate} disabled={disabled} onChange={e=>onChange({...scope,examDate:e.target.value})}/></label>
 </section>;
}
