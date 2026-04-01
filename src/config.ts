/**
 * ccs 配置管理
 *
 * ~/.ccs/ 目录结构：
 *   config.json              ← WebDAV 配置 + 时间戳
 *   manifest.json            ← 最近一次索引
 *   sessions-cache.json      ← Session SHA256 缓存（增量判断）
 *   skills/                  ← Skill 文件缓存
 *   sessions/                ← Session 精简内容缓存
 */

import { homedir } from "node:os";
import { join, relative, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import type { Manifest, SkillPackage, SkillFile } from "./manifest.ts";

// ============================================================
// 后端配置（仅 WebDAV）
// ============================================================

export interface WebDavBackend {
  type: "webdav";
  url: string;
  username?: string;
  password?: string;
  /** 远端根路径，默认 /ccs-sync/ */
  path?: string;
}

export interface CcsConfig {
  backend?: WebDavBackend;
  lastPush?: string;
  lastSync?: string;
}

// ============================================================
// 路径
// ============================================================

export function getCcsDir(): string {
  return join(homedir(), ".ccs");
}

export function getConfigPath(): string {
  return join(getCcsDir(), "config.json");
}

export function getManifestPath(): string {
  return join(getCcsDir(), "manifest.json");
}

export function getSkillCacheDir(): string {
  return join(getCcsDir(), "skills");
}

export function getSkillDir(directory: string): string {
  return join(getSkillCacheDir(), directory);
}

// ============================================================
// 配置读写
// ============================================================

export function readConfig(): CcsConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CcsConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: CcsConfig): void {
  const dir = getCcsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function requireBackend(config: CcsConfig): WebDavBackend {
  if (!config.backend) {
    throw new Error(
      "未配置同步后端。请先运行:\n  ccs config set backend webdav\n  ccs config set webdav.url <你的 WebDAV 地址>\n"
    );
  }
  return config.backend;
}

// ============================================================
// Manifest 缓存
// ============================================================

export function readCachedManifest(): Manifest | null {
  const path = getManifestPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Manifest;
  } catch {
    return null;
  }
}

export function writeCachedManifest(manifest: Manifest): void {
  const dir = getCcsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getManifestPath(), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

// ============================================================
// Skill 本地缓存（原始目录结构）
// ============================================================

const EXCLUDE_DIRS = new Set([".git", "__pycache__", "node_modules"]);

/** 将 SkillPackage 展开写入 ~/.ccs/skills/<name>/ 目录 */
export function writeCachedSkillFiles(pkg: SkillPackage): void {
  const skillDir = getSkillDir(pkg.directory);
  for (const file of pkg.files) {
    const filePath = join(skillDir, file.path);
    const fileDir = dirname(filePath);
    if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, file.content, "utf-8");
  }
}

/** 从 ~/.ccs/skills/<name>/ 目录读取并重建 SkillPackage */
export function readCachedSkillPackage(directory: string): SkillPackage | null {
  const skillDir = getSkillDir(directory);
  if (!existsSync(skillDir)) return null;
  try {
    const files = readDirRecursive(skillDir);
    if (files.length === 0) return null;
    return { directory, files };
  } catch {
    return null;
  }
}

// ============================================================
// Session 缓存
// ============================================================

export function getSessionsCachePath(): string {
  return join(getCcsDir(), "sessions-cache.json");
}

export function getSessionCacheDir(): string {
  return join(getCcsDir(), "sessions");
}

/** 读取 sessions-cache.json（sessionId → sha256 映射） */
export function readSessionsCache(): Record<string, { sha256: string }> {
  const path = getSessionsCachePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

/** 写入 sessions-cache.json */
export function writeSessionsCache(cache: Record<string, { sha256: string }>): void {
  const dir = getCcsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getSessionsCachePath(), JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

/** 从 ~/.ccs/sessions/<id>.jsonl 读取缓存的精简 session */
export function readCachedSession(sessionId: string): string | null {
  const filePath = join(getSessionCacheDir(), `${sessionId}.jsonl`);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** 将精简后的 session 写入 ~/.ccs/sessions/<id>.jsonl */
export function writeCachedSession(sessionId: string, content: string): void {
  const dir = getSessionCacheDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sessionId}.jsonl`), content, "utf-8");
}

// ============================================================
// Skill 本地缓存 — 辅助函数
// ============================================================

/** 递归读取目录中的所有文件 */
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
