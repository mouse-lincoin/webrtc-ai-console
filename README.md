# webrtc-ai-console

[English](./README.en.md) | [简体中文](./README.md)

用手机 ↔ Mac mini 之间的 **WebRTC 聊天** 做轻量控制台：手机发指令，Mac 在本地跑 AI（Cursor SDK），再把结果 **流式** 推回聊天窗。

> 阶段目标：**最小可连通的 WebRTC 聊天** → **接入 Cursor SDK 的本地 Agent 原型**。

## 架构一览

### 局域网（开发）

```text
手机/浏览器 ──ws://Mac:8787/ws──► host 信令 ──► WebRTC DataChannel ──► Mac 宿主
                                      └── Cursor SDK（本地 Agent）
```

### 外网（4G / 跨网）

```text
手机 (4G) ──wss://公网/ws──► 信令（Cloudflare Tunnel 或 VPS+Caddy）
                │
                └── WebRTC（常需 TURN 中继）──► Mac 宿主 + Cursor SDK
```

| 组件 | 目录 | 职责 |
|------|------|------|
| 聊天 UI | `packages/client` | 连接页（信令 URL、房间令牌）、聊天与流式展示 |
| 控制台宿主 | `packages/host` | WSS 信令、`joined` 下发 ICE/TURN、SDK 调用 |
| 协议 | `packages/shared` | DataChannel 帧、信令消息类型 |

产品细节见 [docs/PRD.md](./docs/PRD.md)。

## 前置条件

- **Node.js** ≥ 20、**pnpm** ≥ 9
- Mac mini：**Cursor API Key** → [Dashboard → Integrations](https://cursor.com/dashboard/integrations)
- **外网联调**：`ROOM_ACCESS_TOKEN` + 公网 **WSS**；4G 建议另有 **TURN**（见部署文档）

## 在线演示（GitHub Pages）

仅托管 **聊天前端**（静态页）：

**https://mouse-lincoin.github.io/webrtc-ai-console/**

信令与 Cursor Agent 仍需在 Mac 本地运行 `pnpm dev:host`，再在连接页填写 Mac 局域网或 Cloudflare 隧道的 WSS 地址。

## 快速开始（局域网）

```bash
cd webrtc-ai-console
pnpm install

cp .env.example packages/host/.env
# 编辑 CURSOR_API_KEY；外网再设 ROOM_ACCESS_TOKEN

pnpm dev:host    # 终端 1：信令 :8787
pnpm dev:client  # 终端 2：聊天页 :5173
```

浏览器打开 `http://localhost:5173`（同 Wi‑Fi 的手机可用 `http://<Mac局域网IP>:5173`）。

连接页：

| 字段 | 局域网示例 |
|------|------------|
| 信令地址 | `ws://localhost:8787/ws` 或 `ws://192.168.x.x:8787/ws` |
| 房间令牌 | 留空（未设 `ROOM_ACCESS_TOKEN` 时） |
| 房间 ID | 两端相同，如 `demo-room` |
| 角色 | 手机 → **发起方**；Mac → **Mac 宿主** |

## 外网联调（推荐 Cloudflare Tunnel）

**不必买域名**：用 [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) 把本机信令暴露为 **HTTPS/WSS**，用完 **Ctrl+C 关 cloudflared 即断公网**（进程停、地址失效，无长期端口转发）。

```bash
brew install cloudflared
pnpm gen-token                    # 写入 packages/host/.env → ROOM_ACCESS_TOKEN=...

# 终端 1
pnpm dev:host

# 终端 2（复制输出的 https://xxxx.trycloudflare.com）
cloudflared tunnel --url http://localhost:8787

# 终端 3（可选）
pnpm dev:client
```

手机（4G）与 Mac 上连接页填写：

- **信令**：`wss://<cloudflared 显示的域名>/ws`
- **房间令牌**：与 `ROOM_ACCESS_TOKEN` 相同
- **房间 / 角色**：同上

> **说明**：隧道只解决 **信令**；手机 4G 下 WebRTC 往往还需要 **TURN**（VPS coturn 或 Metered 等）。仅隧道 + 无 TURN 时可能能连局域网、但 4G 仍可能 `failed`。完整方案见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

### 部署方式怎么选

| 方式 | 适用 | 信令 | 可随时关闭公网 |
|------|------|------|----------------|
| **Cloudflare 临时隧道** | 个人开发、偶尔用手机控 Mac | `trycloudflare.com` | ✅ Ctrl+C 即关 |
| **Cloudflare Named Tunnel + 自己的域** | 常用、固定网址 | 固定子域 | ✅ 停 `cloudflared` 服务 |
| **VPS + Caddy + coturn** | 生产、稳定 4G | 自有域名 | 停 Docker/进程 |
| **仅局域网** | 家里 Wi‑Fi | 内网 IP | 不暴露公网 |

隧道方案对比（ngrok / localhost.run 等）见 DEPLOY **方案 B**。

## 环境变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `CURSOR_API_KEY` | `packages/host` | Cursor SDK |
| `HOST_PORT` | `packages/host` | 信令端口，默认 `8787` |
| `ROOM_ACCESS_TOKEN` | `packages/host` | 房间令牌；**公网/隧道建议必填** |
| `TURN_URLS` / `TURN_AUTH_SECRET` | `packages/host` |跨网 TURN（coturn） |
| `PUBLIC_ORIGIN` | `packages/host` | CORS，如 `https://你的域名` |
| `VITE_SIGNAL_URL` | `packages/client` | 连接页默认信令 URL |
| `VITE_ROOM_TOKEN` | `packages/client` | 连接页默认令牌 |

完整列表见 [.env.example](./.env.example)。

## 信令流程（摘要）

1. 客户端 `join`（含 `roomId`、`role`、可选 `token`）
2. 服务端校验令牌 → 回复 `joined`（含 **STUN/TURN 列表**）
3. 交换 `offer` / `answer` / `ice-candidate`
4. DataChannel 传输 `chat.*` 消息

类型定义：`packages/shared/src/protocol.ts`。

## DataChannel 消息（摘要）

| `type` | 方向 | 含义 |
|--------|------|------|
| `chat.user` | 手机 → Mac | 用户输入 |
| `chat.assistant.delta` | Mac → 手机 | AI 流式片段 |
| `chat.assistant.done` | Mac → 手机 | 本轮结束 |
| `chat.error` | Mac → 手机 | 错误 |

## 开发脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev:host` | 信令 + `/health` + `/api/ice` |
| `pnpm dev:client` | Vite 聊天 UI |
| `pnpm gen-token` | 生成 `ROOM_ACCESS_TOKEN` |
| `pnpm build` | 构建全仓 |
| `pnpm typecheck` | TypeScript 检查 |

## 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M0 | README（中/英）/ PRD / 仓库骨架 | ✅ |
| M1 | 信令 + DataChannel + echo | 🚧 浏览器 host 可 echo |
| M2 | `@cursor/sdk` 本地 Agent 流式回传 | 🚧 占位 |
| M3 | 房间 token、`joined`+ICE、TURN/coturn、连接页 | ✅ 首版 |
| M3+ | Cloudflare Named Tunnel 示例配置 | 文档 |
| M4 | 断线重连、速率限制、无头 host | 待做 |

## 安全说明

| 场景 | 要求 |
|------|------|
| 局域网开发 | 可不设 `ROOM_ACCESS_TOKEN`（仅可信 Wi‑Fi） |
| Cloudflare / 公网 | **必须** `ROOM_ACCESS_TOKEN` + **WSS**；不用时 **停止 cloudflared / host** |
| 跨网 WebRTC | 建议 **TURN** + 强 `TURN_AUTH_SECRET`；勿将 `.env` 提交 git |

## 相关文档

- [公网 + TURN + Cloudflare 部署](./docs/DEPLOY.md)
- [产品需求 PRD](./docs/PRD.md)
- [Cursor SDK（TypeScript）](https://cursor.com/docs/sdk/typescript)
- `packages/host/src/agent/` — SDK 集成占位

## License

MIT（可在正式开源前按需调整）
