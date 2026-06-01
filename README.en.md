# webrtc-ai-console

[English](./README.en.md) | [简体中文](./README.md)

A lightweight console over **WebRTC chat** between your phone and a Mac mini: send commands from the phone, run AI locally on the Mac (Cursor SDK), and **stream** results back into the chat UI.

> Goal: **minimal working WebRTC chat** → **local Agent prototype with Cursor SDK**.

## Architecture

### LAN (development)

```text
Phone/browser ──ws://Mac:8787/ws──► host signaling ──► WebRTC DataChannel ──► Mac host
                                      └── Cursor SDK (local Agent)
```

### Internet (4G / cross-network)

```text
Phone (4G) ──wss://public/ws──► signaling (Cloudflare Tunnel or VPS+Caddy)
                │
                └── WebRTC (often needs TURN) ──► Mac host + Cursor SDK
```

| Component | Path | Role |
|-----------|------|------|
| Chat UI | `packages/client` | Connect page (signaling URL, room token), chat & streaming |
| Console host | `packages/host` | WSS signaling, `joined` with ICE/TURN, SDK calls |
| Protocol | `packages/shared` | DataChannel frames, signaling message types |

See [docs/PRD.md](./docs/PRD.md) for product details (Chinese).

## Prerequisites

- **Node.js** ≥ 20, **pnpm** ≥ 9
- Mac mini: **Cursor API Key** → [Dashboard → Integrations](https://cursor.com/dashboard/integrations)
- **Internet testing**: `ROOM_ACCESS_TOKEN` + public **WSS**; 4G usually needs **TURN** (see deploy doc)

## Live demo (GitHub Pages)

Only the **chat frontend** (static) is hosted:

**https://mouse-lincoin.github.io/webrtc-ai-console/**

Signaling and the Cursor Agent still run locally on the Mac (`pnpm dev:host`). Enter your Mac LAN or Cloudflare tunnel WSS URL on the connect page.

## Quick start (LAN)

```bash
cd webrtc-ai-console
pnpm install

cp .env.example packages/host/.env
# Set CURSOR_API_KEY; for internet, also set ROOM_ACCESS_TOKEN

pnpm dev:host    # Terminal 1: signaling :8787
pnpm dev:client  # Terminal 2: chat UI :5173
```

Open `http://localhost:5173` in a browser (on the same Wi‑Fi, phones can use `http://<Mac-LAN-IP>:5173`).

Connect page:

| Field | LAN example |
|-------|-------------|
| Signaling URL | `ws://localhost:8787/ws` or `ws://192.168.x.x:8787/ws` |
| Room token | Leave empty when `ROOM_ACCESS_TOKEN` is unset |
| Room ID | Same on both sides, e.g. `demo-room` |
| Role | Phone → **initiator**; Mac → **Mac host** |

## Internet testing (Cloudflare Tunnel recommended)

**No domain required**: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) exposes local signaling as **HTTPS/WSS**. **Ctrl+C** on `cloudflared` tears down public access (process stops, URL invalid, no long-lived port forward).

```bash
brew install cloudflared
pnpm gen-token                    # writes ROOM_ACCESS_TOKEN=... to packages/host/.env

# Terminal 1
pnpm dev:host

# Terminal 2 (copy the https://xxxx.trycloudflare.com URL)
cloudflared tunnel --url http://localhost:8787

# Terminal 3 (optional)
pnpm dev:client
```

On phone (4G) and Mac connect page:

- **Signaling**: `wss://<cloudflared-domain>/ws`
- **Room token**: same as `ROOM_ACCESS_TOKEN`
- **Room / role**: as above

> **Note**: The tunnel only covers **signaling**. WebRTC over 4G often needs **TURN** (VPS coturn, Metered, etc.). Tunnel without TURN may work on LAN but fail on 4G. Full setup: [docs/DEPLOY.md](./docs/DEPLOY.md) (Chinese).

### Which deployment to use

| Method | Use case | Signaling | Can shut down public access anytime |
|--------|----------|-----------|-------------------------------------|
| **Cloudflare quick tunnel** | Personal dev, occasional phone control | `trycloudflare.com` | ✅ Ctrl+C |
| **Cloudflare Named Tunnel + your domain** | Regular use, fixed URL | Fixed subdomain | ✅ Stop `cloudflared` service |
| **VPS + Caddy + coturn** | Production, stable 4G | Your domain | Stop Docker/process |
| **LAN only** | Home Wi‑Fi | LAN IP | No public exposure |

More tunnel options (ngrok, localhost.run, etc.) in DEPLOY **方案 B**.

## Environment variables

| Variable | Location | Description |
|----------|----------|-------------|
| `CURSOR_API_KEY` | `packages/host` | Cursor SDK |
| `HOST_PORT` | `packages/host` | Signaling port, default `8787` |
| `ROOM_ACCESS_TOKEN` | `packages/host` | Room token; **recommended for public/tunnel** |
| `TURN_URLS` / `TURN_AUTH_SECRET` | `packages/host` | TURN for cross-network (coturn) |
| `PUBLIC_ORIGIN` | `packages/host` | CORS, e.g. `https://your-domain` |
| `VITE_SIGNAL_URL` | `packages/client` | Default signaling URL on connect page |
| `VITE_ROOM_TOKEN` | `packages/client` | Default token on connect page |

Full list: [.env.example](./.env.example).

## Signaling flow (summary)

1. Client `join` (`roomId`, `role`, optional `token`)
2. Server validates token → replies `joined` (with **STUN/TURN** list)
3. Exchange `offer` / `answer` / `ice-candidate`
4. DataChannel carries `chat.*` messages

Types: `packages/shared/src/protocol.ts`.

## DataChannel messages (summary)

| `type` | Direction | Meaning |
|--------|-----------|---------|
| `chat.user` | Phone → Mac | User input |
| `chat.assistant.delta` | Mac → Phone | AI stream chunk |
| `chat.assistant.done` | Mac → Phone | Turn complete |
| `chat.error` | Mac → Phone | Error |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:host` | Signaling + `/health` + `/api/ice` |
| `pnpm dev:client` | Vite chat UI |
| `pnpm gen-token` | Generate `ROOM_ACCESS_TOKEN` |
| `pnpm build` | Build monorepo |
| `pnpm typecheck` | TypeScript check |

## Milestones

| Phase | Scope | Status |
|-------|-------|--------|
| M0 | README / PRD / repo skeleton | ✅ |
| M1 | Signaling + DataChannel + echo | 🚧 Browser host can echo |
| M2 | `@cursor/sdk` local Agent streaming | 🚧 Placeholder |
| M3 | Room token, `joined`+ICE, TURN/coturn, connect page | ✅ First version |
| M3+ | Cloudflare Named Tunnel example config | Docs |
| M4 | Reconnect, rate limit, headless host | Todo |

## Security

| Scenario | Requirement |
|----------|-------------|
| LAN dev | `ROOM_ACCESS_TOKEN` optional (trusted Wi‑Fi only) |
| Cloudflare / public | **Require** `ROOM_ACCESS_TOKEN` + **WSS**; **stop cloudflared/host** when not in use |
| Cross-network WebRTC | Prefer **TURN** + strong `TURN_AUTH_SECRET`; never commit `.env` |

## Related docs

- [Deploy: public + TURN + Cloudflare](./docs/DEPLOY.md) (Chinese)
- [PRD](./docs/PRD.md) (Chinese)
- [Cursor SDK (TypeScript)](https://cursor.com/docs/sdk/typescript)
- `packages/host/src/agent/` — SDK integration placeholder

## License

MIT (adjust before formal open source if needed)
