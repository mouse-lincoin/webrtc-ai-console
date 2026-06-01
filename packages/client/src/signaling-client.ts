import {
  isSignalingMessage,
  type IceServerConfig,
  type JoinedMessage,
  type PeerRole,
  type SignalingMessage,
} from "@webrtc-ai-console/shared";

export type SignalingState = "closed" | "connecting" | "open" | "error";

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(msg: SignalingMessage) => void>>();

  constructor(
    private readonly url: string,
    private readonly roomId: string,
    private readonly role: PeerRole,
    private readonly token: string,
  ) {}

  on<T extends SignalingMessage["type"]>(
    type: T,
    fn: (msg: Extract<SignalingMessage, { type: T }>) => void,
  ): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    const set = this.handlers.get(type)!;
    set.add(fn as (msg: SignalingMessage) => void);
    return () => set.delete(fn as (msg: SignalingMessage) => void);
  }

  connect(): Promise<JoinedMessage> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const timeout = setTimeout(() => {
        reject(new Error("Signaling timeout"));
        this.close();
      }, 15000);

      this.ws.onopen = () => {
        this.send({
          type: "join",
          roomId: this.roomId,
          role: this.role,
          token: this.token || undefined,
        });
      };

      this.ws.onmessage = (ev) => {
        let data: unknown;
        try {
          data = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!isSignalingMessage(data)) return;
        this.emit(data);
        if (data.type === "joined") {
          clearTimeout(timeout);
          resolve(data);
        }
        if (data.type === "error") {
          clearTimeout(timeout);
          reject(new Error(data.message));
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error"));
      };

      this.ws.onclose = () => {
        this.emit({ type: "peer-left" } as SignalingMessage);
      };
    });
  }

  send(msg: SignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  get iceServers(): IceServerConfig[] {
    return [];
  }

  private emit(msg: SignalingMessage): void {
    const set = this.handlers.get(msg.type);
    set?.forEach((fn) => fn(msg));
  }
}
