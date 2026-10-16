import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDY_COURSES, STUDY_EXAMPLES } from '@/lib/study-samples';

describe('study sample catalog', () => {
  it('labels conditional probability accurately instead of calling its definition Bayes theorem', () => {
    const example = STUDY_EXAMPLES.find(card => card.id === 'sample-probability-conditional-definition');
    expect(example?.title).toBe('示例：条件概率定义');
  });

  it('names every requested starter topic explicitly without claiming an authoritative formula bank', () => {
    const english = DEFAULT_STUDY_COURSES.find(course => course.subjectKey === 'postgraduate-english');
    expect(english?.name).toBe('考研英语一作文');
    const topics = DEFAULT_STUDY_COURSES.flatMap(course => course.chapters.map(chapter => chapter.name)).join('\n');
    for (const topic of ['重积分', '曲线', '曲面积分', '秩', '相似', '惯性', '抽样', '参数估计', '假设检验', '协方差', '卷积', '系统函数', '频率响应', '微分方程', '差分方程']) expect(topics).toContain(topic);
    // English tree is composition-only: letter types and per-paragraph positions,
    // with no reading/completion/translation chapters.
    for (const topic of ['信件类型', '第一段', '第二段', '第三段', '描述图画', '阐释原因', '总结建议', '连接词']) expect(topics).toContain(topic);
    expect(topics).not.toContain('阅读理解');
    expect(topics).not.toContain('完形填空');
  });
  it('provides five requested course trees with non-empty chapters', () => {
    expect(DEFAULT_STUDY_COURSES).toHaveLength(5);
    expect(DEFAULT_STUDY_COURSES.every(course => course.chapters.length > 0)).toBe(true);
    const text = JSON.stringify(DEFAULT_STUDY_COURSES);
    expect(text).toContain('拉普拉斯');
    expect(text).toContain('ROC');
    expect(text).toContain('第一段');
    expect(text).toContain('信件类型');
  });

  it('has at least one explicitly labelled example and source URL for every course', () => {
    const courseKeys = new Set(DEFAULT_STUDY_COURSES.map(course => course.subjectKey));
    const examplesByCourse = new Map<string, number>();
    for (const example of STUDY_EXAMPLES) {
      expect(example.id).toMatch(/^sample-/);
      expect(example.notes ?? '').toContain('示例');
      expect(example.source ?? '').toMatch(/^https?:\/\//);
      expect(example.title).toContain('示例');
      expect(example.tags.length).toBeGreaterThan(0);
      examplesByCourse.set(example.course ?? '', (examplesByCourse.get(example.course ?? '') ?? 0) + 1);
    }
    for (const key of courseKeys) expect(examplesByCourse.get(key)).toBeGreaterThanOrEqual(1);
  });

  it('records bilateral/unilateral signal convention and ROC caveat rather than promising equivalence', () => {
    const signal = STUDY_EXAMPLES.find(example => example.course === 'signals-systems');
    expect(signal?.roc).toContain('双边');
    expect(signal?.precautions).toContain('ROC');
    expect(signal?.notes).toContain('示例');
  });
});
