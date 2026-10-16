import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined; let host: HTMLDivElement;
afterEach(async () => { if(root) await act(async () => root?.unmount()); host?.remove(); root=undefined; });
it('结构化编辑表单展示所有字段、保留 LaTeX 与多行文本并提交 JSON 数组/字典', async () => {
  const mod = await import('../../components/study/card-editor').catch(() => ({}));
  expect(mod).toHaveProperty('CardEditor');
  const {CardEditor} = mod as typeof import('../../components/study/card-editor');
  let saved: unknown;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'c',name:'信号',chapters:[],_count:{cards:0}}]} courseId="c" onSave={async body => {saved=body;}} onCancel={() => {}} />));
  for (const field of ['title','prompt','answer','formula','roc','conditions','precautions','steps','initialConditions','finalConditions','chinese','english','letterType','paragraphPosition','sentenceFunction','sentences','slots','comparison','source']) expect(host.querySelector(`[data-testid="card-${field}"]`)).not.toBeNull();
  function input(field:string,value:string) { const node=host.querySelector(`[data-testid="card-${field}"]`) as HTMLInputElement; const proto=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true})); }
  await act(async () => {input('title','卷积');input('prompt','问题');input('answer','  $$\\nu$$\n答案 ');input('sentences','["句一","句二\\n换行"]');input('slots','{"keyword":"主题"}');});
  await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(saved).toMatchObject({courseId:'c',answer:'  $$\\nu$$\n答案 ',sentences:['句一','句二\n换行'],slots:{keyword:'主题'}});
});
