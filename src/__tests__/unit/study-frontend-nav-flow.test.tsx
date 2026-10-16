import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
// Reproduces the E2E step: cards tab -> 课程与章节 -> fill name -> click 新建课程 -> POST /api/study/courses
it('精简导航下仍能从卡片→课程与章节创建课程并发出 POST',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push(`${init?.method||'GET'} ${new URL(url,'http://x').pathname}`);
  let value:unknown=[];
  if(url.includes('/settings'))value={userId:'fixture',dailyNewLimit:20,dailyReviewLimit:100,theme:'system',timezone:'Asia/Shanghai'};
  if(url.includes('/stats'))value={total:0,due:0,reviewsToday:0,accuracy:0,todayAccuracy:0,streak:0,forgettingRate:0,courses:[],weakChapters:[],daily:[],weakCards:[],todayNewUsed:0,todayReviewsUsed:0};
  if(url.endsWith('/courses')&&init?.method==='POST')value={id:'c1',name:'UI signal course',chapters:[],_count:{cards:0}};
  return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const local=new Map<string,unknown>();
 const {OfflineStudy}=await import('../../lib/study-offline');
 const store=new OfflineStudy({get:async k=>local.get(k),put:async(k,v)=>{local.set(k,v);},remove:async k=>{local.delete(k);}});
 const {StudyApp}=await import('../../components/study/study-app');
 try{await act(async()=>root.render(<StudyApp offlineStore={store}/>));
  // go to cards tab
  await act(async()=>{(host.querySelector('[data-testid="study-tab-cards"]') as HTMLButtonElement).click();});
  // open the 课程与章节 sub-view
  const courseTab=[...host.querySelectorAll('button')].find(b=>b.textContent==='课程与章节') as HTMLButtonElement;
  expect(courseTab,'课程与章节 sub-tab must exist').toBeTruthy();
  await act(async()=>courseTab.click());
  const name=host.querySelector('[data-testid="course-name"]') as HTMLInputElement;
  expect(name,'course-name input must be visible in 课程与章节').not.toBeNull();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(name,'UI signal course');name.dispatchEvent(new Event('input',{bubbles:true}));});
  const btn=host.querySelector('[data-testid="course-create"]') as HTMLButtonElement;
  expect(btn.disabled,'create button should enable once name filled').toBe(false);
  await act(async()=>{btn.click();});
  await act(async()=>{await new Promise(r=>setTimeout(r,20));});
  expect(calls,'a POST /api/study/courses must be issued').toContain('POST /api/study/courses');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
