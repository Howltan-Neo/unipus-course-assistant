# UMOOCs 已观察结构与适配方法

这是课程 8021 在 2026-10-09 至 2026-10-10 的观察，属于适配线索。其他课程、开课轮次或平台更新需要现场核对。

- 目录入口 `/my/course/<courseId>`；任务项 `li[id^="task_id_"]`，链接 `a.title`。视频类型曾由 `.right-menu i.es-icon-videoclass` 标识；状态位于 `.left-menu`。`es-icon-undone-check` 和 `es-icon-doing` 表示未完成，`es-icon-done-check` 等为完成。不能将某个绿色 class 在未知页面直接视为完成。
- 任务页 `/course/<courseId>/task/<taskId>/show`，外层 `#task-content-iframe`，内容页 `activity_show`。实际视频在外层帧的 `#lesson-video-content iframe` 内，来源 `https://service-cdn.qiqiuyun.net/js-sdk/video-player/.../player.html`。
- 不要由任务 ID 的数字规律猜测新课程类型。8021 采用 45 个核对后的固定视频 ID；资产脚本不适用于其他课程。
- 考试说明页的“开始考试”链接曾为 `/lesson/<lessonId>/testpaper/<paperId>/do`。链接可能打开新标签。浏览器控制器需追踪新增页面，或从已观察 href 在同一标签导航一次；避免产生两份活动答题标签。
- 开始后曾重定向至 `/testpaper/<attemptId>/show`，提交结果为 `/testpaper/result/<attemptId>/show`。普通作业可能使用 `/homework/...`。`attemptId` 是账号的本次尝试实例，不能迁移到其他账号。
- 题目行 `.testpaper-question[id^="question"]`；题干 `.testpaper-question-stem`；文本字段 `input[data-type="fill"]`；判断题 `input[data-type="determine"]`，实测值 `1` 对应“正确”、`0` 对应“错误”。新试卷仍应读取标签和值验证。
- 材料通常位于小题行之外，不能只抽取小题题干。本次期末说明“36题”展开为45个作答项。多空作业可能使用同名多个字段，须保留字段顺序及数量。
- 交卷按钮曾为 `#finishPaper`，确认按钮 `#testpaper-finish-btn`。每次提交前读取实际按钮、对话框与页面身份，不能对整个课程循环盲点确认。

## DOM 助手的用法

`scripts/assessment-dom.js` 的内容是一个浏览器可执行函数 `(request) => result`，没有 Node 模块、网络调用或提交行为。仅在宿主允许脚本及 DOM 访问时使用，例如 Playwright：

```js
const helper = fs.readFileSync(skillPath + '/scripts/assessment-dom.js', 'utf8');
const snapshot = await frame.evaluate(`(${helper})(${JSON.stringify({action:'snapshot'})})`);
// 模型根据 snapshot 解题后，构造 plan，保留 snapshot 中的 schema。
const plan = {
  url: snapshot.url, title: snapshot.title, schema: snapshot.schema,
  answers: { question123: { kind:'text', values:['answer'] } }
};
const filled = await frame.evaluate(`(${helper})(${JSON.stringify({action:'fill', plan})})`);
const checked = await frame.evaluate(`(${helper})(${JSON.stringify({action:'verify', plan})})`);
```

单选/判断题使用 `{kind:'choice', values:['实际选项值']}`；多选使用多个值。`plan` 必须覆盖当前完整试卷。更改题目/字段结构会在填入前拒绝操作。结构验证成功不代表题意答案正确，`readyToSubmit` 也不代表平台已收到提交。

需要外部材料时，将已核对的 CSS selector 作为 `materialSelector` 传入 snapshot；返回值默认限 12000 字符并报告截断。不传 selector 时，助手不猜测材料位置，需另外读取。其他页面可传 `rowSelector`、`stemSelector`、`fieldSelector`；它们必须来自实际检查。
