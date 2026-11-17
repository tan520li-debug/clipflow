# ClipFlow 交接

写于 2026-11-17 19:11（UTC+8）。仓库 `d:\clipflow\clipflow`。远程 `origin` 是 `https://github.com/tan520li-debug/clipflow.git`。本地分支 `cursor/studio-followup`。功能代码终点是 `5a6ab92`。派单提交是 `b978d1f`。`origin/main` 仍是 `83622e6`。没有推送，没有合进 `main`。工作区还有未跟踪的 `cursor-studio-followup.patch`，不要提交。

## 豆包续审回执（2026-11-17 19:11）

19:11 读了 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-续审-说话视频下载截止.md`。豆包写于 19:04，读的是约 19:02–19:03。只审 `5a6ab92`。当时 `HEAD` 是 `b978d1f`，`git log 5a6ab92..HEAD` 只有派单和交接。结论是无阻断项。17:43 和 18:35 那两份回执没有被覆盖。

豆包 19:03:29 跑了 `node node_modules/vitest/vitest.mjs run src/server/routes/talkingVideo.test.ts`，1 个通过。完整 `npm run check` 豆包没复算，按未验。未点 Gemini / Veo，未用真实下载截止验 504。

## 给豆包的续审（2026-11-17 18:51）

18:51 写下 `docs/派单-20261117-Cursor-给豆包-续审-说话视频下载截止.md`，同样一份在 `D:\Doubao\clipflow-audit-20261117\`。只审 `5a6ab92`。上一份续审无阻断覆盖到 `7aa7eba`。回执写到 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-续审-说话视频下载截止.md`，不要覆盖 17:43 和 18:35 那两份。豆包只读，不要改这个仓库。这份派单入仓之后，`HEAD` 会比 `5a6ab92` 新，多出来的只应是派单和 `HANDOFF.md`。

## 豆包续审回执（2026-11-17 18:42）

18:42 读了 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-续审-队列截止与Gemini信号.md`。豆包写于 18:35，读的是 18:26–18:35。范围是 `9260c42`、`7ba6eb4`、`0c29097`、`7aa7eba`。当时 `HEAD` 是 `f8c7cd8`，`git log 7aa7eba..HEAD` 只有派单。结论是无阻断项。17:43 那份回执没有被覆盖。

豆包 18:33 在仓库根目录跑了完整 `npm run check`，退出码 0：Biome 16 个文件，Vitest 17 个文件、64 个测试通过。`JOBS_DIR`、`RATE_LIMIT_FILE`、`CLIPFLOW_TMP_DIR` 指到系统临时目录，没有写仓库 `data/`。这是豆包自己的读数，不是照抄 Cursor 自报。18:44 Cursor 在改完下载中止之后又跑了完整 `npm run check`，退出码 0：Biome 16 个文件，Vitest 17 个文件、64 个测试通过。

非阻断观察：说话视频最后下载字节的 `bytesFromVideo` 把 `signal` 传给 `fetchWithEnvProxy`，没有走 `awaitWithAbort`。任务恰在下载阶段截止会落 502「说话视频没有生成」而不是 504「任务超时」。不产生 `VIDEO_TIMEOUT`，与派单不矛盾。豆包建议包一层 `awaitWithAbort` 或在 catch 里看 `signal.aborted`，非强制。18:42 之后按这条建议改：下载和读字节走 `awaitWithAbort`，catch 里 `signal.aborted` 也重抛 `JOB_DEADLINE`。19:04 豆包只读审了 `5a6ab92`，无阻断项。

## 给豆包的续审（2026-11-17 18:25）

18:25 写下 `docs/派单-20261117-Cursor-给豆包-续审-队列截止与Gemini信号.md`，同样一份在 `D:\Doubao\clipflow-audit-20261117\`。要审的是 `9260c42`、`7ba6eb4`、`0c29097`、`7aa7eba`。上一份只读到 `f58354f`。回执写到 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-续审-队列截止与Gemini信号.md`，不要覆盖 17:43 那份。豆包只读，不要改这个仓库。这份派单入仓之后，`HEAD` 会比 `7aa7eba` 新，多出来的只应是派单和 `HANDOFF.md`。

## 本班复盘（2026-11-17）

18:14 补了交接里还不能写成已经通过的两处：

- 语音合成 60 秒是整次 `synthesizeStyledSpeech` 的墙钟。两个音色模型共用这一条超时，卡死时不再各等 60 秒。超时仍回 504「语音合成超时，请缩短台词后再试。」
- 说话视频的 `getVideosOperation` 轮询走 `awaitWithAbort`，配置里带任务 `abortSignal`。`generateVideos` 本身也包在 `awaitWithAbort` 里。

18:14 在仓库根目录跑了完整 `npm run check`，退出码 0。Biome 检查 16 个文件。Vitest 17 个文件、64 个测试通过。墙钟超时测的是假的 `generateContent`。`generateVideos` / `getVideosOperation` 有没有真正取消底层 HTTP，未用真实 Veo 验。

豆包在 17:39–17:43 只读审了 `db1996e` 到 `f58354f`，无阻断项。回执在 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-只读审计.md`。`9260c42` 之后的队列名额、截止取消、Gemini 信号、语音墙钟，豆包都没看过。

18:14 停掉 18:06 那条开发服务后重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。18:14:49 请求 `http://127.0.0.1:3000/api/health` 返回 200。

此前已经做完、不要再做一遍的：

- 任务有 15 分钟截止，队列最多 8 个。17:49 起，名额在写记录之前先占上。`enqueueWork` 走 `admitJob`。
- 任务截止会 `abort` 工作信号。转码收到信号后先记下超时再 `SIGKILL` ffmpeg。文本和语音的 `generateContent` 与任务信号合并。
- 预置音色的合成从 `synthesizeStyledSpeech` 出去，返回前收成 WAV。空音频和认不出的字节不会被标成 `audio/wav`。
- 顶栏没填访问令牌时，页面提示去填，并且不发请求。

## 不要写成已经通过

- `7835635` 之后没有再在页面上点主播回答、配音、试听、克隆问候、多语言。
- `generateVideos` / `getVideosOperation` 是否认配置里的 `abortSignal` 并取消底层 HTTP，未用真实 Veo 验。
- 口型仍是画布色块，音色仍是五个预置声线，没有点过真实 Veo。
- `localhost` 和 `127.0.0.1` 的令牌不互通。

## 下一班

不要推送，不要合进 `main`，除非点名。豆包 17:43 的无阻断覆盖到 `f58354f`。18:35 续审无阻断覆盖到 `7aa7eba`。19:04 续审无阻断覆盖到 `5a6ab92`。不要提交 `.env`、`data/`、`cursor-studio-followup.patch`。不要改 `src/server/gemini.ts` 的模型列表。不要按时间删 `data/media`。不要开做账号、收费、口型模型、实时对讲、服务端工程库。不要为了验证去点 Veo 或再打「让主播回答」。两个班不要同时改 `src/server/app.ts` 和 `src/client/api/http.ts`。

下面是 13:41 写下的原文。

写于 2026-11-17 13:41（UTC+8）。仓库 `d:\clipflow\clipflow`。远程 `origin` 是 `https://github.com/tan520li-debug/clipflow.git`。本地分支 `cursor/studio-followup`。13:12 读到的 `HEAD` 是 `d957e6f`，相对 `origin/main` 当时是下面三笔，没有推送，也没有合进 `main`。13:41 把当时未提交的那批按文件名提交进本分支，提交是 `db1996e`，仍不推送、不合进 `main`。16:24 再读 `git log origin/main..HEAD` 和 `git status --short`，`HEAD` 仍是 `db1996e`，工作区只剩未跟踪的 `cursor-studio-followup.patch`。不要把 `data/`、`.env` 或 `cursor-studio-followup.patch` 提交进去。推送和合进 `main` 等另一个 agent 审过。

## 给豆包的只读审计（2026-11-17 17:28）

17:28 在仓库根目录读了 `git rev-parse HEAD`、`git rev-parse origin/main` 和 `git log origin/main..HEAD`。`HEAD` 是 `f58354f`，`origin/main` 是 `83622e6`。没有推送，没有合进 `main`。反重力审过的是当时 `HEAD` 还是 `d957e6f` 的那棵树。`db1996e` 到 `f58354f` 这 11 笔还没人审。派单在 `docs/派单-20261117-Cursor-给豆包-只读审计.md`，同样一份在 `D:\Doubao\clipflow-audit-20261117\`。豆包只读这个仓库，回执写到豆包自己的目录，不要改这里的文件、`.env`、`data/` 或那份过时补丁。17:46 读了 `D:\Doubao\clipflow-audit-20261117\回执-20261117-豆包-给Cursor-只读审计.md`。豆包写于 17:43，读的是 17:39–17:43。结论是无阻断项。`db1996e` 到 `f58354f` 的代码和派单里要核对的行为一致。豆包自己跑的 `tsc --noEmit`（含 `tsconfig.domain.json`）退出码 0，`vitest run` 13 个文件、48 个测试通过；测试目录指到系统临时目录，没有写仓库 `data/`。回执里的三条非阻断观察：60 秒是单次请求上限，两个音色模型都卡死时大约两分钟才回 504；队列上限是先查再写，并发时可能短暂超过 8；15 分钟截止只停止等待，不取消底层进程。真实 Gemini、真实 Veo、真实卡死超时、口型和音色，豆包没有跑。没有合进 `main`，也没有推送。17:49 `npx vitest run src/server/jobs/runner.test.ts` 3 个通过。队列名额在写任务记录之前先占上，同时来的两个准入只有一个能进。`enqueueWork` 仍然没有调用方，也没有这个上限。15 分钟截止仍然只停止等待，不取消底层进程。17:49 重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。同一分钟请求 `http://127.0.0.1:3000/api/health` 返回 200。上一进程是为了换上这个名额占用被停掉的。

## 当前状态（2026-11-17 13:41）

13:12 时已在分支上、相对 `origin/main` 的三笔：

| 提交 | 说明 |
|---|---|
| `d65437d` | 长任务离开请求线程，大素材离开 `localStorage` |
| `ba50083` | Gemini 走本机代理，转码产出真正的 MP4 |
| `d957e6f` | 时间线刷新后还在；主播能回话；访问令牌可在页面填写；克隆失败不再显示完成 |

`db1996e` 收进当时还没提交的改动。提交前，2026-11-17 13:09 在仓库根目录跑过 `npx vitest run src/server/jobs/runner.test.ts src/server/jobs/http.test.ts src/server/middleware/auth.test.ts`，3 个文件、10 个测试通过；同一条命令里的 `npx tsc --noEmit` 退出码 0。2026-11-17 13:39 在同一目录跑了完整的 `npm run check`，退出码 0：Biome 检查 15 个文件，Vitest 10 个文件、35 个测试通过。`npm run check` 里的 Biome 只覆盖 `biome.json` 列出的路径，没有扫 `src/server/jobs`、`src/server/media`、`src/server/routes`。

这一笔里的文件：`.env.example`、`README.md`、`HANDOFF.md`、`src/server/app.ts`、`src/server/jobs/http.ts`、`src/server/jobs/runner.ts`、`src/server/jobs/runner.test.ts`、`src/server/jobs/store.ts`、`src/server/media/transcode.ts`、`src/server/media/workDir.ts`、`src/server/media/workDir.test.ts`、`src/server/middleware/auth.test.ts`、`src/server/middleware/rateLimit.ts`、`src/server/middleware/rateLimitStore.ts`、`src/server/routes/export.ts`、`src/server/routes/talkingVideo.ts`。`cursor-studio-followup.patch` 是给反重力审计用的旧补丁，相对当前工作区已经过时，留在工作区，没有提交。

这一笔做了四件事：

- 转码临时文件默认在仓库的 `data/tmp`（`studioTmpDir`）。只有绝对路径的 `CLIPFLOW_TMP_DIR` 才覆盖。启动时 `sweepStaleScratch` 删掉超过 24 小时的 `clipflow-in-*` / `clipflow-out-*`。不要按时间删 `data/media`，那些文件被浏览器 IndexedDB 里的引用指着。
- 限流落盘改成异步 `writeFile` / `rename`。内存里的计数仍是同步更新。测试要先 `flushRateLimitWrites()`。
- 单个任务默认最多等 15 分钟（`CLIPFLOW_JOB_DEADLINE_MS`，默认 900000）。超时标失败，HTTP 504，文案「任务超时，已停止等待。」已经是 `succeeded` 或 `failed` 的任务，迟到的完成不会再改状态。
- 队列默认最多 8 个（含正在跑的那一个，`CLIPFLOW_JOB_QUEUE_MAX`）。满了返回 503，文案「正在处理的任务太多，请等当前任务结束后再试。」入口是 `admitJob`：`acceptJsonJob`、成片转码、说话视频都走它。`enqueueWork` 没有调用方，也没有套这个上限。主播回答和说话视频进了每分钟 3 次的严格限流。

开发服务：2026-11-17 13:10 重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。页面地址是 `http://127.0.0.1:3000`。这之前停掉的旧进程退出码 1，是被结束的，不是启动失败。16:25 再请求 `http://127.0.0.1:3000/api/health` 连不上。16:25 又执行了一次 `npm run dev`，日志仍是 `ClipFlow Studio server running on http://0.0.0.0:3000`。

## 反重力审计之后怎么处理的

审计对象是 `cursor/studio-followup` 相对 `origin/main` 的补丁，当时 `HEAD` 还是 `d957e6f`。模型 ID 那条不采纳：`gemini-2.5-flash` 对新密钥是 404，并提示改用 `gemini-3.8-flash`；`gemini-3.1-flash-lite` 和 `gemini-3.8-flash` 能被接口认出，503 是繁忙。不要改 `src/server/gemini.ts` 里的模型列表。

采纳并已写进 13:41 这一笔的：临时目录离开系统盘、限流异步落盘、卡住的单槽任务有截止时间、队列有上限。`data/media` 不做按时间清理。

## 产品上已经接到、但不要夸大的

- 访问令牌在顶栏填写，键是 `localStorage` 的 `clipflow_admin_token`，对应 `.env` 的 `ADMIN_ACCESS_TOKEN`。没有账号系统。
- 克隆失败时页面用红色文案，不会再写「克隆完成」。音色仍是 Kore / Zephyr / Puck / Charon / Fenrir 里的预置匹配，不是本机声纹模型。
- 时间线、简报、风格、平台写在 IndexedDB `clipflow` / `records`，键 `clipflow_studio_session_v1`。2026-11-17 上午在页面上改过简报「刷新保留验证：早八冰拿铁要还在」，刷新后还在。
- 口型是画布上的嘴形色块（`drawDigitalHumanFacialMuscleRig`），不是神经口型模型。本机 `D:\w2l-work` 只有 ffmpeg，没有 MuseTalk / CosyVoice。
- 「让主播回答」走 `POST /api/digital-human/reply`，空话当场 400。上午点过「几克豆子？」：第一次两个文本模型都是 503，页面显示「对话服务正忙，请稍后重试。」第二次请求挂住，后来给文本调用加了 20 秒 `AbortSignal.timeout`。那两次没有产出配音。2026-11-17 16:26 用同一句再打了一次：先回 202，任务 `39526882-67bd-4b1c-af8e-09761f3dc6ab` 约 16 秒后 `succeeded`，HTTP 200，文字是「这个问题问得好，不过豆子的大小和重量都不一样，建议你直接用厨房秤称一下，这样才最精准哦。」这条接口只回文字。
- 16:28 用这句文字打了 `POST /api/digital-human/drive`（预置音色 Kore）。任务 `339bfb2c-e77e-4c39-9039-f84b6ccdab9c` 约 8 秒后 `succeeded`。当时返回 `audio/L16`，时长 10.9 秒是按字数估的，没有口型对齐。浏览器 `Audio` 播不了这种裸 PCM。单段 L16 现已收成 WAV。16:33 用保存的那段音频离线包出来是 `audio/wav`，时长 7.97 秒，对齐有结果。同一分钟 `npx vitest run src/server/audio/wav.test.ts` 2 个通过。没有在页面上点播放。16:34 重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。16:40 前后在 `http://127.0.0.1:3000` 填了访问令牌，打开「数字人克隆与驱动」，输入「几克豆子？」并点「让主播回答」。主播文字是「关于豆子的克数，还要看您具体的用途呢。如果你愿意告诉我是在制作什么美食，我可以帮你精确计算一下用量。」页面显示「驱动音轨就绪 · 10.4s」。播放器收到 `data:audio/wav`（文件头是 RIFF），播了起来，时长 10.45 秒，没有播放错误。音素曲线是 313 个关键帧。音色仍是预置 Kore，口型仍是画布色块。16:55 在同一页清掉浏览器里保存的访问令牌后再点「AI 合成语音并驱动主播」：按钮没有变成「正在合成」，红字是「请先在顶栏填写访问令牌。」，焦点在顶栏「访问令牌」输入框。接口缺令牌时也回这句。同一分钟把令牌写回这个浏览器（长度 32，不记原文）。16:59 `npx vitest run src/server/audio/wav.test.ts` 3 个通过。预置音色的单段合成（整片配音、试听、克隆问候、多语言）在返回前收成 WAV，和主播驱动同一条封装。没有再打 Gemini。17:08 `npx vitest run src/server/audio/wav.test.ts src/server/audio/synthesize.test.ts` 2 个文件、8 个测试通过。空音频和无法识别的字节不会被标成 WAV。模型没返回音频或合成抛错时，统一出口抛错，不造一段假 WAV。主播回答、整片配音、试听、克隆问候、多语言没有在页面上再点。口型对齐质量未评。17:10 重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。同一分钟请求 `http://127.0.0.1:3000/api/health` 返回 200。之前那个进程已经不在，连不上是因为它停了。17:13 `npx vitest run src/client/api/http.test.ts` 3 个通过。17:16 在 `http://127.0.0.1:3000` 清掉访问令牌后，触发「AI 生成全片真人感配音」的处理函数：页面出现「请先在顶栏填写访问令牌。」，焦点在顶栏输入框，期间没有发出请求。自动化鼠标点到了这个按钮，但没有跑进处理函数。同一分钟把令牌写回（长度 32，不记原文）。配音、试听、克隆、多语言、自动剪辑、导出都走这个出口；页面上只触发了配音这一条。没有打 Gemini。17:21 `npx vitest run src/server/audio/synthesize.test.ts` 5 个通过。语音合成每次请求最多等 60 秒，超时就中断并换下一个模型，不再把唯一的任务槽占到 15 分钟。页面上没有用卡住的请求再验。17:22 重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。同一分钟请求 `http://127.0.0.1:3000/api/health` 返回 200。上一进程是为了换上这个超时被停掉的。17:26 `npx vitest run src/server/audio/synthesize.test.ts` 6 个通过，同一分钟 `npx tsc --noEmit` 退出码 0。配音、试听、克隆建模、主播驱动、多语言在合成超时时回 504「语音合成超时，请缩短台词后再试。」页面上没有再点。17:27 重新执行 `npm run dev`，日志是 `ClipFlow Studio server running on http://0.0.0.0:3000`。同一分钟请求 `http://127.0.0.1:3000/api/health` 返回 200。上一进程是为了换上这句超时文案被停掉的。
- 说话视频按钮已接上 `POST /api/digital-human/talking-video`（Veo，会花钱）。空台词验证过，返回 400「请先写一句要让主播说的话。」没有发过真实生成。

## 下一班

13:41 那一笔已经在本地 `cursor/studio-followup`。不要重复提交。推送和合进 `main` 等另一个 agent 审过。工作区里剩下的 `cursor-studio-followup.patch` 仍然不要加进去。

不要开做，除非点名：账号、收费、口型模型、实时对讲。口型仍是画布色块，本机没有 MuseTalk / CosyVoice。服务端工程库同样先不动。不要为了验证去点真正的 Veo 生成。「让主播回答」16:26 已经再试过，文字通了，不必为了验证再打一次。两个班不要同时改 `src/server/app.ts` 和 `src/client/api/http.ts`。

下面是 2026-11-17 凌晨的记录。其中「下一班先做」的五项，以及后来的代理、MP4、时间线、回话，都已经进了上面三笔提交。临时目录、单槽卡住、队列无上限这几条，以本节为准，不要按旧文再做一遍。

2026-11-17 01:20 左右实测：本机有 `HTTPS_PROXY`（`127.0.0.1:10809`）。Gemini 官方 SDK 不走这个代理，直连会超时。`getGeminiClient` 在有代理时用 `undici` 的 `ProxyAgent`。`gemini-2.5-flash` 对新用户返回 404，默认文本模型改为 `gemini-3.1-flash-lite`，忙的时候再试 `gemini-3.8-flash`。页面上点过「AI 生成多平台成片」，预览标题改成了「3分钟早八续命神器：极简冰燕麦拿铁」。转码结果文件名是 `.bin`，ffmpeg 认不出封装；已改成显式 `-f mp4`。本机 ffmpeg 用 `.env` 的 `FFMPEG_PATH`（`D:/w2l-work/bin/ffmpeg.exe`）。720p 导出页面显示「已通过服务端 FFmpeg 转码为高兼容 H.264 MP4」，下载是 1.4 MB 的 `.mp4`。

## 2026-11-17 凌晨做完的

上一班交接里的五件事已经落地。`npm run check` 于 2026-11-17 00:27 通过：类型检查、Biome、25 个测试。

- 形象、上传素材、克隆音色进 IndexedDB（库 `clipflow`，store `records`）。加载完成前不会用空列表覆盖。语言和访问令牌仍在 `localStorage`。
- 超过约 4KB 的 base64 由 `apiFetch` 先传到 `POST /api/media`，JSON 里只留 `clipflow-media:` 引用，进具体接口前再从 `data/media` 还原。
- 转场、配色、字幕、音效、试听等长接口先回任务号。缺字段仍当场 4xx。
- 限流计数在 `data/rate-limit.json`，重启后续数。`/media` 和 `/jobs` 不占额度。
- 播放和导出共用 `advanceStudioCursor`。
- `InspectorPanel.tsx` 拆出转场、配色、配乐、音效、字幕配音。`DigitalHumanTab.tsx` 拆出克隆、驱动、多语言、情感动作。公开导出没变。录音、迷你舞台、运镜、音素对齐仍留在数字人入口。
- 2026-11-17 00:50 把换平台、上传、自动剪辑、时间线、配音和数字人操作从 `App.tsx` 挪到 `src/components/studio/useStudioCommands.ts`。`App.tsx` 只留状态、播放和页面拼装。`npm run check` 再次通过，仍是 25 个测试。`vite.config.ts` 不再用 `__dirname`。

2026-11-17 00:28 在 `http://127.0.0.1:3000` 点过：剪辑台能打开，播放会走到约 2.4 秒后暂停，数字人页和导出窗口能打开。仓库里没有 `.env`，所以没有真正跑通自动剪辑或成片转码。开发服务当时开着。

下面是 2026-11-16 晚的记录，其中「下一班先做」的五项已经做完。

## 本班做了什么

把原型收成一个模块化单体，没有改产品功能的表面行为。

- 领域：口播切段、时长估算、梅尔口型进了 `src/domain/speech`。服务端不再引用带浏览器 API 的 `digitalHumanAssets.ts`。
- 契约：`src/contracts/http.ts` 统一访问令牌头和语言头。
- 服务端：`src/server/app.ts` 只做组装。剪辑、配音、数字人、转码、任务查询拆到 `src/server/routes/`。入口是 `src/server/main.ts`。根目录 `server.ts` 只是一行转调。
- 前端：所有 `/api` 调用走 `src/client/api/http.ts` 的 `apiFetch`。它会带上已保存的访问令牌。收到 `202` 且 JSON 里有 `jobId` 时，每 800ms 轮询，最多 120 秒。
- 长任务：自动剪辑、配音、声音克隆训练、数字人克隆、数字人驱动、多语言配音、成片转码先返回任务号，记录写在 `data/jobs`。转码视频先落到临时文件，再交给 ffmpeg，不再在内存里攒最大 160MB 的一块缓冲区。
- 工程化：包名 `clipflow@0.1.0`。`package.json` 写了 `packageManager: npm@11.19.0`，Node 需要 `>=22`。`npm run check` 包含全量类型检查、领域层严格类型检查、Biome、Vitest。

上一班结束时的口径：`npm run check` 通过，类型检查和 13 个测试都过。任务队列接上之后，没有再在浏览器里点自动剪辑或导出。本回合没有重跑 `npm run check`，也没有开浏览器。

## 下一班先跑

用 npm，不要用仓库里的 `bun.lock`。

```powershell
npm install
npm run check
npm run dev
```

开发服务在 `http://127.0.0.1:3000`。需要 `.env` 里的 `GEMINI_API_KEY` 和 `ADMIN_ACCESS_TOKEN`。前端把令牌存在 `localStorage` 的 `clipflow_admin_token`。

改完调用链之后，要在页面上走一遍自动剪辑和导出。上一班没有走过这两条。

## 不要踩的坑

- `data/` 已在 `.gitignore`。任务 JSON 和二进制结果都在 `data/jobs`。测试可用环境变量 `JOBS_DIR` 换目录。
- 进程重启时，状态仍是 `queued` 或 `running` 的任务会被标成失败，错误文案是「服务重启，任务已中断。」
- 任务队列同一时间只跑一个（`src/server/jobs/runner.ts` 里的 `busy`）。轮询 `GET /api/jobs/:id` 和 `/result` 不占限流；别的接口仍占。
- `apiFetch` 只在响应是 `202` 且 JSON 里有 `jobId` 时才轮询。校验失败应继续直接返回 `4xx`，不要包成任务。
- 转码的空文件是同步 `400`，超过 160MB 是同步 `413`。成功路径才是 `202`，结果用 `GET /api/jobs/:id/result` 取 mp4。上传先写到系统临时目录的 `clipflow-in-<id>.<ext>`。
- `express.json` 上限 16MB。照片和配音的 base64 仍进 JSON 请求体。
- 两个班不要同时改 `src/server/app.ts` 和 `src/client/api/http.ts`。这两个是接线点。

## 下一班按这个顺序做

1. 素材离开 `localStorage`，大块 base64 不要再塞进 JSON 请求体。现在进 `localStorage` 的大块在 `src/App.tsx`：`clipflow_digital_humans_v1`（数字人形象，含 `sampleAudioBase64` 和 `data:` 头像）、`clipflow_dh_uploaded_assets_v1`（上传素材的 data URL，单条长度小于 2_800_000 才写入）、`clipflow_cloned_voices_v1`。工程时间线在 React state，刷新就没了，并没有进 `localStorage`。语言（`clipflow_ui_lang_v1`、`clipflow_content_lang_v1`）和访问令牌是小字符串，留在 `localStorage` 即可。先把浏览器侧大块换成 IndexedDB 或本地文件句柄，服务端把大块 base64 落成 `data/` 下的文件再交给 Gemini。
2. 拆 `src/App.tsx`、`src/components/InspectorPanel.tsx`、`src/components/DigitalHumanTab.tsx`。工程、播放和本次 AI 请求缠在 `App.tsx`。类型仍集中在 `src/types/studio.ts`，领域层目前只有口播。2026-11-16 23:22 左右用 PowerShell `Get-Content | Measure-Object -Line` 数过非空行：`App.tsx` 1734，`InspectorPanel.tsx` 3865，`DigitalHumanTab.tsx` 3341。
3. 其余长接口再进任务队列。仍是同步处理的有：转场、转场序列、配色、素材标签、背景乐、字幕、音效、声音试听、降噪分析、文案润色、版权扫描、情感分析、动作建议。短的校验失败仍要当场返回 `4xx`。
4. 限流改成能跨重启保留的计数。现在是 `src/server/middleware/rateLimit.ts` 里的进程内 `Map`，普通接口每分钟 20 次，严格接口每分钟 3 次，重启即清零。
5. 播放和导出合成一条时钟。画面在画布，声音在 `StudioAudioEngine`，导出是浏览器录屏再转码。数字人仍是画布形变加预置音色，不是生成真人说话视频。

账号、服务端工程库和收费不要做，除非产品明确要求。现在是一把共享的 `ADMIN_ACCESS_TOKEN`。

## 已经走任务的接口

| 方法与路径 | 路由文件 |
|---|---|
| `POST /api/auto-edit` | `src/server/routes/edit.ts` |
| `POST /api/generate-voiceover` | `src/server/routes/voice.ts` |
| `POST /api/voice-clone/train` | `src/server/routes/voice.ts` |
| `POST /api/digital-human/clone` | `src/server/routes/digitalHuman.ts` |
| `POST /api/digital-human/drive` | `src/server/routes/digitalHuman.ts` |
| `POST /api/digital-human/multilingual-dub` | `src/server/routes/digitalHuman.ts` |
| `POST /api/export/transcode-mp4` | `src/server/routes/export.ts` |

## 文件地图

| 路径 | 作用 |
|---|---|
| `src/server/app.ts` | 组装 Express、鉴权、限流、注册路由 |
| `src/server/routes/jobs.ts` | `GET /api/jobs/:id` 和 `/result` |
| `src/server/jobs/store.ts` | 磁盘任务记录 |
| `src/server/jobs/runner.ts` | 进程内单槽队列 |
| `src/server/jobs/http.ts` | `acceptJsonJob` |
| `src/client/api/http.ts` | 带令牌的 fetch，以及 `202` 轮询 |
| `src/domain/speech` | 口播算法和测试 |

## 本回合怎么核对的

2026-11-16 23:22 左右，读了 `git status -sb`、`git log -5 --oneline`、`git remote -v`、`git rev-parse HEAD`，并打开了 `package.json`、`src/server/app.ts`、`src/server/middleware/rateLimit.ts`、`src/client/api/http.ts`、`src/server/jobs/store.ts`、`src/server/jobs/runner.ts`、`src/server/routes/export.ts` 和 `src/App.tsx` 里的存储键。三个测试文件里的 `it(` 一共 13 个：`src/domain/speech/script.test.ts` 5 个，`src/server/middleware/auth.test.ts` 3 个，`src/server/jobs/store.test.ts` 5 个。`npm run check` 和浏览器里的自动剪辑、导出，本回合未验。
