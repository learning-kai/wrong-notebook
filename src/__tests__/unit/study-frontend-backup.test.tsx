import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('完整备份独立于内容导出，增量恢复需要无错误预览与明确确认',async()=>{
 const {BackupPanel}=await import('../../components/study/backup');expect(BackupPanel).toBeTypeOf('function');const calls:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body||'{}'));calls.push(body);return new Response(JSON.stringify({valid:true,errors:[],counts:{cards:1,reviews:2}}),{status:200});}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<BackupPanel onRestored={async()=>{}}/>));expect(host.querySelector('a')?.getAttribute('href')).toBe('/api/study/backup');
 const input=host.querySelector('[data-testid="backup-data"]') as HTMLTextAreaElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set?.call(input,'{"schemaVersion":1}');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect((host.querySelector('[data-testid="backup-restore"]') as HTMLButtonElement).disabled).toBe(true);await act(async()=>{(host.querySelector('[data-testid="backup-preview"]') as HTMLButtonElement).click();});expect(calls[0]).toMatchObject({action:'preview'});
 await act(async()=>{(host.querySelector('[data-testid="backup-confirm"]') as HTMLInputElement).click();});expect((host.querySelector('[data-testid="backup-restore"]') as HTMLButtonElement).disabled).toBe(false);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
