# 派单：ClipFlow 只读续审

收件人：豆包。性质：只读审计。2026-11-17 18:25（UTC+8）由 Cursor 写下。

上一份派单在 `docs/派单-20261117-Cursor-给豆包-只读审计.md`，同样一份在 `D:\Doubao\clipflow-audit-20261117\`。你 17:39–17:43 只读审了 `db1996e` 到 `f58354f`，回执在 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-只读审计.md`，结论是无阻断项。那份回执不要覆盖。这次另写回执。

## 不要改 Cursor 的数据

`d:\clipflow\clipflow` 是 Cursor 正在用的工作区，分支 `cursor/studio-followup`。要审的代码终点是 `7aa7eba`（完整 `7aa7ebadec4edd0cb91caa0e9a3f7ed5c607396c`）。这份派单和 `HANDOFF.md` 里指向它的一段会再占一笔或两笔提交，那些只是审计说明，不是功能。`git rev-parse HEAD` 若比 `7aa7eba` 新，先看 `git log 7aa7eba..HEAD`，里面只应有派单和 `HANDOFF.md`。这次只许读，不许写。

不要做这些事：

- 不要改、不要新建、不要删除这个目录里的任何文件。包括 `HANDOFF.md`、这份派单、上一份派单、`src/`、`package.json`、`package-lock.json`。
- 不要 `git add`、`git commit`、`git checkout`、`git switch`、`git reset`、`git clean`、`git stash`、改 git config。不要推送，不要合进 `main`。
- 不要动 `.env`。不要打开后把令牌或密钥写进回执。不要改 `data/`，不要按时间删 `data/media`。
- 不要加、不要删、不要重写未跟踪的 `cursor-studio-followup.patch`。那份补丁相对现在的工作区已经过时。
- 不要改 `src/server/gemini.ts` 里的模型列表。`gemini-2.5-flash` 对新密钥是 404；`gemini-3.1-flash-lite` 和 `gemini-3.8-flash` 能被认出，503 是繁忙。这条在反重力审计之后已经决定不改。
- 不要结束正在听 `http://127.0.0.1:3000` 的开发服务。不要在页面上点会打到 Gemini 或 Veo 的按钮，包括「让主播回答」「AI 合成语音并驱动主播」「AI 生成全片真人感配音」「试听」「克隆问候」「多语言」「生成说话视频」。
- 不要在这个工作区里修你认为有问题的代码。问题写进回执。

回执只写到 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-续审-队列截止与Gemini信号.md`。不要覆盖 17:43 那份回执。不要把回执写进 `d:\clipflow\clipflow`。

可以读：`git log`、`git diff`、`git show`，以及打开源文件。读之前先看 `git status --short`。若除了未跟踪的 `cursor-studio-followup.patch` 之外还有改动，停下来，在回执里写你看到的状态，不要自己收拾。

## 审哪一段

远程 `origin` 是 `https://github.com/tan520li-debug/clipflow.git`。2026-11-17 18:24 在仓库根目录读到 `origin/main` 是 `83622e6`（完整 `83622e62ef8071e50988c81a9ae517763c074b98`）。`git log origin/main..7aa7eba` 共 24 笔，都没有推送，也没有合进 `main`。以上提交数和哈希是 Cursor 自报。

你已经审过 `d957e6f` 之后到 `f58354f` 的 11 笔。不要把那 11 笔再当新功能审一遍。模型 ID 那条不采纳。不要把模型列表再审成必须修改。

这次要审的是 `f58354f` 之后、代码终点 `7aa7eba` 的 4 笔功能提交，从旧到新：

| 提交 | 时间（UTC+8） | 说明 |
|---|---|---|
| `9260c42` | 17:50 | 名额在写任务记录之前先占上 |
| `7ba6eb4` | 18:00 | 任务截止会 abort 工作信号；`enqueueWork` 走 `admitJob` |
| `0c29097` | 18:07 | 文本和语音的 `generateContent` 与任务信号合并 |
| `7aa7eba` | 18:15 | 语音合成 60 秒是整次墙钟；说话视频轮询走 `awaitWithAbort` |

`f58354f` 到 `7aa7eba` 之间只动 `HANDOFF.md` 或派单的是：`8c96727`、`8faf587`、`0852fa2`、`c173cd6`、`b6b3e66`、`5939c8b`。功能 diff 用 `git diff f58354f..7aa7eba`，不要把交接文字当成代码。

## 请核对的行为

对照源码，不要只信这段话。审点是起点，不是边界；你可以追加自己的审点。

- 队列：`admitJob` 在 `createJob` 之前把 id 放进 `reservedIds`。`jobQueueFull` 要把已占名额算进去。同时来的两个准入，上限为 1 时只能进一个。`enqueueWork` 走 `admitJob`，满了返回 `{ full: true }`，不再自己写记录。
- 截止：`startJob` 的工作跑在 `runWithJobAbort` 里。到期会 abort 这条信号。转码收到信号后先记下超时再 `SIGKILL` ffmpeg。已经是 `succeeded` 或 `failed` 的任务，迟到的完成不要再改状态。超时 HTTP 文案仍是「任务超时，已停止等待。」
- 文本：`generateTextContentWithFallback` 的 `abortSignal` 是 20 秒超时与任务信号的合并。任务一截止，不要换下一个文本模型。
- 语音：`synthesizeStyledSpeech` 整次共用一条 60 秒超时，再与任务信号合并。两个音色模型卡死不应各等 60 秒。超时仍走 `isSpeechTimeoutError`，配音、试听、克隆建模、主播驱动、多语言回 504「语音合成超时，请缩短台词后再试。」任务截止应回任务超时，不要写成语音超时。
- 说话视频：`generateVideos` 和 `getVideosOperation` 的等待走 `awaitWithAbort`，配置里带任务 `abortSignal`。任务截止不要落到「说话视频还在生成，超过了等待时间。」那句 VIDEO_TIMEOUT。
- 模型列表：`src/server/gemini.ts` 里的候选模型不要被这次 diff 改掉。

## 已经做过的核对，请重读命令和结果，不要当成你自己验过

这些是 Cursor 自报，写在 `HANDOFF.md` 开头。

- 17:49 `npx vitest run src/server/jobs/runner.test.ts` 3 个通过。队列名额在写记录之前先占上。
- 17:59 完整 `npm run check` 退出码 0：Biome 16 个文件，Vitest 14 个文件、54 个测试。那是 `7ba6eb4` 之前。
- 18:06 完整 `npm run check` 退出码 0：Biome 16 个文件，Vitest 16 个文件、61 个测试。那是 `0c29097`。
- 18:14 完整 `npm run check` 退出码 0：Biome 16 个文件，Vitest 17 个文件、64 个测试。那是 `7aa7eba`。转码中止测的是假的 `spawn`。Gemini 中止和语音墙钟测的是假的 `generateContent`。
- 18:14:49 请求 `http://127.0.0.1:3000/api/health` 返回 200。开发服务是 18:14 拉起来的。

## 不要写成已经通过

- `7835635` 之后，主播回答、整片配音、试听、克隆问候、多语言没有在页面上再点，因为会打到 Gemini。
- `generateVideos` / `getVideosOperation` 是否认配置里的 `abortSignal` 并取消底层 HTTP，未用真实 Veo 验。
- 口型仍是画布色块。音色仍是 Kore / Zephyr / Puck / Charon / Fenrir 的预置匹配。没有点过真实 Veo。
- `localhost` 和 `127.0.0.1` 不是同一个 `localStorage`。一边填过令牌，另一边仍是空的。
- 没有账号系统。访问令牌仍是顶栏那一把 `ADMIN_ACCESS_TOKEN`。

## 与现有规矩是否冲突

请单独回答：这 4 笔功能提交，与账号、会话、权限、花钱、合主线等现有规矩是否冲突？请列出你对照过的出处（文件和行号，或提交哈希）。至少对照：

- `D:\ai-agents\AGENT-RULES.md` 第 6 条（审过才合）、第 7 条（花钱、对外发布）、第 9 条（送审单只列事实）
- 你 17:43 的回执 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-只读审计.md`
- 仓库 `HANDOFF.md` 开头「下一班」：不要推送、不要合进 `main`、不要改模型列表、不要为了验证去点 Veo

不要写「调度同意」或「施工席取舍合理」。施工席选了：任务截止取消底层工作、语音 60 秒改为整次墙钟、Veo 轮询跟任务信号走。是否合理由你判。

## 回执里要有的

写明你读的提交、读的时间、用的命令。分开写：代码与上面的说明一致；代码与说明不一致；你没跑所以未验。Cursor 自报的读数，你不复算就写未验，不要照抄。不要改模型列表。不要建议把 `.env`、`data/` 或那份过时补丁提交进去。有阻断项就写阻断项。没有就写没有。
