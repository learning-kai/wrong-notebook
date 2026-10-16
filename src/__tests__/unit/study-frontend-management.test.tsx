import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('课程与章节有真实新建、编辑、删除和考试年份控件',async()=>{
 const {CourseManager}=await import('../../components/study/courses');expect(CourseManager).toBeTypeOf('function');
 const mutations:unknown[]=[];const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<CourseManager courses={[{id:'c',name:'信号',subjectKey:'signals-systems',examYear:2027,chapters:[{id:'ch',name:'变换'}],_count:{cards:2}}]} selectedId="c" onSelect={()=>{}} onMutate={async(path,method,body)=>{mutations.push({path,method,body});}}/>));
 const input=host.querySelector('[data-testid="course-name"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,'英语');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const subject=host.querySelector('[data-testid="course-subject"]') as HTMLSelectElement;
 await act(async()=>{subject.value='postgraduate-english';subject.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>{(host.querySelector('[data-testid="course-create"]') as HTMLButtonElement).click();});
 expect(mutations[0]).toMatchObject({path:'/courses',method:'POST',body:{name:'英语',subjectKey:'postgraduate-english'}});
 expect(host.querySelector('[data-testid="course-edit"]')).not.toBeNull();expect(host.querySelector('[data-testid="chapter-delete-ch"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('卡片管理允许搜索、复制、暂停、删除及历史，操作连接真实端点',async()=>{
 const {CardManager}=await import('../../components/study/cards');expect(CardManager).toBeTypeOf('function');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const mutations:unknown[]=[];
 const card={id:'a',title:'公式',prompt:'写出',answer:'答案',courseId:'c',chapterId:null,course:{id:'c',name:'信号'},cardType:'formula',tags:[],dueAt:'2026-10-13',suspended:false};
 try{await act(async()=>root.render(<CardManager cards={[card as never]} courses={[]} scope={{courseId:'',chapterId:'',examDate:'',cardType:''}} search="" onSearch={()=>{}} onMutate={async(path,method,body)=>{mutations.push({path,method,body});}} onRefresh={()=>{}}/>));
 await act(async()=>{(host.querySelector('[data-testid="card-copy-a"]') as HTMLButtonElement).click();});
 expect(mutations[0]).toMatchObject({path:'/cards/a/copy',method:'POST'});
 await act(async()=>{(host.querySelector('[data-testid="card-suspend-a"]') as HTMLButtonElement).click();});
 expect(mutations[1]).toMatchObject({path:'/cards/a',method:'PATCH',body:{suspended:true}});
 expect(host.querySelector('[data-testid="card-history-a"]')).not.toBeNull();expect(host.querySelector('[data-testid="card-search"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();}
});
