import type { IceServerConfig } from "@webrtc-ai-console/shared";
import { SignalingClient } from "./signaling-client.js";

export type RtcState =
  | "idle"
  | "signaling"
  | "connecting"
  | "connected"
  | "failed"
  | "closed";

const CHAT_LABEL = "chat";

export class WebRtcSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private signaling: SignalingClient | null = null;
  private iceServers: IceServerConfig[] = [];
  private state: RtcState = "idle";
  private onState?: (s: RtcState) => void;
  private onMessage?: (raw: string) => void;
  private onSystem?: (text: string) => void;

  constructor(
    private readonly signalUrl: string,
    private readonly roomId: string,
    private readonly role: "mobile" | "host",
    private readonly token: string,
  ) {}

  setHandlers(h: {
    onState?: (s: RtcState) => void;
    onMessage?: (raw: string) => void;
    onSystem?: (text: string) => void;
  }): void {
    this.onState = h.onState;
    this.onMessage = h.onMessage;
    this.onSystem = h.onSystem;
  }

  private setState(s: RtcState): void {
    this.state = s;
    this.onState?.(s);
  }

  async connect(): Promise<void> {
    this.setState("signaling");
    this.signaling = new SignalingClient(
      this.signalUrl,
      this.roomId,
      this.role,
      this.token,
    );

    this.signaling.on("offer", async (msg) => {
      await this.ensurePc();
      await this.pc!.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.signaling!.send({ type: "answer", sdp: answer });
    });

    this.signaling.on("answer", async (msg) => {
      await this.pc?.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
    });

    this.signaling.on("ice-candidate", async (msg) => {
      try {
        await this.pc?.addIceCandidate(msg.candidate);
      } catch {
        /* ignore late candidates */
      }
    });

    this.signaling.on("peer-left", () => {
      this.onSystem?.("对端已离开");
      this.setState("closed");
    });

    const joined = await this.signaling.connect();
    this.iceServers = joined.iceServers;
    await this.ensurePc();

    if (this.role === "mobile") {
      this.dc = this.pc!.createDataChannel(CHAT_LABEL);
      this.wireDataChannel(this.dc);
      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      this.signaling.send({ type: "offer", sdp: offer });
    } else {
      this.pc!.ondatachannel = (ev) => {
        this.dc = ev.channel;
        this.wireDataChannel(this.dc);
      };
    }

    this.setState("connecting");
  }

  private async ensurePc(): Promise<void> {
    if (this.pc) return;
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.signaling) {
        this.signaling.send({
          type: "ice-candidate",
          candidate: ev.candidate.toJSON(),
        });
      }
    };
    this.pc.onconnectionstatechange = () => {
      const cs = this.pc?.connectionState;
      if (cs === "connected") this.setState("connected");
      if (cs === "failed" || cs === "disconnected") {
        this.setState("failed");
        this.onSystem?.(`WebRTC: ${cs}`);
      }
    };
  }

  private wireDataChannel(dc: RTCDataChannel): void {
    dc.onopen = () => this.setState("connected");
    dc.onmessage = (ev) => this.onMessage?.(String(ev.data));
    dc.onclose = () => this.onSystem?.("DataChannel 已关闭");
  }

  sendText(raw: string): void {
    if (this.dc?.readyState === "open") {
      this.dc.send(raw);
    }
  }

  disconnect(): void {
    this.dc?.close();
    this.pc?.close();
    this.signaling?.close();
    this.dc = null;
    this.pc = null;
    this.signaling = null;
    this.setState("closed");
  }

  get connectionState(): RtcState {
    return this.state;
  }

  isDataChannelOpen(): boolean {
    return this.dc?.readyState === "open";
  }
}
