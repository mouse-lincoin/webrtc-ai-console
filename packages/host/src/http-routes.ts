import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import type { ChatErrorMessage } from "@webrtc-ai-console/shared";
import { appConfig, validateRoomToken } from "./config.js";
import {
  isAgentBusy,
  isAgentConfigured,
  runUserMessage,
} from "./agent/run-user-message.js";
import { buildIceServersForClient } from "./turn/credentials.js";

function setCors(res: ServerResponse, origin: string | undefined): void {
  const allowed = origin && appConfig.publicOrigins.includes(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin && appConfig.publicOrigins.length > 0) {
    res.setHeader("Access-Control-Allow-Origin", appConfig.publicOrigins[0]!);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    setCors(res, origin);
    res.writeHead(204);
    res.end();
    return true;
  }

  const host = req.headers.host ?? `localhost:${appConfig.port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const path = url.pathname;

  if (path === "/health") {
    setCors(res, origin);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        agent: isAgentConfigured(),
        turn: appConfig.turnUrls.length > 0,
        turnAuth: Boolean(appConfig.turnAuthSecret),
        roomTokenRequired: Boolean(appConfig.roomAccessToken),
      }),
    );
    return true;
  }

  if (path === "/api/ice") {
    setCors(res, origin);
    const token = url.searchParams.get("token") ?? undefined;
    if (!validateRoomToken(token ?? undefined)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid token" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        iceServers: buildIceServersForClient(
          appConfig.turnUrls,
          appConfig.turnAuthSecret,
        ),
      }),
    );
    return true;
  }

  if (path === "/api/agent/run" && req.method === "POST") {
    setCors(res, origin);
    const body = await readBody(req);
    let payload: { text?: string; token?: string };
    try {
      payload = JSON.parse(body) as { text?: string; token?: string };
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return true;
    }

    if (!validateRoomToken(payload.token)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid token" }));
      return true;
    }

    const text = payload.text?.trim();
    if (!text) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "text required" }));
      return true;
    }

    if (!isAgentConfigured()) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent not configured" }));
      return true;
    }

    if (isAgentBusy()) {
      const err: ChatErrorMessage = {
        type: "chat.error",
        code: "BUSY",
        message: "Agent is busy",
      };
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify(err));
      return true;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    await runUserMessage(text, {
      onDelta: (delta) => send("delta", { delta }),
      onDone: ({ runId, text: finalText }) =>
        send("done", { runId, text: finalText }),
      onError: (err, phase) =>
        send("error", { message: err.message, code: phase === "runtime" && err.message === "BUSY" ? "BUSY" : "AGENT_ERROR", phase }),
    });

    res.end();
    return true;
  }

  return false;
}
