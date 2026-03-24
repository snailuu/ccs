/**
 * ccs update - 自动检测并更新到最新版本
 *
 * 仅支持通过 sh.snailuu.cn 安装的单文件二进制自更新。
 */

import * as p from "@clack/prompts";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";

const CDN_BASE = process.env.CCS_CDN_BASE?.trim() || "https://sh.snailuu.cn";

export interface UpdateManifestFile {
  url: string;
}

export interface UpdateManifest {
  version: string;
  publishedAt?: string;
  files: Record<string, UpdateManifestFile>;
}

interface FileOps {
  exists: (path: string) => boolean;
  rename: (oldPath: string, newPath: string) => void;
  unlink: (path: string) => void;
}

const defaultFileOps: FileOps = {
  exists: existsSync,
  rename: renameSync,
  unlink: unlinkSync,
};

function formatVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/** 简单语义化版本比较，返回 1(a>b) / 0(a==b) / -1(a<b) */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".").map(Number);
  const pb = normalizeVersion(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/** 检测当前平台标识，与 install.sh / release.yml 保持一致 */
export function detectPlatformKey(): string {
  const os = process.platform === "darwin"
    ? "darwin"
    : process.platform === "linux"
    ? "linux"
    : process.platform === "win32"
    ? "windows"
    : null;
  if (!os) throw new Error(`不支持的操作系统: ${process.platform}`);

  const arch = process.arch === "x64"
    ? "x64"
    : process.arch === "arm64"
    ? "arm64"
    : null;
  if (!arch) throw new Error(`不支持的架构: ${process.arch}`);

  return `${os}-${arch}`;
}

export function resolveInstalledBinaryPath(
  currentVersion: string,
  execPathValue = process.execPath,
  argv0Value = process.argv[0] ?? ""
): string {
  const execBase = basename(execPathValue).toLowerCase();
  const argvBase = basename(argv0Value).toLowerCase();
  const isBunRuntime = execBase === "bun" || execBase === "bun.exe" || argvBase === "bun" || argvBase === "bun.exe";

  if (currentVersion === "dev" || isBunRuntime) {
    throw new Error("当前不是通过 sh.snailuu.cn 安装的单文件二进制，无法自动更新");
  }

  if (execBase !== "ccs" && execBase !== "ccs.exe") {
    throw new Error("当前运行文件不是 ccs 单文件二进制，无法自动更新");
  }

  return execPathValue;
}

export async function fetchLatestManifest(): Promise<UpdateManifest> {
  const res = await fetch(`${CDN_BASE}/ccs/latest/manifest.json`, {
    headers: { "User-Agent": "ccs-cli" },
  });
  if (!res.ok) {
    throw new Error(`无法获取最新版本信息 (HTTP ${res.status})`);
  }

  const manifest = await res.json() as Partial<UpdateManifest>;
  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("manifest 缺少 version");
  }
  if (!manifest.files || typeof manifest.files !== "object") {
    throw new Error("manifest 缺少 files");
  }

  return manifest as UpdateManifest;
}

function ensureBinaryPathWritable(binaryPath: string): void {
  accessSync(dirname(binaryPath), constants.W_OK);
}

function cleanupFile(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {}
}

export function replaceBinaryAtomically(
  binaryPath: string,
  tmpPath: string,
  ops: FileOps = defaultFileOps
): void {
  const backupPath = `${binaryPath}.bak-${process.pid}`;
  let backupCreated = false;

  try {
    ops.rename(binaryPath, backupPath);
    backupCreated = true;
    ops.rename(tmpPath, binaryPath);
  } catch (error) {
    try {
      if (ops.exists(tmpPath)) ops.unlink(tmpPath);
    } catch {}

    if (backupCreated && !ops.exists(binaryPath) && ops.exists(backupPath)) {
      try {
        ops.rename(backupPath, binaryPath);
      } catch (restoreError) {
        const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`替换失败，且回滚旧版本也失败: ${originalMessage}; rollback: ${restoreMessage}`);
      }
    }

    throw error instanceof Error ? error : new Error(String(error));
  }

  try {
    if (backupCreated && ops.exists(backupPath)) ops.unlink(backupPath);
  } catch {}
}

function buildManualUpdateHint(binaryPath: string, downloadUrl: string): string {
  const quotedPath = `"${binaryPath.replace(/"/g, '\\"')}"`;
  if (binaryPath.toLowerCase().endsWith(".exe")) {
    return `curl -fsSL -o ${quotedPath} ${downloadUrl}`;
  }
  return `curl -fsSL -o ${quotedPath} ${downloadUrl}\nchmod +x ${quotedPath}`;
}

function verifyDownloadedBinary(tmpPath: string): string {
  return execFileSync(tmpPath, ["--version"], { encoding: "utf-8" }).trim();
}

export async function updateCommand(currentVersion: string): Promise<void> {
  p.intro("ccs 更新检测");

  let binaryPath: string;
  try {
    binaryPath = resolveInstalledBinaryPath(currentVersion);
    ensureBinaryPathWritable(binaryPath);
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    p.outro("更新检测结束");
    process.exit(1);
  }

  const platformKey = detectPlatformKey();
  const s = p.spinner();
  s.start("正在检查最新版本...");

  let manifest: UpdateManifest;
  try {
    manifest = await fetchLatestManifest();
  } catch (err) {
    s.stop("检查失败");
    p.log.error(`无法获取最新版本: ${err instanceof Error ? err.message : String(err)}`);
    p.outro("更新检测结束");
    process.exit(1);
  }

  const latestVersion = manifest.version;
  const currentVersionText = formatVersion(currentVersion);
  const latestVersionText = formatVersion(latestVersion);
  const currentFile = manifest.files[platformKey];

  if (!currentFile?.url) {
    s.stop("检查失败");
    p.log.error(`当前平台 ${platformKey} 暂不支持自动更新`);
    p.outro("更新检测结束");
    process.exit(1);
  }

  s.stop(`最新版本: ${latestVersionText}`);
  p.log.info(`当前版本: ${currentVersionText}`);
  if (manifest.publishedAt) {
    p.log.info(`发布时间: ${manifest.publishedAt}`);
  }

  const cmp = compareVersions(latestVersion, currentVersion);
  if (cmp <= 0) {
    p.log.success("已经是最新版本，无需更新");
    p.outro("更新检测结束");
    return;
  }

  const confirmed = await p.confirm({
    message: `发现新版本 ${latestVersionText}，是否立即更新？`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.outro("已取消更新");
    return;
  }

  const downloadUrl = currentFile.url;
  const tmpPath = `${binaryPath}.tmp-${process.pid}`;

  s.start(`正在下载 ccs ${latestVersionText} (${platformKey})...`);
  try {
    const res = await fetch(downloadUrl, {
      headers: { "User-Agent": "ccs-cli" },
    });
    if (!res.ok) {
      throw new Error(`下载失败 (HTTP ${res.status}): ${downloadUrl}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(tmpPath, buffer);
    chmodSync(tmpPath, 0o755);
  } catch (err) {
    s.stop("下载失败");
    cleanupFile(tmpPath);
    p.log.error(err instanceof Error ? err.message : String(err));
    p.outro("更新失败");
    process.exit(1);
  }

  s.stop("下载完成");

  try {
    const output = verifyDownloadedBinary(tmpPath);
    p.log.info(`新版本验证: ${output}`);
  } catch (err) {
    cleanupFile(tmpPath);
    p.log.error(`新版本校验失败: ${err instanceof Error ? err.message : String(err)}`);
    p.outro("更新失败");
    process.exit(1);
  }

  s.start("正在替换二进制文件...");
  try {
    replaceBinaryAtomically(binaryPath, tmpPath);
  } catch (err) {
    s.stop("替换失败");
    p.log.error(`替换二进制文件失败: ${err instanceof Error ? err.message : String(err)}`);
    p.log.warn(`你可以手动执行以下命令更新:\n${buildManualUpdateHint(binaryPath, downloadUrl)}`);
    p.outro("更新失败");
    process.exit(1);
  }

  s.stop("替换完成");
  p.log.success(`已更新到 ${latestVersionText}`);
  p.outro("更新完成");
}
