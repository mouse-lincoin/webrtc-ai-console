/** WebSocket 信令消息 */

export type PeerRole = "mobile" | "host";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SessionDescriptionInit {
  type?: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface IceCandidateInitPayload {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalingClientMessage =
  | JoinMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage;

export type SignalingServerMessage =
  | JoinedMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | PeerLeftMessage
  | ErrorMessage;

export interface JoinMessage {
  type: "join";
  roomId: string;
  role: PeerRole;
  token?: string;
}

export interface JoinedMessage {
  type: "joined";
  roomId: string;
  role: PeerRole;
  iceServers: IceServerConfig[];
}

export interface OfferMessage {
  type: "offer";
  sdp: SessionDescriptionInit;
}

export interface AnswerMessage {
  type: "answer";
  sdp: SessionDescriptionInit;
}

export interface IceCandidateMessage {
  type: "ice-candidate";
  candidate: IceCandidateInitPayload;
}

export interface PeerLeftMessage {
  type: "peer-left";
  role?: PeerRole;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type SignalingMessage =
  | SignalingClientMessage
  | SignalingServerMessage;

export function isSignalingMessage(data: unknown): data is SignalingMessage {
  if (!data || typeof data !== "object") return false;
  const t = (data as { type?: string }).type;
  return (
    t === "join" ||
    t === "joined" ||
    t === "offer" ||
    t === "answer" ||
    t === "ice-candidate" ||
    t === "peer-left" ||
    t === "error"
  );
}
