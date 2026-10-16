// @vitest-environment node
import {it,expect} from 'vitest';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
it('独立 Markdown 渲染原样反斜杠 nu，不重写为换行；公式生成 KaTeX',async()=>{
 const mod=await import('../../components/study/study-markdown').catch(()=>({}));expect(mod).toHaveProperty('StudyMarkdown');
 const {StudyMarkdown}=mod as typeof import('../../components/study/study-markdown');
 const html=renderToStaticMarkup(createElement(StudyMarkdown,{content:'$$\\nu + x$$\n\n原样文字'}));
 expect(html).toContain('katex');expect(html).toContain('ν');expect(html).toContain('原样文字');
});
