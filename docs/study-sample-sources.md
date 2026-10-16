# 示例卡片来源与边界

`STUDY_EXAMPLES` 是小型、手工核对的**示例**集合，不是权威公式库，也不自动灌入用户课程。每张卡的 `title` 与 `notes` 都明确写有“示例”。`source` 用于回到公开材料核对定义、公式或术语；英文卡的具体句子是原创构造时会明确标注，不冒充来源原句。

## 五门默认课程

| subjectKey | 示例主题 | 核对材料 | 卡片边界 |
|---|---|---|---|
| `calculus` | 指数函数求导：`d(e^x)/dx=e^x` | [MIT 18.01SC：Log and Exponent Derivatives](https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/resources/log-and-exponent-derivatives/) | 只作一个基础公式示例，不代表完整高数公式表。 |
| `linear-algebra` | 方阵可逆与 `det(A)≠0` | [MIT ES.1803 Topic 15：Transpose, Inverse, Determinant](https://ocw.mit.edu/courses/es-1803-differential-equations-spring-2024/mites_1803_s24_topic15.pdf) | 记录条件与等价关系；不替用户自动计算或证明具体矩阵。 |
| `probability` | 条件概率定义 `P(A\|B)=P(A∩B)/P(B)` | [MIT 6.041SC Unit I：Probability Models and Discrete Random Variables](https://ocw.mit.edu/courses/6-041sc-probabilistic-systems-analysis-and-applied-probability-fall-2013/pages/unit-i/) | 材料列出条件概率与 Bayes 规则；示例只选定义式，不宣称覆盖概率论。 |
| `signals-systems` | `e^{-t}u(t)` 的双边 Laplace 变换与 ROC | [MIT 6.003 Lecture 6：Laplace transform](https://ocw.mit.edu/courses/6-003-signals-and-systems-fall-2011/84b35cc755ccd722ddbdbba00fd41e8f_MIT6_003F11_lec06.pdf) | 见下方的双边/单边和 ROC 约定说明。 |
| `postgraduate-english` | 主句/从句与原创翻译例句 | [Cambridge English Grammar Today：Clauses](https://dictionary.cambridge.org/us/grammar/british-grammar/clauses) | Cambridge 用于核对 clause、main/dependent clause 术语；句子与译文是本项目原创示例，不是摘录。 |

上述链接在实现时通过网页检索与页面/PDF 文本提取核对：MIT 页面分别出现指数函数求导、可逆矩阵与行列式、条件概率/Bayes、双边 Laplace 定义及 ROC；Cambridge 页面说明 clause 是基本语法单位并区分主句和从句。

## 信号与系统：约定必须随卡保存

- MIT 6.003 Lecture 6 区分 **unilateral** Laplace `∫_0^∞` 与 **bilateral** Laplace `∫_{-∞}^{∞}`。本仓库信号示例的 `roc` 明确标注采用双边定义。
- 对 `x(t)=e^{-t}u(t)`，材料给出 `X(s)=1/(s+1)` 且 `Re(s)>-1`；右边/左边信号可能共享相同代数表达式但 ROC 不同，因此不能丢掉 ROC。
- ROC 不包含极点，并与时域支撑有关；同一个有理式不单独决定信号。导入导出绝不改写 `roc`。
- 初值定理要求因果/无冲激等前提；终值定理要求有限终值及相应稳定性条件。`initialConditions`、`finalConditions` 和 `precautions` 分开保存，训练模块只展示用户提供的文字，不自动做数学等价性判断。

## 英语示例边界

`zh-en`/`en-zh` 是方向性自评任务。原文、译文、`letterType`、段落位置和句子功能都保持用户输入。`comparison` 仅作对照提示，不把一种合理译法判为唯一正确，也不调用 AI 或“自动正确率”推断。
