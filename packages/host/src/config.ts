import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(hostRoot, ".env") });

function parseOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://mouse-lincoin.github.io",
    ];
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseTurnUrls(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const appConfig = {
  port: Number(process.env.HOST_PORT ?? 8787),
  roomAccessToken: process.env.ROOM_ACCESS_TOKEN?.trim() || "",
  cursorApiKey: process.env.CURSOR_API_KEY?.trim() || "",
  agentCwd: process.env.AGENT_CWD?.trim() || process.cwd(),
  agentModelId: process.env.AGENT_MODEL_ID?.trim() || "composer-2.5",
  turnUrls: parseTurnUrls(process.env.TURN_URLS),
  turnAuthSecret: process.env.TURN_AUTH_SECRET?.trim() || "",
  publicOrigins: parseOrigins(process.env.PUBLIC_ORIGIN),
};

export function validateRoomToken(token: string | undefined): boolean {
  if (!appConfig.roomAccessToken) return true;
  return token === appConfig.roomAccessToken;
}
