/**
 * 共享的预览展示和条目选择函数
 * 用于 push 和 sync 命令
 */

import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import type { McpEntry } from "./readers/mcp.ts";
import type { PromptEntry } from "./readers/prompt.ts";
import type { SkillMeta } from "./readers/skill.ts";
import { Paths, ALL_APPS, type AppName } from "./readers/paths.ts";

// ============================================================
// 客户端选择器
// ============================================================

const APP_LABELS: Record<AppName, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

export async function selectTargetApps(): Promise<AppName[] | null> {
  // 检测已安装的客户端
  const detected = ALL_APPS.filter((app) => existsSync(Paths[app].dir()));

  const options = ALL_APPS.map((app) => {
    const installed = detected.includes(app);
    return {
      value: app,
      label: APP_LABELS[app],
      hint: installed ? Paths[app].dir() : "未检测到",
    };
  });

  const result = await p.multiselect({
    message: "同步到哪些客户端？",
    options,
    initialValues: detected,
    required: true,
  });
  if (p.isCancel(result)) return null;
  return result;
}

// ============================================================
// 带全选/自定义的 multiselect 流程
// 先选模式（全选 or 自定义），再进入对应的 multiselect
// ============================================================

interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

async function multiselectWithAllToggle(
  message: string,
  options: SelectOption[],
): Promise<string[] | null> {
  const mode = await p.select({
    message,
    options: [
      { value: "all", label: "全部选择", hint: `共 ${options.length} 项，直接回车确认` },
      { value: "custom", label: "自定义选择", hint: "逐项勾选" },
    ],
  });
  if (p.isCancel(mode)) return null;

  if (mode === "all") {
    // 全选模式：所有条目预选，用户可取消不需要的
    const result = await p.multiselect({
      message: `${message}（取消不需要的）`,
      options,
      initialValues: options.map((o) => o.value),
      required: true,
    });
    if (p.isCancel(result)) return null;
    return result;
  }

  // 自定义模式：空选，用户逐项勾选
  const result = await p.multiselect({
    message: `${message}（勾选需要的）`,
    options,
    required: true,
  });
  if (p.isCancel(result)) return null;
  return result;
}

// ============================================================
// 条目选择器
// ============================================================

export async function selectMcpEntries(
  entries: McpEntry[],
): Promise<McpEntry[] | null> {
  const options = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    return { value: e.id, label: e.id, hint: apps };
  });

  const selected = await multiselectWithAllToggle("MCP 服务器", options);
  if (selected === null) return null;
  const ids = new Set(selected);
  return entries.filter((e) => ids.has(e.id));
}

export async function selectPromptEntries(
  entries: PromptEntry[],
): Promise<PromptEntry[] | null> {
  const options = entries.map((e) => {
    const lines = e.content.split("\n").length;
    return { value: e.app, label: e.app, hint: `${lines} 行` };
  });

  const selected = await multiselectWithAllToggle("Prompt", options);
  if (selected === null) return null;
  const apps = new Set(selected);
  return entries.filter((e) => apps.has(e.app));
}

export async function selectSkillEntries(
  entries: SkillMeta[],
): Promise<SkillMeta[] | null> {
  const options = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const hint = e.description
      ? `${e.description.slice(0, 30)}${e.description.length > 30 ? "…" : ""} | ${apps}`
      : apps;
    return { value: e.directory, label: e.name || e.directory, hint };
  });

  const selected = await multiselectWithAllToggle("Skill", options);
  if (selected === null) return null;
  const dirs = new Set(selected);
  return entries.filter((e) => dirs.has(e.directory));
}

// ============================================================
// 预览
// ============================================================

export function previewMcp(entries: McpEntry[]): void {
  if (entries.length === 0) return;

  const lines = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const type = e.type ?? "stdio";
    const target = e.command
      ? `${e.command}${e.args?.length ? " " + e.args.join(" ") : ""}`
      : e.url ?? "";
    return `  ${e.id} (${type})\n    命令: ${target}\n    应用: ${apps}`;
  });

  p.log.step(`MCP 服务器 (${entries.length} 个):\n${lines.join("\n")}`);
}

export function previewPrompts(entries: PromptEntry[]): void {
  if (entries.length === 0) return;

  for (const e of entries) {
    const separator = "─".repeat(40);
    p.log.step(
      `Prompt [${e.app}] (${e.content.split("\n").length} 行):\n` +
      `${separator}\n${e.content}\n${separator}`
    );
  }
}

export function previewSkills(entries: SkillMeta[]): void {
  if (entries.length === 0) return;

  const lines = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const repo = e.repo ? `${e.repo.owner}/${e.repo.name}` : "本地";
    return `  ${e.name || e.directory}\n    目录: ${e.directory} | 来源: ${repo}\n    应用: ${apps}`;
  });

  p.log.step(`Skill (${entries.length} 个):\n${lines.join("\n")}`);
}
