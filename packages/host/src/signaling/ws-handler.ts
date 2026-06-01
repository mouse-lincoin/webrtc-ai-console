import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import {
  isSignalingMessage,
  type JoinMessage,
  type PeerRole,
} from "@webrtc-ai-console/shared";
import { appConfig, validateRoomToken } from "../config.js";
import { buildIceServers } from "../turn/credentials.js";
import { RoomManager } from "./rooms.js";

interface PeerContext {
  roomId: string;
  role: PeerRole;
}

export function attachSignalingServer(
  wss: WebSocketServer,
  rooms: RoomManager,
): void {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let ctx: PeerContext | null = null;

    ws.on("message", (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(String(raw));
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (!isSignalingMessage(data)) {
        ws.send(JSON.stringify({ type: "error", message: "Unknown message" }));
        return;
      }

      if (data.type === "join") {
        const joined = handleJoin(ws, data, rooms);
        if (joined) ctx = joined;
        return;
      }

      if (!ctx) {
        ws.send(JSON.stringify({ type: "error", message: "Join first" }));
        return;
      }

      if (
        data.type === "offer" ||
        data.type === "answer" ||
        data.type === "ice-candidate"
      ) {
        const other = rooms.getOtherPeer(ctx.roomId, ctx.role);
        if (other?.ws.readyState === ws.OPEN) {
          other.ws.send(JSON.stringify(data));
        }
      }
    });

    ws.on("close", () => {
      const left = rooms.leave(ws);
      if (left) {
        const other = rooms.getOtherPeer(left.roomId, left.role);
        if (other && other.ws.readyState === other.ws.OPEN) {
          other.ws.send(
            JSON.stringify({ type: "peer-left", role: left.role }),
          );
        }
      }
    });
  });
}

function handleJoin(
  ws: WebSocket,
  msg: JoinMessage,
  rooms: RoomManager,
): PeerContext | null {
  const roomId = msg.roomId?.trim();
  if (!roomId) {
    ws.send(JSON.stringify({ type: "error", message: "roomId required" }));
    return null;
  }
  if (msg.role !== "mobile" && msg.role !== "host") {
    ws.send(JSON.stringify({ type: "error", message: "Invalid role" }));
    return null;
  }
  if (!validateRoomToken(msg.token)) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid room token" }));
    return null;
  }

  const result = rooms.join(roomId, msg.role, ws);
  if (result === "full") {
    ws.send(JSON.stringify({ type: "error", message: "Room full for role" }));
    ws.close();
    return null;
  }

  const iceServers = buildIceServers(
    appConfig.turnUrls,
    appConfig.turnAuthSecret,
  );
  ws.send(
    JSON.stringify({
      type: "joined",
      roomId,
      role: msg.role,
      iceServers,
    }),
  );
  return { roomId, role: msg.role };
}
