# ClipFlow Studio

面向抖音、TikTok 和 Facebook Reels 的本地短视频剪辑台。长任务走服务端队列，素材和时间线保存在浏览器的 IndexedDB 里。

## 运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:3000`。端口用环境变量 `PORT` 改，不设就是 3000。

把 `.env.example` 抄成 `.env`，至少填这两项：

- `GEMINI_API_KEY`：Gemini 接口密钥
- `ADMIN_ACCESS_TOKEN`：访问口令

页面右上角「访问令牌」填同一个口令。它写在本机 `localStorage` 的 `clipflow_admin_token`，请求会带 `x-clipflow-token`。

`.env` 不进 git。换一台机器要自己再配密钥、口令和 ffmpeg。

如果本机要走代理，设置 `HTTPS_PROXY`（例如 `http://127.0.0.1:10809`）。服务启动时会让 Gemini 请求走这个代理。

ffmpeg 不在 PATH 上时，设置 `FFMPEG_PATH` 为可执行文件的绝对路径。导出成片会转成 H.264 MP4。

## 检查

```bash
npm run check
```

这会做类型检查、lint 和测试。

## 现在能做什么

- 时间线、文案和剪辑参数保存在 IndexedDB。刷新页面后还在。配音音频太大时会丢掉音频数据，字幕和镜头还在。
- 顶栏可以填写访问令牌。克隆失败时不会显示成功，也不会新建形象。
- 数字人页可以让主播按你说的话回答，再用现有语音合成开口。
- 「生成说话视频」会调用 Veo，生成一段竖屏口播。这一步消耗视频额度，通常要几分钟。
- 形象克隆会分析照片并匹配到 Gemini 的预设音色（Kore、Zephyr、Puck、Charon、Fenrir）。当前接口没有单独的声纹模型。
- 口型按音素视位画在脸上。照片上的嘴是画出来的，不是逐帧换嘴的视频模型。
