import {
  parseChatMessage,
  serializeChatMessage,
  type ChatUserMessage,
} from "@webrtc-ai-console/shared";
import { echoReply, runHostAgentBridge } from "./host-agent-bridge.js";
import {
  loadSettings,
  saveSettings,
  type ConnectionSettings,
} from "./storage.js";
import { WebRtcSession, type RtcState } from "./webrtc-session.js";

export function mountApp(root: HTMLElement): void {
  const settings = loadSettings();
  let session: WebRtcSession | null = null;
  let streamingEl: HTMLDivElement | null = null;

  root.innerHTML = `
    <header>
      <h1>webrtc-ai-console</h1>
      <div class="status-bar" data-state="idle">未连接</div>
    </header>
    <section class="connect-panel" id="connect-panel"></section>
    <section class="chat-panel" id="chat-panel">
      <div class="messages" id="messages"></div>
      <form class="chat-form" id="chat-form">
        <input type="text" id="chat-input" placeholder="输入指令…" autocomplete="off" />
        <button type="submit">发送</button>
      </form>
    </section>
  `;

  const statusEl = root.querySelector(".status-bar") as HTMLDivElement;
  const connectPanel = root.querySelector("#connect-panel") as HTMLElement;
  const chatPanel = root.querySelector("#chat-panel") as HTMLElement;
  const messagesEl = root.querySelector("#messages") as HTMLDivElement;
  const chatForm = root.querySelector("#chat-form") as HTMLFormElement;
  const chatInput = root.querySelector("#chat-input") as HTMLInputElement;

  renderConnectForm(connectPanel, settings, async (s) => {
    saveSettings(s);
    setStatus("connecting", "连接中…");
    try {
      session?.disconnect();
      session = new WebRtcSession(s.signalUrl, s.roomId, s.role, s.roomToken);
      session.setHandlers({
        onState: (st) => updateRtcStatus(st),
        onSystem: (t) => appendMessage(messagesEl, "system", t),
        onMessage: (raw) => void handleDataChannelMessage(raw, s),
      });
      await session.connect();
      connectPanel.style.display = "none";
      chatPanel.classList.add("active");
      appendMessage(
        messagesEl,
        "system",
        s.role === "mobile"
          ? "已加入房间（发起方）。请在 Mac 打开宿主页并连接相同房间。"
          : "已加入房间（Mac 宿主）。等待手机连接…",
      );
    } catch (err) {
      setStatus("error", err instanceof Error ? err.message : "连接失败");
    }
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !session?.isDataChannelOpen()) return;
    const msg: ChatUserMessage = {
      type: "chat.user",
      text,
      messageId: crypto.randomUUID(),
    };
    session.sendText(serializeChatMessage(msg));
    appendMessage(messagesEl, "user", text);
    chatInput.value = "";
  });

  function setStatus(state: string, text: string): void {
    statusEl.dataset.state = state;
    statusEl.textContent = text;
  }

  function updateRtcStatus(st: RtcState): void {
    const map: Record<RtcState, [string, string]> = {
      idle: ["idle", "未连接"],
      signaling: ["connecting", "信令连接中…"],
      connecting: ["connecting", "WebRTC 握手中…"],
      connected: ["connected", "WebRTC: connected"],
      failed: ["error", "WebRTC: failed"],
      closed: ["error", "已断开"],
    };
    const [state, label] = map[st];
    setStatus(state, label);
  }

  async function handleDataChannelMessage(
    raw: string,
    s: ConnectionSettings,
  ): Promise<void> {
    const msg = parseChatMessage(raw);
    if (!msg) return;

    if (msg.type === "chat.user" && s.role === "host") {
      appendMessage(messagesEl, "user", `[对端] ${msg.text}`);
      const send = (r: string) => session?.sendText(r);
      const usedAgent = await runHostAgentBridge(msg, {
        signalUrl: s.signalUrl,
        roomToken: s.roomToken,
        send: send!,
      });
      if (!usedAgent) echoReply(msg, send!);
      return;
    }

    if (msg.type === "chat.assistant.delta") {
      if (!streamingEl) {
        streamingEl = appendMessage(messagesEl, "assistant", "");
      }
      streamingEl.textContent += msg.delta;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    if (msg.type === "chat.assistant.done") {
      if (streamingEl && msg.text && !streamingEl.textContent) {
        streamingEl.textContent = msg.text;
      }
      streamingEl = null;
      appendMessage(messagesEl, "system", `完成 runId=${msg.runId}`);
      return;
    }

    if (msg.type === "chat.error") {
      streamingEl = null;
      appendMessage(
        messagesEl,
        "error",
        `${msg.code ?? "ERROR"}: ${msg.message}`,
      );
    }
  }
}

function renderConnectForm(
  el: HTMLElement,
  settings: ConnectionSettings,
  onConnect: (s: ConnectionSettings) => void,
): void {
  el.innerHTML = `
    <label>信令地址 (WebSocket)</label>
    <input id="signal-url" value="${escapeAttr(settings.signalUrl)}" />
    <label>房间令牌</label>
    <input id="room-token" value="${escapeAttr(settings.roomToken)}" placeholder="公网必填" />
    <label>房间 ID</label>
    <input id="room-id" value="${escapeAttr(settings.roomId)}" />
    <label>角色</label>
    <select id="role">
      <option value="mobile" ${settings.role === "mobile" ? "selected" : ""}>手机（发起方）</option>
      <option value="host" ${settings.role === "host" ? "selected" : ""}>Mac 宿主</option>
    </select>
    <button type="button" id="connect-btn">连接</button>
    <p class="hint">GitHub Pages 仅托管本页面；信令须在 Mac 运行 <code>pnpm dev:host</code>。局域网用 <code>ws://&lt;Mac IP&gt;:8787/ws</code>。</p>
  `;

  el.querySelector("#connect-btn")?.addEventListener("click", () => {
    const signalUrl = (el.querySelector("#signal-url") as HTMLInputElement).value.trim();
    const roomToken = (el.querySelector("#room-token") as HTMLInputElement).value.trim();
    const roomId = (el.querySelector("#room-id") as HTMLInputElement).value.trim();
    const role = (el.querySelector("#role") as HTMLSelectElement).value as
      | "mobile"
      | "host";
    onConnect({ signalUrl, roomToken, roomId, role });
  });
}

function appendMessage(
  container: HTMLElement,
  kind: "user" | "assistant" | "system" | "error",
  text: string,
): HTMLDivElement {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
