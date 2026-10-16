import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined; let host: HTMLDivElement;
afterEach(async () => { if(root) await act(async () => root?.unmount()); host?.remove(); root=undefined; });

function input(field:string,value:string) { const node=host.querySelector(`[data-testid="card-${field}"]`) as HTMLInputElement; const proto=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true})); }
const openMore = async () => { await act(async () => {(host.querySelector('[data-testid="card-more-toggle"]') as HTMLButtonElement).click();}); };

it('英语作文卡默认只显示核心字段，其余折叠在更多选项', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'en',name:'考研英语一',subjectKey:'postgraduate-english',chapters:[],_count:{cards:0}}]} courseId="en" onSave={async () => {}} onCancel={() => {}} />));
  for (const field of ['chinese','english','letterType','paragraphPosition']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).not.toBeNull();
  // Secondary fields stay hidden until 更多选项 — a new card needs only two inputs.
  for (const field of ['title','prompt','answer','explanation','source','notes']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).toBeNull();
  for (const field of ['formula','roc']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).toBeNull();
  expect(host.querySelector('[data-testid="card-more-toggle"]')).not.toBeNull();
});

it('填写中文/英文即可保存，题面与答案自动镜像，无需手写 JSON', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  let saved: Record<string, unknown> | undefined;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'en',name:'考研英语一',subjectKey:'postgraduate-english',chapters:[],_count:{cards:0}}]} courseId="en" onSave={async body => {saved=body as unknown as Record<string,unknown>;}} onCancel={() => {}} />));
  await act(async () => {input('chinese','我写信就图书馆服务提建议。');input('english','I am writing to offer my suggestions on library services.');});
  await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(saved).toMatchObject({
    courseId:'en',
    prompt:'我写信就图书馆服务提建议。',
    answer:'I am writing to offer my suggestions on library services.',
    sentences:[], slots:{},
  });
});

it('更多选项里的句子与槽位用纯文本行，标签用顿号分隔', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  let saved: Record<string, unknown> | undefined;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'en',name:'英语',subjectKey:'postgraduate-english',chapters:[],_count:{cards:0}}]} courseId="en" onSave={async body => {saved=body as unknown as Record<string,unknown>;}} onCancel={() => {}} />));
  await openMore();
  await act(async () => {input('chinese','中文');input('english','English');input('sentences','First line\nSecond line');input('slots','keyword: signal\nrole: student');input('tags','作文、小作文、模板');});
  await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(saved).toMatchObject({sentences:['First line','Second line'],slots:{keyword:'signal',role:'student'},tags:['作文','小作文','模板']});
});

it('数学卡核心字段是题面/公式/条件，不出现书信类型', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor courses={[{id:'m',name:'高等数学',subjectKey:'calculus',chapters:[],_count:{cards:0}}]} courseId="m" onSave={async () => {}} onCancel={() => {}} />));
  for (const field of ['prompt','formula','conditions']) expect(host.querySelector(`[data-testid="card-${field}"]`), field).not.toBeNull();
  expect(host.querySelector('[data-testid="card-letterType"]')).toBeNull();
});

it('切换科目后仍保留并显示原有额外字段，不静默丢数据', async () => {
  const {CardEditor} = await import('../../components/study/card-editor');
  let saved: Record<string, unknown> | undefined;
  const existing = { id:'x', courseId:'en', chapterId:null, title:'已存', prompt:'题', answer:'答', formula:'$$\\nu$$', cardType:'formula', course:{id:'en',name:'考研英语一',subjectKey:'postgraduate-english'}, chapter:null, tags:[], sentences:[], slots:{}, suspended:false, dueAt:'2026-10-13T00:00:00Z' } as unknown as import('../../lib/study-contract').CardDTO;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<CardEditor card={existing} courses={[{id:'en',name:'考研英语一',subjectKey:'postgraduate-english',chapters:[],_count:{cards:0}}]} courseId="en" onSave={async body => {saved=body as unknown as Record<string,unknown>;}} onCancel={() => {}} />));
  await openMore();
  expect(host.querySelector('[data-testid="card-formula"]'), 'stored off-profile field must stay visible').not.toBeNull();
  await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(saved).toMatchObject({ courseId:'en', formula:'$$\\nu$$' });
});
