/**
 * 读取各 AI 客户端的 MCP 配置
 *
 * 数据格式统一为 McpEntry 数组，与云端 bundle 格式对齐。
 */

import { existsSync, readFileSync } from "node:fs";
import { Paths } from "./paths.ts";

export interface McpEntry {
  id: string;
  type?: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string; // sse/http 类型
  apps: {
    claude: boolean;
    codex: boolean;
    gemini: boolean;
    opencode: boolean;
  };
}

// ---- Claude: ~/.claude.json ----

function readClaudeMcp(): McpEntry[] {
  const path = Paths.claude.mcpJson();
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, "utf-8"));
    const servers = json?.mcpServers ?? {};
    return Object.entries(servers).map(([id, spec]: [string, any]) => ({
      id,
      ...specToEntry(spec),
      apps: { claude: true, codex: false, gemini: false, opencode: false },
    }));
  } catch {
    return [];
  }
}

// ---- Codex: ~/.codex/config.toml ----

function readCodexMcp(): McpEntry[] {
  const path = Paths.codex.config();
  if (!existsSync(path)) return [];
  try {
    // 简易 TOML 解析：只提取 [mcp_servers.*] 节
    const text = readFileSync(path, "utf-8");
    return parseCodexTomlMcp(text);
  } catch {
    return [];
  }
}

function parseCodexTomlMcp(text: string): McpEntry[] {
  const entries: McpEntry[] = [];
  const sectionRegex = /^\[mcp_servers\.([^\]]+)\]/gm;
  const lines = text.split("\n");

  for (let match = sectionRegex.exec(text); match !== null; match = sectionRegex.exec(text)) {
    const id = match[1].trim();
    const startLine = text.substring(0, match.index).split("\n").length;
    const sectionLines: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      if (i === startLine) continue; // skip header
      if (lines[i].match(/^\[/)) break;
      sectionLines.push(lines[i]);
    }
    const entry = parseTomlSection(id, sectionLines);
    entries.push(entry);
  }
  return entries;
}

function parseTomlSection(id: string, lines: string[]): McpEntry {
  const kv: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (m) kv[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
  }
  return {
    id,
    type: (kv["type"] as any) ?? "stdio",
    command: kv["command"],
    args: kv["args"] ? JSON.parse(kv["args"]) : undefined,
    apps: { claude: false, codex: true, gemini: false, opencode: false },
  };
}

// ---- Gemini: ~/.gemini/settings.json ----

function readGeminiMcp(): McpEntry[] {
  const path = Paths.gemini.settings();
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, "utf-8"));
    const servers = json?.mcpServers ?? {};
    return Object.entries(servers).map(([id, spec]: [string, any]) => ({
      id,
      ...specToEntry(spec),
      apps: { claude: false, codex: false, gemini: true, opencode: false },
    }));
  } catch {
    return [];
  }
}

// ---- OpenCode: ~/.config/opencode/opencode.json ----

function readOpencodeMcp(): McpEntry[] {
  const path = Paths.opencode.config();
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, "utf-8"));
    // OpenCode 格式: { mcp: { serverName: { type, command, args } } }
    const mcp = json?.mcp ?? {};
    return Object.entries(mcp).map(([id, spec]: [string, any]) => ({
      id,
      ...specToEntry(spec),
      apps: { claude: false, codex: false, gemini: false, opencode: true },
    }));
  } catch {
    return [];
  }
}

// ---- 合并：同一 id 的 apps 字段做 OR 合并 ----

export function readAllMcp(): McpEntry[] {
  const all = [
    ...readClaudeMcp(),
    ...readCodexMcp(),
    ...readGeminiMcp(),
    ...readOpencodeMcp(),
  ];

  const map = new Map<string, McpEntry>();
  for (const entry of all) {
    const existing = map.get(entry.id);
    if (existing) {
      existing.apps.claude ||= entry.apps.claude;
      existing.apps.codex ||= entry.apps.codex;
      existing.apps.gemini ||= entry.apps.gemini;
      existing.apps.opencode ||= entry.apps.opencode;
    } else {
      map.set(entry.id, { ...entry });
    }
  }
  return [...map.values()];
}

function specToEntry(spec: any): Partial<McpEntry> {
  if (!spec || typeof spec !== "object") return {};
  return {
    type: spec.type ?? "stdio",
    command: spec.command,
    args: spec.args,
    env: spec.env,
    url: spec.url,
  };
}
