// @vitest-environment node
import { describe, it, expect } from 'vitest';

describe('稳定复习会话', () => {
  it('评分只移除当前卡，保留其余队列且不使用收缩队列索引', async () => {
    const mod = await import('../../components/study/session').catch(() => ({}));
    expect(mod).toHaveProperty('startSession');
    const { startSession, completeCard } = mod as typeof import('../../components/study/session');
    const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const initial = startSession(cards);
    expect(completeCard(initial, 'a').queue.map(c => c.id)).toEqual(['b', 'c']);
    expect(completeCard(completeCard(initial, 'a'), 'b').queue.map(c => c.id)).toEqual(['c']);
    expect(completeCard(completeCard(initial, 'a'), 'a').completed).toBe(1);
  });
});
