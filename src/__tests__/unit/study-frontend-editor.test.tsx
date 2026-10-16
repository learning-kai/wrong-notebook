import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined; let host: HTMLDivElement;
afterEach(async () => { if(root) await act(async () => root?.unmount()); host?.remove(); root=undefined; });

function input(field:string,value:string) { const node=host.querySelector(`[data-testid="card-${field}"]`) as HTMLInputElement; const proto=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true})); }

it('英语科目只显示英语相关字段，不出现公式与收敛域', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'en',name:'考研英语一',subjectKey:'postgraduate-english',chapters:[],_count:{cards:0}}]} courseId="en" onSave={async () => {}} onCancel={() => {}} />));
  for (const field of ['title','prompt','answer','chinese','english','letterType','paragraphPosition','sentenceFunction','sentences','slots']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).not.toBeNull();
  for (const field of ['formula','roc','initialConditions','finalConditions','precautions']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).toBeNull();
  expect(host.textContent).toContain('考研英语一');
  expect((host.querySelector('[data-testid="card-type"]') as HTMLSelectElement).value).toBe('translation');
});

it('数学科目显示公式/条件/步骤，不出现书信类型与段落位置', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'m',name:'高等数学',subjectKey:'calculus',chapters:[],_count:{cards:0}}]} courseId="m" onSave={async () => {}} onCancel={() => {}} />));
  for (const field of ['title','prompt','answer','formula','conditions','steps','comparison','clozeText']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).not.toBeNull();
  for (const field of ['letterType','paragraphPosition','sentenceFunction','roc','initialConditions']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).toBeNull();
});

it('信号科目显示收敛域与初值终值条件', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'s',name:'信号与系统',subjectKey:'signals-systems',chapters:[],_count:{cards:0}}]} courseId="s" onSave={async () => {}} onCancel={() => {}} />));
  for (const field of ['formula','roc','initialConditions','finalConditions','conditions','steps']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).not.toBeNull();
  expect(host.querySelector('[data-testid="card-letterType"]')).toBeNull();
});

it('切换科目后仍可显示并保存原有额外字段，不静默丢数据', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  let saved: Record<string, unknown> | undefined;
  const existing = { id:'x', courseId:'en', chapterId:null, title:'已存', prompt:'题', answer:'答', formula:'$$\\nu$$', cardType:'formula', course:{id:'en',name:'考研英语一',subjectKey:'postgraduate-english'}, chapter:null, tags:[], sentences:[], slots:{}, suspended:false, dueAt:'2026-10-13T00:00:00Z' } as unknown as import('../../lib/study-contract').CardDTO;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor card={existing} courses={[{id:'en',name:'考研英语一',subjectKey:'postgraduate-english',chapters:[],_count:{cards:0}}]} courseId="en" onSave={async body => {saved=body as unknown as Record<string,unknown>;}} onCancel={() => {}} />));
  // formula is not an English field, but the stored value must be visible and preserved.
  expect(host.querySelector('[data-testid="card-formula"]')).not.toBeNull();
  expect(host.textContent).toContain('显示全部字段');
  await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(saved).toMatchObject({ courseId:'en', formula:'$$\\nu$$' });
});

it('结构化编辑表单保留 LaTeX 与多行文本并提交 JSON 数组/字典', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  let saved: unknown;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'s',name:'信号与系统',subjectKey:'signals-systems',chapters:[],_count:{cards:0}}]} courseId="s" onSave={async body => {saved=body;}} onCancel={() => {}} />));
  await act(async () => {input('title','卷积');input('prompt','问题');input('answer','  $$\\nu$$\n答案 ');input('sentences','["句一","句二\\n换行"]');input('slots','{"keyword":"主题"}');});
  await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(saved).toMatchObject({courseId:'s',answer:'  $$\\nu$$\n答案 ',sentences:['句一','句二\n换行'],slots:{keyword:'主题'}});
});
