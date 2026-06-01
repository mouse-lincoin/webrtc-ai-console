const KEYS = {
  signalUrl: "wac.signalUrl",
  roomToken: "wac.roomToken",
  roomId: "wac.roomId",
  role: "wac.role",
} as const;

export interface ConnectionSettings {
  signalUrl: string;
  roomToken: string;
  roomId: string;
  role: "mobile" | "host";
}

export function loadSettings(): ConnectionSettings {
  const defaultSignal =
    import.meta.env.VITE_SIGNAL_URL ?? "ws://localhost:8787/ws";
  const defaultToken = import.meta.env.VITE_ROOM_TOKEN ?? "";
  return {
    signalUrl: localStorage.getItem(KEYS.signalUrl) ?? defaultSignal,
    roomToken: localStorage.getItem(KEYS.roomToken) ?? defaultToken,
    roomId: localStorage.getItem(KEYS.roomId) ?? "demo-room",
    role:
      (localStorage.getItem(KEYS.role) as ConnectionSettings["role"]) ??
      "mobile",
  };
}

export function saveSettings(s: ConnectionSettings): void {
  localStorage.setItem(KEYS.signalUrl, s.signalUrl);
  localStorage.setItem(KEYS.roomToken, s.roomToken);
  localStorage.setItem(KEYS.roomId, s.roomId);
  localStorage.setItem(KEYS.role, s.role);
}

export function httpBaseFromSignalUrl(signalUrl: string): string {
  const u = new URL(signalUrl.replace(/^ws/, "http"));
  u.pathname = "";
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}
