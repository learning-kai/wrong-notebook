# 学习卡片导入导出格式

这些格式由 `src/lib/study-transfer.ts` 的纯函数处理。它们是**内容导出**，不是完整备份：内容导出只携带卡片字段；完整备份还应由备份 API 按 `schemaVersion: 1` 携带设置、课程/章节、复习记录，并排除凭据和其他用户数据。

## 规范字段

`TransferCard` 的文本字段原样保存，不会自动 trim、改写 Unicode、LaTeX、换行或 ROC：

- 标识与归属：`id`、`userId`、`courseId`、`chapterId`、`course`、`chapter`
- 基本内容：`title`、`cardType`、`prompt`、`answer`、`explanation`、`conditions`、`pitfalls`、`source`、`notes`
- 知识字段：`formula`、`roc`、`precautions`、`steps`、`initialConditions`、`finalConditions`
- 英语字段：`chinese`、`english`、`letterType`、`paragraphPosition`、`sentenceFunction`、`clozeText`、`comparison`
- 结构字段：`tags: string[]`、`sentences: string[]`、`slots: Record<string,string>`
- 可选排程字段：`dueAt`、`lastReviewedAt`、`intervalDays`、`easeFactor`、`repetitions`、`lapses`、`suspended`、`createdAt`、`updatedAt`

空的必填 `title`、`prompt`、`answer` 会产生行错误；解析器保留该行并继续报告后续行，绝不静默跳过。可疑公式或 cloze 只产生 warning，不会修复原文。

## CSV

导出使用固定规范表头，字段顺序由 `TRANSFER_FIELDS` 定义。字符串按 RFC 4180 规则引用：

- 含逗号、双引号、CR/LF 的单元格用双引号包裹；单元格内的 `"` 写作 `""`。
- 引号中的 CR/LF 属于该单元格，因此多行 Unicode、中文、Markdown、LaTeX 均可往返。
- `tags`、`sentences`、`slots` 在单元格中是 JSON；不要用逗号分隔字符串替代它们。
- 布尔值使用 `true`/`false`，数字使用十进制文本；日期仅按原始字符串保存，不在纯模块中改时区。
- 空的可选文本在 CSV 中表示为空单元格，导入为 `null`；非空字符串（包括只含空格的字符串）不会被 trim。

导入可传 `mapping: Record<canonicalField, inputColumn>`，值优先按**原始表头**匹配，也接受零基列号字符串。`headers` 原样返回。未知列会 warning；映射不到的列会 error。每个数据物理行都会有一个 `TransferCard` 行对象，即使该行有错误，`validCount` 只统计没有行错误的行。

## Markdown

Markdown 同时提供人类可读的问答块和机器可逆的 typed metadata：

````markdown
## Card 1: 示例标题

### Question
题面原文

### Answer
答案原文

<!-- study-card:metadata -->
```json
{
  "title": "示例标题",
  "cardType": "basic",
  "prompt": "题面原文",
  "answer": "答案原文",
  "tags": [],
  "sentences": [],
  "slots": {}
}
```
````

实际输出会在 metadata 前写入 `<!-- study-card:metadata -->`，并使用足够长的反引号 fence，避免卡片正文含有 ``` 时截断或误识别。导入以 marker 后的 fenced JSON 为准，问答块仅供阅读；没有 lossless metadata 的手写 Markdown 会报错而不是猜测字段。

## JSON

内容 JSON 是 `TransferCard[]`，使用 `JSON.stringify(cards, null, 2)` 输出。也接受导入对象 `{ "cards": [...] }`，但导出的内容 JSON 不会冒充 backup JSON。JSON 的字符串、数组、映射以及显式 `null` 按类型校验并原样保留；错误对象占据其输入行并出现在 `errors` 中。

## 预览与提交边界

后端应先调用 `parseStudyImport` 返回 `headers`、`rows`、`errors`、`warnings`、`validCount`，展示映射和全部错误；有错误时不得把“未报错的部分”当作静默成功提交。课程和章节的归属映射由后端在预览确认后完成。导出范围过滤、大小/卡片数上限和数据库事务由 API 层负责，纯模块不访问网络、数据库或认证状态。
