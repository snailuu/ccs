/**
 * 读取各 AI 客户端的 Skill 元数据
 *
 * 同步策略：只同步元数据（仓库地址/目录），目标机器重新安装
 *
 * Skill 目录结构（SSOT: ~/.cc-switch/skills/<name>/SKILL.md）
 * 各应用目录为 symlink 或 copy：
 *   ~/.claude/skills/<name>/
 *   ~/.codex/skills/<name>/
 *   ~/.gemini/skills/<name>/
 *   ~/.config/opencode/skills/<name>/
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Paths, type AppName } from "./paths.ts";

export interface SkillMeta {
  /** 目录名（安装名） */
  directory: string;
  /** 从 SKILL.md 解析的显示名称 */
  name: string;
  /** 从 SKILL.md 解析的描述 */
  description: string;
  /** 仓库信息（来自 ~/.agents/.skill-lock.json 或 SKILL.md header） */
  repo?: {
    owner: string;
    name: string;
    branch?: string;
  };
  /** 该 skill 在哪些应用中启用 */
  apps: {
    claude: boolean;
    codex: boolean;
    gemini: boolean;
    opencode: boolean;
  };
}

const SSOT_DIR = join(homedir(), ".cc-switch", "skills");

/** 从 SKILL.md 提取 name 和 description */
function parseSkillMd(
  path: string,
  fallbackName: string
): { name: string; description: string } {
  if (!existsSync(path)) return { name: fallbackName, description: "" };
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n");
  // 第一个 # 开头行作为名称
  const nameLine = lines.find((l) => l.startsWith("# "));
  const name = nameLine ? nameLine.replace(/^#\s+/, "").trim() : fallbackName;
  // 第一段非空、非标题的文字作为描述
  let desc = "";
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    desc = line.trim();
    break;
  }
  return { name, description: desc };
}

/** 解析 ~/.agents/.skill-lock.json，获取仓库信息 */
function parseSkillLock(): Record<string, { owner: string; name: string; branch?: string }> {
  const lockPath = join(homedir(), ".agents", ".skill-lock.json");
  if (!existsSync(lockPath)) return {};
  try {
    const json = JSON.parse(readFileSync(lockPath, "utf-8"));
    const result: Record<string, { owner: string; name: string; branch?: string }> = {};
    const skills = json?.skills ?? {};
    for (const [dirName, skill] of Object.entries(skills) as [string, any][]) {
      if (skill.source_type !== "github" || !skill.source) continue;
      const [owner, repo] = skill.source.split("/");
      if (!owner || !repo) continue;
      result[dirName] = {
        owner,
        name: repo,
        branch: skill.branch ?? skill.source_branch ?? undefined,
      };
    }
    return result;
  } catch {
    return {};
  }
}

/** 检查某个 app 的 skills 目录中是否有该 skill */
function isSkillEnabledForApp(directory: string, app: AppName): boolean {
  const appSkillsDir = Paths[app].skills();
  return existsSync(join(appSkillsDir, directory));
}

/** 从 SSOT 扫描所有已安装的 skill 元数据 */
export function readAllSkills(): SkillMeta[] {
  if (!existsSync(SSOT_DIR)) return [];

  const lock = parseSkillLock();
  const entries: SkillMeta[] = [];

  for (const dir of readdirSync(SSOT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const directory = dir.name;
    const skillMdPath = join(SSOT_DIR, directory, "SKILL.md");
    const { name, description } = parseSkillMd(skillMdPath, directory);

    entries.push({
      directory,
      name,
      description,
      repo: lock[directory],
      apps: {
        claude: isSkillEnabledForApp(directory, "claude"),
        codex: isSkillEnabledForApp(directory, "codex"),
        gemini: isSkillEnabledForApp(directory, "gemini"),
        opencode: isSkillEnabledForApp(directory, "opencode"),
      },
    });
  }

  return entries;
}
