import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {OfflineStudy} from '../../lib/study-offline';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('离线独立壳读取当前用户缓存、独立回答与自评持久化，重启排除已评分卡',async()=>{
 const {OfflineBasic}=await import('../../components/study/offline-basic');expect(OfflineBasic).toBeTypeOf('function');
 const data=new Map<string,unknown>();const store=new OfflineStudy({get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},remove:async k=>{data.delete(k);}});
 await store.activate('alice');await store.cache('alice',{cards:[{id:'a',title:'记忆卡',prompt:'$$\\nu$$\\n\\n请回忆',answer:'$$x^2$$\\n\\n秘密答案',dueAt:'2026-10-13',course:{name:'数学'},userId:'alice',suspended:false}],courses:[],settings:{userId:'alice'}});
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<OfflineBasic offlineStore={store}/>));expect(host.textContent).toContain('记忆卡');expect(host.textContent).not.toContain('秘密答案');
 await act(async()=>{(host.querySelector('[data-testid="study-review-reveal"]') as HTMLButtonElement).click();});expect(host.textContent).toContain('秘密答案');expect(host.querySelector('.katex')).not.toBeNull();await act(async()=>{(host.querySelector('[data-testid="study-review-submit-good"]') as HTMLButtonElement).click();});expect(await store.outbox('alice')).toHaveLength(1);expect(host.textContent).toContain('本轮完成');
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();}
});
it('离线壳联网后发现 401 必须撤销当前账号标记且隐藏旧卡，不展示存储错误掩盖认证问题',async()=>{
 const {OfflineBasic}=await import('../../components/study/offline-basic');const data=new Map<string,unknown>();const store=new OfflineStudy({get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},remove:async k=>{data.delete(k);}});
 await store.activate('alice');await store.cache('alice',{cards:[],courses:[],settings:{userId:'alice'}});
 vi.spyOn(navigator,'onLine','get').mockReturnValue(true);vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({message:'未登录'}),{status:401}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);try{await act(async()=>root.render(<OfflineBasic offlineStore={store}/>));expect(await store.activeUser()).toBeNull();expect(host.textContent).toContain('登录失效');}finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();}
});
