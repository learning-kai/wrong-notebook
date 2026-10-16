export class StudyApiError extends Error { constructor(public status:number,message:string,public data:unknown){super(message);} }
export async function studyRequest<T=unknown>(path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(`/api/study${path.startsWith('/')?path:`/${path}`}`,{credentials:'same-origin',...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
 const data=await response.json().catch(()=>null);if(!response.ok)throw new StudyApiError(response.status,(data as {message?:string})?.message||`请求失败（${response.status}）`,data);return data as T;
}
