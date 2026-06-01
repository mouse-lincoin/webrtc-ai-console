import { createHmac, randomBytes } from "node:crypto";
import type { IceServerConfig } from "@webrtc-ai-console/shared";

const DEFAULT_STUN: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** coturn `static-auth-secret` 临时凭证 */
export function buildTurnCredentials(
  secret: string,
  ttlSeconds = 86400,
): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:webrtc-ai-console`;
  const credential = createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  return { username, credential };
}

export function buildIceServers(
  turnUrls: string[],
  turnAuthSecret: string,
): IceServerConfig[] {
  const servers: IceServerConfig[] = [...DEFAULT_STUN];
  if (turnUrls.length === 0) return servers;

  if (turnAuthSecret) {
    const { username, credential } = buildTurnCredentials(turnAuthSecret);
    for (const url of turnUrls) {
      servers.push({ urls: url, username, credential });
    }
  } else {
    for (const url of turnUrls) {
      servers.push({ urls: url });
    }
  }
  return servers;
}

export function buildIceServersForClient(
  turnUrls: string[],
  turnAuthSecret: string,
): IceServerConfig[] {
  return buildIceServers(turnUrls, turnAuthSecret);
}

export function randomRoomToken(): string {
  return randomBytes(24).toString("base64url");
}
