/** DataChannel 应用层消息（手机 ↔ Mac 宿主） */

export type ChatMessage =
  | ChatUserMessage
  | ChatAssistantDeltaMessage
  | ChatAssistantDoneMessage
  | ChatErrorMessage;

export interface ChatUserMessage {
  type: "chat.user";
  text: string;
  messageId?: string;
}

export interface ChatAssistantDeltaMessage {
  type: "chat.assistant.delta";
  delta: string;
  runId: string;
}

export interface ChatAssistantDoneMessage {
  type: "chat.assistant.done";
  runId: string;
  text?: string;
}

export interface ChatErrorMessage {
  type: "chat.error";
  code?: string;
  message: string;
  runId?: string;
}

export function parseChatMessage(raw: string): ChatMessage | null {
  try {
    const data = JSON.parse(raw) as ChatMessage;
    if (
      data?.type === "chat.user" ||
      data?.type === "chat.assistant.delta" ||
      data?.type === "chat.assistant.done" ||
      data?.type === "chat.error"
    ) {
      return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function serializeChatMessage(msg: ChatMessage): string {
  return JSON.stringify(msg);
}
