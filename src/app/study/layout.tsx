import type {Metadata,Viewport} from 'next';
import 'katex/dist/katex.min.css';
import './study.css';
export const metadata:Metadata={title:'记忆训练 · 错题本',description:'主动回忆与用户自己的记忆卡片'};
export const viewport:Viewport={width:'device-width',initialScale:1,maximumScale:5,userScalable:true};
export default function StudyLayout({children}:{children:React.ReactNode}){return children;}
