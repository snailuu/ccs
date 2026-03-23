/**
 * 将 bundle 中的 MCP 配置写入各 AI 客户端
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { McpEntry } from "../readers/mcp.ts";
import { Paths } from "../readers/paths.ts";

// ---- 工具函数 ----

function readJson(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

function writeJson(path: string, data: any): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ---- 各客户端写入 ----

function entryToSpec(entry: McpEntry): any {
  const spec: any = { type: entry.type ?? "stdio" };
  if (entry.command) spec.command = entry.command;
  if (entry.args?.length) spec.args = entry.args;
  if (entry.env && Object.keys(entry.env).length) spec.env = entry.env;
  if (entry.url) spec.url = entry.url;
  return spec;
}

function writeClaudeMcp(entries: McpEntry[], dryRun: boolean): number {
  const path = Paths.claude.mcpJson();
  if (!existsSync(Paths.claude.dir()) && !existsSync(path)) return 0;
  const json = readJson(path);
  if (!json.mcpServers) json.mcpServers = {};
  let count = 0;
  for (const e of entries) {
    if (!e.apps.claude) continue;
    json.mcpServers[e.id] = entryToSpec(e);
    count++;
  }
  if (!dryRun) writeJson(path, json);
  return count;
}

function writeCodexMcp(entries: McpEntry[], dryRun: boolean): number {
  const dir = Paths.codex.dir();
  if (!existsSync(dir)) return 0;
  const path = Paths.codex.config();
  // 读取现有 TOML 内容，追加 mcp_servers 节
  let text = existsSync(path) ? readFileSync(path, "utf-8") : "";
  let count = 0;
  for (const e of entries) {
    if (!e.apps.codex) continue;
    const header = `[mcp_servers.${e.id}]`;
    if (!text.includes(header)) {
      const spec = entryToSpec(e);
      const lines = [`\n${header}`];
      if (spec.command) lines.push(`command = "${spec.command}"`);
      if (spec.args) lines.push(`args = ${JSON.stringify(spec.args)}`);
      if (spec.type && spec.type !== "stdio") lines.push(`type = "${spec.type}"`);
      if (spec.url) lines.push(`url = "${spec.url}"`);
      text += lines.join("\n") + "\n";
      count++;
    }
  }
  if (!dryRun && count > 0) writeFileSync(path, text, "utf-8");
  return count;
}

function writeGeminiMcp(entries: McpEntry[], dryRun: boolean): number {
  const dir = Paths.gemini.dir();
  if (!existsSync(dir)) return 0;
  const path = Paths.gemini.settings();
  const json = readJson(path);
  if (!json.mcpServers) json.mcpServers = {};
  let count = 0;
  for (const e of entries) {
    if (!e.apps.gemini) continue;
    json.mcpServers[e.id] = entryToSpec(e);
    count++;
  }
  if (!dryRun) writeJson(path, json);
  return count;
}

function writeOpencodeMcp(entries: McpEntry[], dryRun: boolean): number {
  const dir = Paths.opencode.dir();
  if (!existsSync(dir)) return 0;
  const path = Paths.opencode.config();
  const json = readJson(path);
  if (!json.mcp) json.mcp = {};
  let count = 0;
  for (const e of entries) {
    if (!e.apps.opencode) continue;
    json.mcp[e.id] = entryToSpec(e);
    count++;
  }
  if (!dryRun) writeJson(path, json);
  return count;
}

export function writeMcp(
  entries: McpEntry[],
  dryRun: boolean
): { claude: number; codex: number; gemini: number; opencode: number } {
  return {
    claude: writeClaudeMcp(entries, dryRun),
    codex: writeCodexMcp(entries, dryRun),
    gemini: writeGeminiMcp(entries, dryRun),
    opencode: writeOpencodeMcp(entries, dryRun),
  };
}
