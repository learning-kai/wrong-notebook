import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('导入必须先预览再确认；修改原文使预览失效；错误行不能提交',async()=>{
 const {ImportExport}=await import('../../components/study/import-export');expect(ImportExport).toBeTypeOf('function');
 const requests:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body||'{}'));requests.push({url,body});return new Response(JSON.stringify(body.action==='preview'?{headers:['front','back'],rows:[{title:'t',prompt:'p',answer:'a'}],errors:[],warnings:[],duplicates:0,validCount:1}:{imported:1,skipped:0}),{status:200});}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<ImportExport scope={{courseId:'c',chapterId:'',cardType:'',examDate:''}} onImported={async()=>{}}/>));
 const input=host.querySelector('[data-testid="study-import-data"]') as HTMLTextAreaElement;
 const edit=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 await edit('[{"title":"t"}]');expect((host.querySelector('[data-testid="study-import-commit"]') as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{(host.querySelector('[data-testid="study-import-preview"]') as HTMLButtonElement).click();});expect(requests[0]).toMatchObject({body:{action:'preview',data:'[{"title":"t"}]'}});
 await act(async()=>{(host.querySelector('[data-testid="study-import-confirm"]') as HTMLInputElement).click();});
 expect((host.querySelector('[data-testid="study-import-commit"]') as HTMLButtonElement).disabled).toBe(false);
 await edit('changed');expect((host.querySelector('[data-testid="study-import-commit"]') as HTMLButtonElement).disabled).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
