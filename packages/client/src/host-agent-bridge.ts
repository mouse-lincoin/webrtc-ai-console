import {
  serializeChatMessage,
  type ChatAssistantDeltaMessage,
  type ChatAssistantDoneMessage,
  type ChatErrorMessage,
  type ChatUserMessage,
} from "@webrtc-ai-console/shared";
import { httpBaseFromSignalUrl } from "./storage.js";

/** Mac 宿主浏览器：将 chat.user 转发到 host HTTP Agent，经 SSE 回写 DataChannel */
export async function runHostAgentBridge(
  userMsg: ChatUserMessage,
  opts: {
    signalUrl: string;
    roomToken: string;
    send: (raw: string) => void;
  },
): Promise<boolean> {
  const base = httpBaseFromSignalUrl(opts.signalUrl);
  const url = `${base}/api/agent/run`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: userMsg.text,
        token: opts.roomToken || undefined,
      }),
    });
  } catch {
    return false;
  }

  if (res.status === 503) return false;

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ChatErrorMessage;
    const err: ChatErrorMessage = {
      type: "chat.error",
      code: errBody.code ?? "AGENT_ERROR",
      message: errBody.message ?? `Agent HTTP ${res.status}`,
    };
    opts.send(serializeChatMessage(err));
    return true;
  }

  const reader = res.body?.getReader();
  if (!reader) return false;

  const decoder = new TextDecoder();
  let buffer = "";
  let runId = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data) as Record<string, string>;

      if (event === "delta") {
        runId = runId || "pending";
        const deltaMsg: ChatAssistantDeltaMessage = {
          type: "chat.assistant.delta",
          delta: payload.delta ?? "",
          runId: payload.runId ?? runId,
        };
        if (payload.runId) runId = payload.runId;
        opts.send(serializeChatMessage(deltaMsg));
      } else if (event === "done") {
        runId = payload.runId ?? runId;
        const doneMsg: ChatAssistantDoneMessage = {
          type: "chat.assistant.done",
          runId,
          text: payload.text,
        };
        opts.send(serializeChatMessage(doneMsg));
      } else if (event === "error") {
        const err: ChatErrorMessage = {
          type: "chat.error",
          code: payload.code,
          message: payload.message ?? "Agent error",
          runId: payload.runId,
        };
        opts.send(serializeChatMessage(err));
      }
    }
  }
  return true;
}

export function echoReply(
  userMsg: ChatUserMessage,
  send: (raw: string) => void,
): void {
  const runId = `echo-${Date.now()}`;
  const text = userMsg.text;
  const delta: ChatAssistantDeltaMessage = {
    type: "chat.assistant.delta",
    delta: `Echo: ${text}`,
    runId,
  };
  send(serializeChatMessage(delta));
  const done: ChatAssistantDoneMessage = {
    type: "chat.assistant.done",
    runId,
    text: `Echo: ${text}`,
  };
  send(serializeChatMessage(done));
}
