import { describe, it, expect, vi } from 'vitest';
import { ParsedQuestionSchema } from '../../lib/ai/schema';

/**
 * 考研核心考点速记（exam_summary）
 *
 * 需求：AI 输出在 <answer_text> 之后、<analysis> 之前增加 <exam_summary>，
 * 用于「结论优先」地给出本题最值得记忆的核心结论。
 *
 * 关键约束：examSummary 必须可缺省。历史错题、非考研科目、或模型漏输出时，
 * 不能让整条解析失败（旧行为对缺失的必填字段会抛错）。
 */

describe('exam_summary 解析', () => {
    const base = {
        questionText: '求 H(z)',
        answerText: 'H(z)=1',
        analysis: '解析过程',
        subject: '信号与系统',
        knowledgePoints: ['Z变换'],
    };

    it('包含 examSummary 时正常通过校验', () => {
        const result = ParsedQuestionSchema.safeParse({
            ...base,
            examSummary: '考研速记：因果系统收敛域在极点之外。',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.examSummary).toBe('考研速记：因果系统收敛域在极点之外。');
        }
    });

    it('缺少 examSummary 时不报错，默认为空字符串', () => {
        const result = ParsedQuestionSchema.safeParse(base);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.examSummary).toBe('');
        }
    });

    it('旧数据里 examSummary 为 null 也不报错', () => {
        const result = ParsedQuestionSchema.safeParse({ ...base, examSummary: null });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.examSummary).toBe('');
        }
    });

    it('examSummary 不会挤占 answerText / analysis 的必填约束', () => {
        const missingAnswer = ParsedQuestionSchema.safeParse({
            ...base,
            answerText: '',
            examSummary: '考研速记：xxx',
        });
        expect(missingAnswer.success).toBe(false);
    });
});

describe('exam_summary 在提示词中的位置', () => {
    it('默认分析模板在 answer_text 之后、analysis 之前要求 exam_summary', async () => {
        const { DEFAULT_ANALYZE_TEMPLATE } = await import('../../lib/ai/prompts');
        const text = DEFAULT_ANALYZE_TEMPLATE;

        const answerEnd = text.indexOf('</answer_text>');
        const summaryStart = text.indexOf('<exam_summary>');
        const analysisStart = text.indexOf('<analysis>');

        expect(answerEnd).toBeGreaterThan(-1);
        expect(summaryStart).toBeGreaterThan(-1);
        expect(analysisStart).toBeGreaterThan(-1);

        // 顺序必须是 answer_text -> exam_summary -> analysis
        expect(summaryStart).toBeGreaterThan(answerEnd);
        expect(summaryStart).toBeLessThan(analysisStart);
    });

    it('提示词包含结论优先与禁止空泛总结的约束', async () => {
        const { DEFAULT_ANALYZE_TEMPLATE } = await import('../../lib/ai/prompts');
        const text = DEFAULT_ANALYZE_TEMPLATE;

        expect(text).toContain('结论优先');
        expect(text).toContain('禁止空泛总结');
        expect(text).toContain('禁止机械套用');
        expect(text).toContain('考研速记');
    });
});
