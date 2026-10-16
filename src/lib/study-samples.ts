import type { TransferCard } from './study-transfer';

export interface StudyChapterDefinition {
  name: string;
  description?: string;
}

export interface StudyCourseDefinition {
  name: string;
  subjectKey: string;
  chapters: StudyChapterDefinition[];
}

/** Starter trees only; they are not a claim of complete exam coverage. */
export const DEFAULT_STUDY_COURSES: StudyCourseDefinition[] = [
  {
    name: '高等数学',
    subjectKey: 'calculus',
    chapters: [
      { name: '函数、极限与连续' },
      { name: '导数与微分' },
      { name: '一元函数积分学' },
      { name: '多元函数微积分' },
      { name: '重积分' },
      { name: '曲线与曲面积分' },
      { name: '无穷级数' },
      { name: '常微分方程' },
    ],
  },
  {
    name: '线性代数',
    subjectKey: 'linear-algebra',
    chapters: [
      { name: '行列式' },
      { name: '矩阵及其运算与秩' },
      { name: '向量与线性方程组' },
      { name: '特征值与特征向量' },
      { name: '相似矩阵' },
      { name: '二次型与正负惯性指数' },
    ],
  },
  {
    name: '概率论与数理统计',
    subjectKey: 'probability',
    chapters: [
      { name: '随机事件与概率' },
      { name: '随机变量及其分布' },
      { name: '多维随机变量' },
      { name: '期望、方差与协方差' },
      { name: '大数定律与中心极限定理' },
      { name: '抽样分布与自由度' },
      { name: '参数估计' },
      { name: '假设检验' },
    ],
  },
  {
    name: '信号与系统',
    subjectKey: 'signals-systems',
    chapters: [
      { name: '连续时间信号与 LTI 系统' },
      { name: '离散时间信号与系统' },
      { name: '卷积' },
      { name: '傅里叶级数与傅里叶变换' },
      { name: '拉普拉斯变换与 ROC' },
      { name: 'Z 变换与离散时间系统' },
      { name: '采样与频域分析' },
      { name: '系统函数与频率响应' },
      { name: '微分方程与差分方程求解' },
    ],
  },
  {
    name: '考研英语一',
    subjectKey: 'postgraduate-english',
    chapters: [
      { name: '词汇、搭配与翻译' },
      { name: '长难句与从句' },
      { name: '段落位置与句子功能' },
      { name: '小作文信件类型' },
      { name: '第一段：开篇与写信目的' },
      { name: '第二段：主体展开' },
      { name: '第三段：结尾与期待' },
      { name: '完形填空与逻辑连接' },
      { name: '阅读理解与主旨' },
      { name: '应用文与大作文' },
    ],
  },
];

const common = (card: Omit<TransferCard, 'tags' | 'sentences' | 'slots'> & Partial<Pick<TransferCard, 'tags' | 'sentences' | 'slots'>>): TransferCard => ({
  ...card,
  tags: card.tags ?? ['示例'],
  sentences: card.sentences ?? [],
  slots: card.slots ?? {},
});

/**
 * Small, hand-reviewed examples. `source` supports the explanation; it does
 * not mean the constructed card text is copied from that source.
 */
export const STUDY_EXAMPLES: TransferCard[] = [
  common({
    id: 'sample-calculus-exponential-derivative',
    course: 'calculus',
    chapter: '导数与微分',
    title: '示例：指数函数求导',
    cardType: 'formula',
    prompt: '写出 e^x 的导数。',
    answer: '\\frac{d}{dx}e^x=e^x',
    formula: '\\frac{d}{dx}e^x=e^x',
    explanation: 'MIT 18.01SC 的讲解明确使用 d(e^x)/dx=e^x；本卡只保留该基础公式。',
    source: 'https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/resources/log-and-exponent-derivatives/',
    notes: '示例；公式由公开课程材料核对，不是完整公式库。',
  }),
  common({
    id: 'sample-linear-algebra-invertible',
    course: 'linear-algebra',
    chapter: '行列式',
    title: '示例：矩阵可逆条件',
    cardType: 'condition',
    prompt: '什么时候 n×n 矩阵 A 可逆？',
    answer: 'det(A)\\ne 0。',
    formula: 'A^{-1}\\text{ 存在} \\Longleftrightarrow \\det(A)\\ne 0',
    conditions: 'A 为方阵。',
    explanation: 'MIT 讲义列出 A 有逆与 det(A)≠0 的等价关系；本卡不替用户自动判断具体矩阵。',
    source: 'https://ocw.mit.edu/courses/es-1803-differential-equations-spring-2024/mites_1803_s24_topic15.pdf',
    notes: '示例；等价条件用于自评，不承诺自动证明。',
  }),
  common({
    id: 'sample-probability-conditional-definition',
    course: 'probability',
    chapter: '随机事件与概率',
    title: '示例：条件概率定义',
    cardType: 'formula',
    prompt: '写出条件概率 P(A|B) 的定义（P(B)>0）。',
    answer: 'P(A|B)=P(A∩B)/P(B)',
    formula: 'P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)},\\quad P(B)>0',
    conditions: 'P(B)>0。',
    explanation: 'MIT 6.041SC Unit I 将条件概率与 Bayes 规则列为基础主题；这里使用定义式作为示例。',
    source: 'https://ocw.mit.edu/courses/6-041sc-probabilistic-systems-analysis-and-applied-probability-fall-2013/pages/unit-i/',
    notes: '示例；不要把单个定义式当作完整概率知识库。',
  }),
  common({
    id: 'sample-signals-laplace-roc',
    course: 'signals-systems',
    chapter: '拉普拉斯变换与 ROC',
    title: '示例：右边指数的双边拉普拉斯变换与 ROC',
    cardType: 'transform',
    prompt: 'x(t)=e^{-t}u(t)，求其双边拉普拉斯变换并写 ROC。',
    answer: 'X(s)=1/(s+1)，ROC: Re(s)>-1',
    formula: 'X(s)=\\frac{1}{s+1}',
    roc: 'Re(s)>-1；此处是双边 Laplace 定义，且 x(t) 为右边信号。',
    precautions: '双边定义从 -∞ 到 ∞；单边定义从 0 到 ∞，不能把两种约定的 ROC/初值条件混写。ROC 不含极点；同一代数表达式配不同 ROC 可对应不同时域信号。',
    initialConditions: '若满足无冲激等条件，x(0^+)=lim_{s→∞}sX(s)。',
    finalConditions: '终值定理还需满足稳定/有限终值等前提，不能只套 lim_{s→0}sX(s)。',
    explanation: 'MIT 6.003 Lecture 6 同时给出双边/单边定义、右边信号例子与 Re(s)>-1，并说明 ROC 与时域支撑相关。',
    source: 'https://ocw.mit.edu/courses/6-003-signals-and-systems-fall-2011/84b35cc755ccd722ddbdbba00fd41e8f_MIT6_003F11_lec06.pdf',
    notes: '示例；变换结果按该页约定核对。ROC/初值/终值都必须先核对适用条件。',
    tags: ['示例', 'Laplace', 'ROC'],
  }),
  common({
    id: 'sample-english-clause',
    course: 'postgraduate-english',
    chapter: '长难句与从句',
    title: '示例：主句与从句识别',
    cardType: 'translation',
    prompt: '识别句子中的主句与从句，并完成翻译。',
    answer: '主句：The result is useful；从句：because it is reproducible；译文：该结果很有用，因为它可复现。',
    chinese: '该结果很有用，因为它可复现。',
    english: 'The result is useful because it is reproducible.',
    letterType: '原创示例',
    paragraphPosition: '句内',
    sentenceFunction: '因果说明',
    explanation: 'Cambridge English Grammar Today 说明 clause 是基本语法单位，并区分 main/dependent clauses；英文句子与译文是本项目原创构造。',
    source: 'https://dictionary.cambridge.org/us/grammar/british-grammar/clauses',
    notes: '示例；英文句子为原创构造，不是 Cambridge 原句；来源仅用于核对术语与从句分类。',
    tags: ['示例', 'English', 'clause'],
    sentences: ['The result is useful', 'because it is reproducible'],
  }),
];
