/** Shared study-stage helpers for profile, tagging, and AI context. */

export const POSTGRADUATE_STAGE = 'postgraduate_exam' as const;

export function isPostgraduateExamStage(stage?: string | null): boolean {
    return stage === POSTGRADUATE_STAGE;
}

/** Return the canonical subject label used in AI prompts for a postgraduate notebook. */
export function normalizePostgraduateSubjectName(subjectName?: string | null): string | null {
    if (!subjectName?.trim()) return null;
    const name = subjectName.trim();
    const lower = name.toLowerCase();

    if (/(高数|高等数学|数学一|数学二|数学三|考研数学)/.test(name)) return '高数';
    if (/(线代|线性代数)/.test(name)) return '线代';
    if (/(概率论|数理统计|概率与数理统计)/.test(name)) return '概率论';
    if (/(信号与系统|信号系统)/.test(name)) return '信号与系统';
    if (/(考研政治|政治理论)/.test(name)) return '政治';
    if (/(考研英语|英语一|英语二)/.test(name)) return name.includes('英语二') ? '英语二' : '英语一';

    // Keep an explicitly named postgraduate professional course instead of
    // collapsing it into a generic K12 subject.
    if (lower.includes('考研') || /(电路|模电|数电|通信原理|数据结构|自动控制|专业课|408)/.test(name)) {
        return name;
    }
    return null;
}

export function isPostgraduateSubjectName(subjectName?: string | null): boolean {
    return normalizePostgraduateSubjectName(subjectName) !== null;
}
