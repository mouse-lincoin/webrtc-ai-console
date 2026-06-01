#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, "packages/host/.env");
const token = randomBytes(24).toString("base64url");

let content = "";
if (existsSync(envPath)) {
  content = readFileSync(envPath, "utf8");
  if (/^ROOM_ACCESS_TOKEN=.*/m.test(content)) {
    content = content.replace(/^ROOM_ACCESS_TOKEN=.*/m, `ROOM_ACCESS_TOKEN=${token}`);
  } else {
    content = `${content.trimEnd()}\nROOM_ACCESS_TOKEN=${token}\n`;
  }
} else {
  const example = join(root, ".env.example");
  content = existsSync(example)
    ? readFileSync(example, "utf8").replace(/^# packages\/host\/\.env.*\n/, "")
    : "";
  content = `${content.trim()}\nROOM_ACCESS_TOKEN=${token}\n`;
}

writeFileSync(envPath, content, "utf8");
console.log(`已写入 packages/host/.env`);
console.log(`ROOM_ACCESS_TOKEN=${token}`);
