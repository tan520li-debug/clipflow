# clipflow-mcp

Cursor 插件。只提供一个工具 `studio_health`：请求本机 ClipFlow 的 `GET /api/health`。

它不会生成视频，不会消耗 Gemini 密钥，也不会把成片发到抖音、TikTok、Instagram 或 Facebook。

## 使用

先在本机跑起剪辑台：

```bash
npm install
npm run dev
```

插件用 Node.js 22 启动 `mcp-server.mjs`。`CLIPFLOW_URL` 不填时是 `http://127.0.0.1:3000`。

## 上架

这个目录是仓库里的一个插件。仓库根上的 `.cursor-plugin/marketplace.json` 指向它。公开仓库地址：

https://github.com/tan520li-debug/clipflow

提交审核的页面是 https://cursor.com/marketplace/publish 。需要登录 Cursor 账号。审核由 Cursor 人工做，提交后不会马上出现在市场里。
