// @vitest-environment node
import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
it('专用离线壳由 service worker 缓存，绝不缓存认证/API 或已认证 study HTML',()=>{
 const file=new URL('../../../public/study-sw.js',import.meta.url);
 let source='';try{source=readFileSync(file,'utf8');}catch{}
 expect(source).toContain('INITIALIZE_STUDY_SHELL');expect(source).toContain('/study/offline');expect(source).toContain('study-memory-v1');expect(source).not.toContain('cache.put(event.request');
});
it('service worker 能在全站登出成功后清除当前显示缓存，但不删除 outbox',()=>{
 const source=readFileSync(new URL('../../../public/study-sw.js',import.meta.url),'utf8');
 expect(source).toContain('/api/auth/signout');expect(source).toContain('CLEAR_STUDY_IDENTITY');expect(source).toContain("delete(`study:${encodeURIComponent(id)}:snapshot`)");expect(source).not.toContain("delete(`study:${encodeURIComponent(id)}:outbox`)");
});
it('初始化离线壳还会预缓存 CSS 引用的字体等静态资源',()=>{
 const source=readFileSync(new URL('../../../public/study-sw.js',import.meta.url),'utf8');
 expect(source).toContain('stylesheet');expect(source).toContain('font');expect(source).toContain('url(');expect(source).toContain('/_next/static/');
});
