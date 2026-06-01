import type { WebSocket } from "ws";
import type { PeerRole } from "@webrtc-ai-console/shared";

export interface RoomPeer {
  ws: WebSocket;
  role: PeerRole;
  roomId: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, Map<PeerRole, RoomPeer>>();

  join(roomId: string, role: PeerRole, ws: WebSocket): "ok" | "full" {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    if (room.has(role)) return "full";
    room.set(role, { ws, role, roomId });
    return "ok";
  }

  leave(ws: WebSocket): { roomId: string; role: PeerRole } | null {
    for (const [roomId, peers] of this.rooms) {
      for (const [role, peer] of peers) {
        if (peer.ws === ws) {
          peers.delete(role);
          if (peers.size === 0) this.rooms.delete(roomId);
          return { roomId, role };
        }
      }
    }
    return null;
  }

  getPeer(roomId: string, role: PeerRole): RoomPeer | undefined {
    return this.rooms.get(roomId)?.get(role);
  }

  getOtherPeer(roomId: string, selfRole: PeerRole): RoomPeer | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const otherRole: PeerRole = selfRole === "mobile" ? "host" : "mobile";
    return room.get(otherRole);
  }

  broadcastToRoom(
    roomId: string,
    exclude: WebSocket,
    payload: string,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const peer of room.values()) {
      if (peer.ws !== exclude && peer.ws.readyState === peer.ws.OPEN) {
        peer.ws.send(payload);
      }
    }
  }
}
