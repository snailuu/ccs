/**
 * 扫描本机所有 Skill
 *
 * 扫描来源（对齐 cc-switch Tauri 后端 scan_unmanaged 逻辑）：
 *   1. ~/.agents/skills/ — agents CLI canonical 目录
 *   2. ~/.cc-switch/skills/ — 旧 SSOT
 *   3. 各 agent 的 globalSkillsDir — 跳过 symlink，只收集独立目录
 *
 * 以 directory 名去重，先发现的优先，记录 foundIn。
 */

import { existsSync, readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CANONICAL_SKILLS_DIR, LEGACY_SSOT_DIR, SKILL_LOCK_PATH,
  AGENTS, ALL_AGENT_NAMES,
} from "./paths.ts";
import type { SkillIndex, SkillPackage, SkillFile } from "../manifest.ts";

// ============================================================
// 内部类型：扫描结果（含文件内容）
// ============================================================

export interface ScannedSkill {
  directory: string;
  name: string;
  description: string;
  repo?: { owner: string; name: string; branch?: string };
  sourceUrl?: string;
  sourceType?: "github" | "local" | "unknown";
  agents: Record<string, boolean>;
  foundIn: string[];
  /** skill 目录的绝对路径 */
  path: string;
  files: SkillFile[];
}

// ============================================================
// 递归读取目录
// ============================================================

const EXCLUDE_DIRS = new Set([".git", "__pycache__", "node_modules"]);

function readDirRecursive(dirPath: string, basePath: string = dirPath): SkillFile[] {
  const files: SkillFile[] = [];
  if (!existsSync(dirPath)) return files;

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      files.push(...readDirRecursive(fullPath, basePath));
    } else if (entry.isFile()) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        files.push({ path: relative(basePath, fullPath), content });
      } catch {
        // 跳过无法读取的文件
      }
    }
  }

  return files;
}

// ============================================================
// SKILL.md 解析
// ============================================================

interface SkillMdInfo {
  name: string;
  description: string;
  fmSource?: string;
}

function parseSkillMd(path: string, fallbackName: string): SkillMdInfo {
  if (!existsSync(path)) return { name: fallbackName, description: "" };
  const text = readFileSync(path, "utf-8");

  let fmSource: string | undefined;
  let body = text;
  if (text.startsWith("---")) {
    const endIdx = text.indexOf("\n---", 3);
    if (endIdx !== -1) {
      const fm = text.slice(3, endIdx);
      const sourceMatch = fm.match(/^source:\s*(.+)$/m);
      if (sourceMatch) fmSource = sourceMatch[1].trim().replace(/^["']|["']$/g, "");
      body = text.slice(endIdx + 4);
    }
  }

  const lines = body.split("\n");
  const nameLine = lines.find((l) => l.startsWith("# "));
  const name = nameLine ? nameLine.replace(/^#\s+/, "").trim() : fallbackName;
  let desc = "";
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    desc = line.trim();
    break;
  }
  return { name, description: desc, fmSource };
}

// ============================================================
// Lock 文件解析
// ============================================================

interface LockEntry {
  owner: string;
  name: string;
  branch?: string;
  sourceUrl?: string;
}

function parseSkillLock(): Record<string, LockEntry> {
  if (!existsSync(SKILL_LOCK_PATH)) return {};
  try {
    const json = JSON.parse(readFileSync(SKILL_LOCK_PATH, "utf-8"));
    const result: Record<string, LockEntry> = {};
    for (const [dirName, skill] of Object.entries(json?.skills ?? {}) as [string, any][]) {
      const source: string = skill.source ?? "";
      const sourceType: string = skill.sourceType ?? skill.source_type ?? "";
      const sourceUrl: string = skill.sourceUrl ?? skill.source_url ?? "";

      if (sourceType === "github" && source) {
        const [owner, repo] = source.split("/");
        if (owner && repo) {
          result[dirName] = {
            owner, name: repo,
            branch: skill.branch ?? skill.sourceBranch ?? skill.source_branch ?? undefined,
            sourceUrl,
          };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ============================================================
// 来源检测
// ============================================================

function resolveSource(
  directory: string,
  lock: Record<string, LockEntry>,
  fmSource?: string,
): Pick<ScannedSkill, "repo" | "sourceUrl" | "sourceType"> {
  const lockEntry = lock[directory];
  if (lockEntry) {
    return {
      repo: { owner: lockEntry.owner, name: lockEntry.name, branch: lockEntry.branch },
      sourceUrl: lockEntry.sourceUrl,
      sourceType: "github",
    };
  }

  if (fmSource) {
    const parts = fmSource.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").split("/");
    if (parts.length >= 2) {
      return {
        repo: { owner: parts[0], name: parts[1] },
        sourceUrl: fmSource.startsWith("http") ? fmSource : `https://github.com/${parts[0]}/${parts[1]}`,
        sourceType: "github",
      };
    }
  }

  return { sourceType: "local" };
}

// ============================================================
// Agent 启用检测
// ============================================================

function detectSkillAgents(directory: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const agentName of ALL_AGENT_NAMES) {
    const agent = AGENTS[agentName];
    result[agentName] = existsSync(join(agent.globalSkillsDir, directory));
  }
  return result;
}

// ============================================================
// 多源扫描
// ============================================================

/** 扫描单个目录，返回其中的 skill 目录名列表（跳过 symlink） */
function listSkillDirs(baseDir: string, skipSymlinks: boolean): string[] {
  if (!existsSync(baseDir)) return [];
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => {
        if (skipSymlinks && d.isSymbolicLink()) return false;
        return d.isDirectory() || d.isSymbolicLink();
      })
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** 扫描本机所有 skill 来源，合并去重 */
export function scanAllSkills(): ScannedSkill[] {
  const lock = parseSkillLock();
  const seen = new Map<string, ScannedSkill>();

  // 定义扫描来源（顺序决定优先级）
  const sources: { label: string; dir: string; skipSymlinks: boolean }[] = [
    { label: "agents", dir: CANONICAL_SKILLS_DIR, skipSymlinks: false },
    { label: "cc-switch", dir: LEGACY_SSOT_DIR, skipSymlinks: false },
  ];

  // 各 non-universal agent 的独立目录（跳过 symlink 避免重复）
  for (const agentName of ALL_AGENT_NAMES) {
    const agent = AGENTS[agentName];
    if (!agent.isUniversal) {
      sources.push({ label: agentName, dir: agent.globalSkillsDir, skipSymlinks: true });
    }
  }

  for (const { label, dir, skipSymlinks } of sources) {
    for (const dirName of listSkillDirs(dir, skipSymlinks)) {
      if (seen.has(dirName)) {
        // 已发现，只追加 foundIn
        seen.get(dirName)!.foundIn.push(label);
        continue;
      }

      const skillDir = join(dir, dirName);
      const skillMdPath = join(skillDir, "SKILL.md");
      const { name, description, fmSource } = parseSkillMd(skillMdPath, dirName);
      const source = resolveSource(dirName, lock, fmSource);

      seen.set(dirName, {
        directory: dirName,
        name,
        description,
        ...source,
        agents: detectSkillAgents(dirName),
        foundIn: [label],
        path: skillDir,
        files: readDirRecursive(skillDir),
      });
    }
  }

  return Array.from(seen.values());
}

// ============================================================
// 转换为 Manifest 类型
// ============================================================

/** 将 ScannedSkill 转换为 SkillIndex（元数据，不含文件） */
export function toSkillIndex(skill: ScannedSkill): SkillIndex {
  const totalSize = skill.files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf-8"), 0);
  return {
    directory: skill.directory,
    name: skill.name,
    description: skill.description,
    repo: skill.repo,
    sourceUrl: skill.sourceUrl,
    sourceType: skill.sourceType,
    agents: skill.agents,
    foundIn: skill.foundIn,
    fileCount: skill.files.length,
    totalSize,
  };
}

/** 将 ScannedSkill 转换为 SkillPackage（含完整文件） */
export function toSkillPackage(skill: ScannedSkill): SkillPackage {
  return {
    directory: skill.directory,
    files: skill.files,
  };
}
