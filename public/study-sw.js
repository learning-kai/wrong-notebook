/* Study-only offline shell. User data lives in study-memory-v1 IndexedDB. */
const CACHE='study-basic-shell-v1';
const SHELL='/study/offline';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='INITIALIZE_STUDY_SHELL')return;
  event.waitUntil((async()=>{
    const response=await fetch(SHELL,{credentials:'same-origin',cache:'reload',redirect:'error'});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Offline shell unavailable');
    const html=await response.clone().text();const cache=await caches.open(CACHE);
    // The shell server renders no user data and has no session fetch. Never cache /study itself.
    await cache.put(SHELL,response);
    const assets=new Set();
    const stylesheets=new Set();
    for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url=new URL(match[1],self.location.origin);
      if(url.origin===self.location.origin&&url.pathname.startsWith('/_next/static/')){
        assets.add(url.href);
        if(/\.css(?:$|\?)/.test(url.pathname))stylesheets.add(url.href);
      }
    }
    // CSS url(font) references are fetched only from same-origin static assets.
    const fonts=new Set();
    for(const asset of assets){
      const res=await fetch(asset,{credentials:'omit'});
      if(!res.ok)continue;
      await cache.put(asset,res.clone());
      if(stylesheets.has(asset))for(const match of (await res.text()).matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/g)){
        const url=new URL(match[1],asset);
        if(url.origin===self.location.origin&&url.pathname.startsWith('/_next/static/'))fonts.add(url.href);
      }
    }
    for(const font of fonts){const res=await fetch(font,{credentials:'omit'});if(res.ok)await cache.put(font,res);}
  })().catch(()=>{}));
});
async function clearStudyIdentity(){
  await new Promise((resolve,reject)=>{
    const open=indexedDB.open('study-memory-v1',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('memory');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('memory','readwrite'),store=tx.objectStore('memory'),request=store.get('study:_runtime:active-user');request.onsuccess=()=>{const id=request.result;if(id)store.delete(`study:${encodeURIComponent(id)}:snapshot`);store.delete('study:_runtime:active-user');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};
  });
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname==='/api/auth/signout'&&event.request.method==='POST'){
    event.respondWith(fetch(event.request).then(async response=>{if(response.ok){await clearStudyIdentity();const clients=await self.clients.matchAll({type:'window'});for(const client of clients)client.postMessage({type:'CLEAR_STUDY_IDENTITY'});}return response;}));return;
  }
  if(event.request.method!=='GET')return;
  // API/auth/session responses are NEVER placed in Cache Storage. All APIs stay authenticated.
  if(url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'&&url.pathname===SHELL){
    event.respondWith(fetch(event.request).catch(async()=>{const cached=await caches.match(SHELL,{cacheName:CACHE});return cached||new Response('Offline shell not initialized. Connect and open /study first.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}));return;
  }
  if(url.pathname.startsWith('/_next/static/'))event.respondWith((async()=>{const cached=await caches.match(url.href,{cacheName:CACHE});return cached||fetch(event.request);})());
});
