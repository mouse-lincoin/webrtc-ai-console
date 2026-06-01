# 部署指南

## 方案 A：仅局域网

1. Mac 上 `pnpm install && pnpm dev:host`
2. `pnpm dev:client` 或使用手机访问 `http://<Mac局域网IP>:5173`
3. 信令：`ws://<Mac IP>:8787/ws`，房间 ID 两端一致
4. 未设置 `ROOM_ACCESS_TOKEN` 时令牌可留空

## 方案 B：Cloudflare 临时隧道（信令）

1. `brew install cloudflared`（或见 [官方安装](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)）
2. `pnpm gen-token`，在 `packages/host/.env` 配置 `ROOM_ACCESS_TOKEN`
3. 终端 1：`pnpm dev:host`
4. 终端 2：`cloudflared tunnel --url http://localhost:8787`
5. 手机与 Mac 连接页填写 `wss://<分配的 trycloudflare 域名>/ws` 与相同令牌、房间
6. **用完即关**：在 cloudflared 终端 **Ctrl+C**，公网入口立即失效

> 隧道只转发 **HTTP/WSS 信令**，不转发 TURN UDP。4G 下 WebRTC 通常还需独立 **coturn**（方案 C）。

## 方案 C：VPS + Caddy + coturn（生产）

1. VPS 安装 coturn，配置 `static-auth-secret`
2. `packages/host/.env` 设置 `TURN_URLS`、`TURN_AUTH_SECRET`
3. Caddy 反代 `host:8787`，证书自动
4. `PUBLIC_ORIGIN` 包含前端域名（含 GitHub Pages）

## GitHub Pages（仅前端）

静态聊天 UI 部署在：

`https://mouse-lincoin.github.io/webrtc-ai-console/`

- 推送 `main` 后由 Actions 自动构建部署
- **信令与 Agent 仍在 Mac 本地** 运行 `pnpm dev:host`
- 连接页信令填 Mac 局域网 IP、Cloudflare 隧道 WSS 等

## 环境变量速查

见仓库根目录 [.env.example](../.env.example)。

## 健康检查

```bash
curl http://localhost:8787/health
```
