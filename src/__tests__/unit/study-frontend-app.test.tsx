import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('精简为复习/卡片/统计/设置四个标签，复习页为默认主页；空统计不伪造样本',async()=>{
 const {StudyApp}=await import('../../components/study/study-app');expect(StudyApp).toBeTypeOf('function');
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);let value:unknown=[];
 if(url.includes('/settings'))value={userId:'fixture',dailyNewLimit:20,dailyReviewLimit:100,theme:'system',timezone:'Asia/Shanghai'};
 if(url.includes('/stats'))value={total:0,due:0,reviewsToday:0,accuracy:0,todayAccuracy:0,streak:0,forgettingRate:0,courses:[],weakChapters:[],daily:[],weakCards:[],todayNewUsed:0,todayReviewsUsed:0};
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const local=new Map<string,unknown>();
 const {OfflineStudy}=await import('../../lib/study-offline');
 const store=new OfflineStudy({get:async k=>local.get(k),put:async(k,v)=>{local.set(k,v);},remove:async k=>{local.delete(k);}});
 try{await act(async()=>root.render(<StudyApp offlineStore={store}/>));
 for(const tab of ['review','cards','stats','settings'])expect(host.querySelector(`[data-testid="study-tab-${tab}"]`)).not.toBeNull();
 // Old 9-tab sprawl is gone.
 for(const gone of ['training','mistakes','import','backup','courses','overview'])expect(host.querySelector(`[data-testid="study-tab-${gone}"]`)).toBeNull();
 // Review is the default screen with a course scope selector.
 expect(host.querySelector('[data-testid="course-select"]')).not.toBeNull();
 expect(host.querySelector('[data-testid="study-queue-due"]')).not.toBeNull();
 await act(async()=>{(host.querySelector('[data-testid="study-tab-stats"]') as HTMLButtonElement).click();});
 expect(host.textContent).toContain('暂无复习记录');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
