# ClipFlow 交接

写于 2026-11-17 00:30 左右。仓库 `d:\clipflow\clipflow`，分支 `main`，跟踪 `origin/main`（`https://github.com/tan520li-debug/clipflow.git`）。HEAD 仍是 `83622e6`。本班改动都在本地 `main`，没有提交，也没有推送。不要把 `data/`、`.env` 提交进去。

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
