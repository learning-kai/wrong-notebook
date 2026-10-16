// @vitest-environment node
import {it,expect,vi} from 'vitest';
it('study API 只使用同源会话；非 200 暴露服务器错误与 401',async()=>{
 const mod=await import('../../components/study/api').catch(()=>({}));expect(mod).toHaveProperty('studyRequest');
 const {studyRequest}=mod as typeof import('../../components/study/api');
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify({message:'请重新登录'}),{status:401}));vi.stubGlobal('fetch',fetcher);
 try{await expect(studyRequest('/settings')).rejects.toMatchObject({status:401,message:'请重新登录'});expect(fetcher.mock.calls[0]?.[0]).toBe('/api/study/settings');}finally{vi.unstubAllGlobals();}
});
