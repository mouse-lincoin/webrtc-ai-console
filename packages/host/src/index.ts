import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { appConfig } from "./config.js";
import { handleHttp } from "./http-routes.js";
import { RoomManager } from "./signaling/rooms.js";
import { attachSignalingServer } from "./signaling/ws-handler.js";

const rooms = new RoomManager();
const server = createServer(async (req, res) => {
  try {
    const handled = await handleHttp(req, res);
    if (!handled) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  } catch (err) {
    console.error("[http]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }
});

const wss = new WebSocketServer({ noServer: true });
attachSignalingServer(wss, rooms);

server.on("upgrade", (req, socket, head) => {
  const host = req.headers.host ?? `localhost:${appConfig.port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(appConfig.port, () => {
  console.log(`[host] http://localhost:${appConfig.port}`);
  console.log(`[host] ws://localhost:${appConfig.port}/ws`);
  console.log(
    `[host] agent=${appConfig.cursorApiKey ? "enabled" : "echo-only (no CURSOR_API_KEY)"}`,
  );
  if (appConfig.roomAccessToken) {
    console.log("[host] ROOM_ACCESS_TOKEN is set");
  }
});
