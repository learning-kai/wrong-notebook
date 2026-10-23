import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 回归测试：AI 分析失败的三个真实根因
 *
 * 1. 推理型模型把 max_tokens 花在 reasoning_content 上，content 为空 →
 *    旧逻辑抛 "Empty response from AI"，用户只看到「AI 分析失败，请重试」。
 *    现在必须归为 AI_RESPONSE_TRUNCATED 并给出可操作提示。
 * 2. 中转站 Cloudflare 524 / 429 是瞬时故障 → 必须自动重试，而不是直接失败。
 * 3. 524 不能被当成普通未知错误 → 必须归为 AI_UPSTREAM_TIMEOUT。
 */

const createCalls: Array<Record<string, unknown>> = [];
let createImpl: (params: unknown) => Promise<unknown> = async () => ({});

vi.mock('openai', () => {
    class FakeOpenAI {
        chat = {
            completions: {
                create: (params: unknown) => {
                    createCalls.push(params as Record<string, unknown>);
                    return createImpl(params);
                },
            },
        };
    }
    return { default: FakeOpenAI };
});

vi.mock('../../lib/config', () => ({
    getAppConfig: () => ({
        aiProvider: 'openai',
        openai: { instances: [], activeInstanceId: '' },
        prompts: {},
        timeouts: { analyze: 300000 },
    }),
}));

vi.mock('../../lib/tag-service', () => ({
    getMathTagsFromDB: async () => [],
    getTagsFromDB: async () => [],
}));

vi.mock('../../lib/logger', () => ({
    createLogger: () => ({
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
        box: () => {},
    }),
}));

vi.mock('../../lib/ai/prompts', () => ({
    generateAnalyzePrompt: () => 'system prompt',
    generateSimilarQuestionPrompt: () => 'similar prompt',
    generateGeogebraPrompt: () => 'geogebra prompt',
}));

vi.mock('../../lib/ai/schema', () => ({
    safeParseParsedQuestion: (v: unknown) => ({ success: true, data: v }),
}));

vi.mock('../../lib/mistake-status', () => ({
    normalizeMistakeStatusForSave: (v: unknown) => v,
}));

async function loadProvider() {
    const mod = await import('../../lib/ai/openai-provider');
    return mod.OpenAIProvider;
}

function okResponse(content: string) {
    return { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] };
}

function reasoningOnlyResponse() {
    return {
        choices: [
            {
                message: { role: 'assistant', content: '', reasoning_content: '长长的思考过程'.repeat(50) },
                finish_reason: 'length',
            },
        ],
    };
}

function httpError(status: number) {
    const err = new Error(`${status} status code (no body)`) as Error & { status: number };
    err.status = status;
    return err;
}

const validAnswer =
    '<subject>\n信号与系统\n</subject>\n' +
    '<knowledge_points>\nZ变换\n</knowledge_points>\n' +
    '<requires_image>\nfalse\n</requires_image>\n' +
    '<question_text>\n求 H(z)\n</question_text>\n' +
    '<answer_text>\nH(z)=1\n</answer_text>\n' +
    '<analysis>\n解析\n</analysis>';

const baseConfig = {
    apiKey: 'sk-test-key-1234567890',
    baseUrl: 'https://relay.example.com/v1',
    model: 'some-reasoning-model',
};

describe('OpenAIProvider 分析失败容错', () => {
    beforeEach(() => {
        createCalls.length = 0;
    });

    it('推理模型正文为空时报 AI_RESPONSE_TRUNCATED，而不是含糊的失败', async () => {
        const OpenAIProvider = await loadProvider();
        createImpl = async () => reasoningOnlyResponse();
        const provider = new OpenAIProvider(baseConfig);

        await expect(provider.analyzeImage('base64data', 'image/jpeg', 'zh')).rejects.toThrow(
            'AI_RESPONSE_TRUNCATED'
        );
    });

    it('中转站 524 会自动重试，重试成功则正常返回', { timeout: 20000 }, async () => {
        const OpenAIProvider = await loadProvider();
        let call = 0;
        createImpl = async () => {
            call += 1;
            if (call === 1) throw httpError(524);
            return okResponse(validAnswer);
        };
        const provider = new OpenAIProvider(baseConfig);

        const result = await provider.analyzeImage('base64data', 'image/jpeg', 'zh');

        expect(result).toBeTruthy();
        expect(call).toBe(2);
        expect(createCalls.length).toBe(2);
    });

    it('429 限流也会重试', { timeout: 20000 }, async () => {
        const OpenAIProvider = await loadProvider();
        let call = 0;
        createImpl = async () => {
            call += 1;
            if (call === 1) throw httpError(429);
            return okResponse(validAnswer);
        };
        const provider = new OpenAIProvider(baseConfig);

        await expect(provider.analyzeImage('base64data', 'image/jpeg', 'zh')).resolves.toBeTruthy();
        expect(call).toBe(2);
    });

    it('重试耗尽后 524 归为 AI_UPSTREAM_TIMEOUT', { timeout: 20000 }, async () => {
        const OpenAIProvider = await loadProvider();
        createImpl = async () => {
            throw httpError(524);
        };
        const provider = new OpenAIProvider(baseConfig);

        await expect(provider.analyzeImage('base64data', 'image/jpeg', 'zh')).rejects.toThrow(
            'AI_UPSTREAM_TIMEOUT'
        );
        // 初次 + 2 次重试 = 3 次
        expect(createCalls.length).toBe(3);
    });

    it('认证错误不重试，避免无意义放大请求', async () => {
        const OpenAIProvider = await loadProvider();
        createImpl = async () => {
            throw httpError(401);
        };
        const provider = new OpenAIProvider(baseConfig);

        await expect(provider.analyzeImage('base64data', 'image/jpeg', 'zh')).rejects.toThrow(
            'AI_AUTH_ERROR'
        );
        expect(createCalls.length).toBe(1);
    });

    it('请求使用 16384 max_tokens，给推理模型的正文留足空间', async () => {
        const OpenAIProvider = await loadProvider();
        createImpl = async () => okResponse(validAnswer);
        const provider = new OpenAIProvider(baseConfig);

        await provider.analyzeImage('base64data', 'image/jpeg', 'zh');

        expect(createCalls[0]?.max_tokens).toBe(16384);
    });
});
