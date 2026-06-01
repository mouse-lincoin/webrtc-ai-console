import { Agent, type SDKAgent, type SDKMessage } from "@cursor/sdk";
import { appConfig } from "../config.js";

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (result: { runId: string; text: string }) => void;
  onError: (err: Error, phase: "startup" | "runtime") => void;
}

let agentPromise: Promise<SDKAgent> | null = null;
let busy = false;

async function getAgent(): Promise<SDKAgent> {
  if (!appConfig.cursorApiKey) {
    throw new Error("CURSOR_API_KEY not configured");
  }
  if (!agentPromise) {
    agentPromise = Agent.create({
      apiKey: appConfig.cursorApiKey,
      model: { id: appConfig.agentModelId },
      local: { cwd: appConfig.agentCwd },
    });
  }
  return agentPromise;
}

function extractAssistantDelta(event: SDKMessage): string {
  if (event.type === "assistant") {
    return event.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  if (event.type === "thinking") {
    return event.text;
  }
  return "";
}

export function isAgentConfigured(): boolean {
  return Boolean(appConfig.cursorApiKey);
}

export function isAgentBusy(): boolean {
  return busy;
}

export async function runUserMessage(
  text: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  if (busy) {
    callbacks.onError(new Error("BUSY"), "runtime");
    return;
  }
  busy = true;
  let runId = "";

  try {
    const agent = await getAgent();
    const run = await agent.send(text);
    runId = run.id;

    for await (const event of run.stream()) {
      const delta = extractAssistantDelta(event);
      if (delta) callbacks.onDelta(delta);
    }

    const result = await run.wait();
    callbacks.onDone({ runId, text: result.result ?? "" });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const phase =
      error.message.includes("CURSOR_API_KEY") ||
      error.message.toLowerCase().includes("api key")
        ? "startup"
        : "runtime";
    if (phase === "startup") agentPromise = null;
    callbacks.onError(error, phase);
  } finally {
    busy = false;
  }
}

export async function disposeAgent(): Promise<void> {
  if (agentPromise) {
    const agent = await agentPromise;
    agent.close();
    agentPromise = null;
  }
}
