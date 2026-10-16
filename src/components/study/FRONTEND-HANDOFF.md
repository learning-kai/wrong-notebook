# 前端验收交接（非已执行的端到端报告）

## 已实现的入口

- `/study`：概览、课程 / 章节 CRUD、卡片结构化编辑 / 搜索 / 标签 / 暂停过滤 / 复制 / 手动到期 / 历史、独立复习队列与训练任务、导入导出、真实统计、设置、完整备份预览 / 增量恢复。
- `/study/offline`：首次在线初始化后使用专用缓存壳；当前用户 IndexedDB、基础文本回忆、自评、持久化事件 outbox；重新联网先确认原用户 ID，再使用同一 clientEventId 同步。
- study 独立 Markdown renderer 不修改原文，`\\nu` 通过 KaTeX；全局旧 renderer 没有修改。

## 浏览器交互配方（由父 agent 在临时数据库验收）

1. 用程序创建临时测试用户并建立登录会话；不要访问用户真实密码或生产库。GET `/api/study/settings` 的 `userId` 必须与夹具 ID 一致。
2. 打开 `/study`，点击 `study-tab-courses`。填写 `course-name`，点击 `course-create`。在 `course-select` 选新增课程；填写可访问标签「新章节名称」，点击「新建章节」，再用 `chapter-select` 选章节。
3. 点击 `study-tab-cards`、`card-new`。填写 `card-title` / `card-prompt` / `card-answer` / `card-formula` / `card-roc`，建议原文 `$$\\nu + x$$` 和包含多行的答案。所有结构化输入采用 `card-<字段名>`，如 `card-sentences` JSON 字符串数组、`card-slots` JSON 字典。点击 `card-save`；回读 API 验证字段原样保存。使用 `card-copy-<id>`、`card-suspend-<id>`、`card-history-<id>` 验证复制、暂停、历史。
4. 点击 `study-tab-training`，`study-queue-mode` 选 `all`，`study-task-mode` 选 `recall`。在 `study-answer-input` 作答，`study-review-reveal` 显示左右对照，`study-review-submit-good` 自评。至少连续评分 3 张，检查没有跳过中间卡、下一张输入和揭示已清空。拦截慢 POST 并双击，验证同一 clientEventId 只有一次调度。四个评分选择器为 `study-review-submit-again|hard|good|easy`。
5. 切换 formula / roc / steps / cloze / sentence-order / sentence-compose / template-match；前提不足时必须显示原因并禁用揭示。模板匹配的真实元数据配对有 `study-match-choice`；排序使用可访问按钮「句子 N 上移 / 下移」，组句使用选择顺序。
6. 点击 `study-tab-import`。用 `study-import-data` 粘贴 JSON / CSV / Markdown，点击 `study-import-preview`。CSV mapping 为 `study-mapping-<canonicalField>`。勾选 `study-import-confirm` 后 `study-import-commit` 才能启用；修改原文或映射后必须重新预览。验证错误行阻止提交、三种格式下载完整字段。
7. `study-tab-backup`：备份下载独立于内容导出；`backup-data` / `backup-preview` / `backup-confirm` / `backup-restore`。恢复响应当前后端为 `{imported,skipped,reviews}`，UI 支持该格式。
8. `study-tab-stats` 检查真实每日曲线 / 周汇总、空态、课程和章节掌握度；`study-tab-settings` 检查 `settings-daily-new` / `settings-save` 及主题、考试日期、时区。
9. 已登录在线打开 `/study` 完成卡片分页缓存，等待 SW `INITIALIZE_STUDY_SHELL` 缓存 `study-basic-shell-v1`。打开 `/study/offline`，浏览器断网后重新加载（不只是保持旧页面）。离线答题 / 揭示 / 自评，关闭再重开，检查 outbox 保留且已评分卡不重复出现在本地队列。恢复联网后检查原 clientEventId 被精确一次提交。`study-connectivity` 和 `study-sync` 为连接状态 / 同步控件。
10. 另开账号 B 或使原会话 401：旧账号卡片隐藏、同步暂停，原账号 outbox 保留；不得把 A 事件发送到 B。删除有待同步事件的卡，恢复网络后必须出现冲突且原事件不能消失。

## 需要父 agent 特别验收

- 没有运行 Next build、安装、部署、commit 或 push。
- 本机 Playwright 缺少 Chromium；browser-use 返回 `Resource temporarily unavailable`，所以真实浏览器 / IndexedDB / SW 离线重新导航尚未验证。纯逻辑与 React DOM 单测已经执行。
- 根 middleware 会认证包括 `/study-sw.js` 与 `/study/offline` 的路径；在线初始化依赖有效会话。SW 只对专用无用户数据壳做离线 fallback，不绕过 API 验证。请验收脚本响应 MIME、在线缓存壳、登出时 SW 清显示缓存；如需 middleware 豁免，只允许无数据静态脚本 / 无数据壳，不豁免任何 API。
- SW 根 scope 是为了监听全站成功 signout 后清理显示缓存；缓存规则仍只允许专用壳和其 `_next/static` 资产，不缓存认证或 API 响应。
- 离线基础壳原样显示 LaTeX 文本而非 KaTeX；完整训练页使用 KaTeX。离线时不伪造服务器调度 / 统计。
- 全仓 tsc 在 384 MB 堆上 OOM；已改用 frontend-only tsconfig 在低堆下成功类型检查。父 agent 仍需 CI 全仓类型 / 构建与集成验收。

## 检查命令

```sh
node node_modules/vitest/vitest.mjs run src/__tests__/unit/study-frontend*.test.* --maxWorkers=1
node node_modules/eslint/bin/eslint.js src/components/study src/app/study src/lib/study-offline.ts public/study-sw.js
node --max-old-space-size=320 node_modules/typescript/bin/tsc -p /home/admin/.hermes/cache/scratch/study-frontend-tsconfig.json
```

RED / GREEN 日志存储在 `/home/admin/.hermes/cache/scratch/study-frontend-*.log`；本文件不声称端到端浏览器验收已通过。
