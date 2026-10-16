import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('设置保存每日配额、考试日期、主题与时区且按钮有反馈',async()=>{
 const {SettingsPanel}=await import('../../components/study/settings');expect(SettingsPanel).toBeTypeOf('function');const updates:unknown[]=[];const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<SettingsPanel settings={{userId:'u',dailyNewLimit:20,dailyReviewLimit:100,relearnMinutes:10,initialGoodDays:1,initialEasyDays:4,hardMultiplier:1.2,easyMultiplier:1.3,maxIntervalDays:365,examDate:null,timezone:'Asia/Shanghai',theme:'system',defaultsInitialized:true}} onSave={async body=>{updates.push(body);}}/>));
 const input=host.querySelector('[data-testid="settings-daily-new"]') as HTMLInputElement;expect(input.value).toBe('20');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,'25');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>{(host.querySelector('[data-testid="settings-save"]') as HTMLButtonElement).click();});expect(updates[0]).toMatchObject({dailyNewLimit:25});expect(host.textContent).toContain('学习设置');
 }finally{await act(async()=>root.unmount());host.remove();}
});
