/**
 * ccs 配置管理
 * 配置文件存储在 ~/.ccs/config.json
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface GistBackend {
  type: "gist";
  token: string;
  gistId?: string; // 首次 push 后自动记录
}

export interface WebDavBackend {
  type: "webdav";
  url: string;
  username?: string;
  password?: string;
  path?: string; // 远端存放路径，默认 /ccs-sync/bundle.json
}

export interface LocalBackend {
  type: "local";
  path: string; // 本地文件路径，手动通过网盘同步
}

export type SyncBackend = GistBackend | WebDavBackend | LocalBackend;

export interface CcsConfig {
  backend?: SyncBackend;
  /** 上次 push 时间（ISO） */
  lastPush?: string;
  /** 上次 sync 时间（ISO） */
  lastSync?: string;
}

// ---- 路径 ----

export function getCcsDir(): string {
  return join(homedir(), ".ccs");
}

export function getConfigPath(): string {
  return join(getCcsDir(), "config.json");
}

// ---- 读写 ----

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

// ---- Bundle 缓存 ----

export function getBundlePath(): string {
  return join(getCcsDir(), "bundle.json");
}

export function readCachedBundle(): import("./bundle.ts").SyncBundle | null {
  const path = getBundlePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function writeCachedBundle(bundle: import("./bundle.ts").SyncBundle): void {
  const dir = getCcsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getBundlePath(), JSON.stringify(bundle, null, 2) + "\n", "utf-8");
}

// ---- 后端 ----

export function requireBackend(config: CcsConfig): SyncBackend {
  if (!config.backend) {
    throw new Error(
      "未配置同步后端。请先运行:\n  ccs config set backend gist|webdav|local\n"
    );
  }
  return config.backend;
}
