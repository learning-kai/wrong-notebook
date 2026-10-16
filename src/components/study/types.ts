import type { CardDTO, StudySettingsDTO, ReviewDTO } from '@/lib/study-contract';
export type { CardDTO, StudySettingsDTO, ReviewDTO };
export type Chapter = { id: string; name: string; order?: number; _count?: {cards: number} };
export type Course = { id: string; name: string; subjectKey?: string | null; examYear?: number | null; chapters: Chapter[]; _count: {cards:number} };
export type Scope = { courseId: string; chapterId: string; cardType: string; examDate: string };
export const EMPTY_SCOPE: Scope = {courseId:'',chapterId:'',cardType:'',examDate:''};
export type StudyStats = {
  total:number; due:number; reviewsToday:number; accuracy:number; todayAccuracy:number; streak:number; forgettingRate:number;
  courses:{id:string;name:string;count:number;mastery:number}[];
  weakChapters:{id:string;name:string;course:string;count:number;forgettingRate:number;mastery:number}[];
  daily:{date:string;reviews:number;successes:number;forgotten:number}[];
  weakCards:{id:string;title:string;course:string;chapter:string|null;consecutiveFailures:number;lapses:number}[];
  todayNewUsed:number;todayReviewsUsed:number;
};
export type CardDetail = CardDTO & {reviews:ReviewDTO[]};
export type ReviewResult = {card:CardDTO;review:{id:string;clientEventId:string;nextDueAt:string};duplicate:boolean};
export type ImportPreview = {headers:string[];rows:Record<string,unknown>[];errors:{row:number;field?:string;message:string}[];warnings:string[];duplicates:number;validCount:number};
export type BackupPreview = { valid?:boolean;errors:({message:string;row?:number}|string)[];warnings?:string[];counts?:Record<string,number>;[key:string]:unknown };
export function query(values: Record<string,string|number|undefined>): string {
  const params = new URLSearchParams();
  for (const [k,v] of Object.entries(values)) if(v !== '' && v !== undefined) params.set(k,String(v));
  return params.size ? `?${params}` : '';
}
