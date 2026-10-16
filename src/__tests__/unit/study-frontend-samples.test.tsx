import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('示例只有明确勾选后才导入，不自动种入权威公式库',async()=>{
 const {SamplePanel}=await import('../../components/study/samples');expect(SamplePanel).toBeTypeOf('function');const writes:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({imported:1,skipped:0}),{status:200});}return new Response(JSON.stringify({courses:[],examples:[{id:'example',title:'示例 · 知识',prompt:'问题',answer:'答案',source:'https://example.com'}]}),{status:200});}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<SamplePanel onImported={async()=>{}}/>));expect(writes).toEqual([]);const button=host.querySelector('[data-testid="study-sample-import"]') as HTMLButtonElement;expect(button.disabled).toBe(true);await act(async()=>{(host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});await act(async()=>button.click());expect(writes[0]).toEqual({sampleIds:['example']});
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
