#!/usr/bin/env bun
/**
 * ccs - CC Switch Sync CLI
 *
 * 将 MCP、Skill、Prompt 配置在多台机器间同步
 * 支持 GitHub Gist / WebDAV / 本地文件 三种后端
 *
 * 用法:
 *   ccs push              采集本机配置并上传云端
 *   ccs sync              从云端拉取并应用配置到指定 CLI 工具
 *   ccs status            显示本机当前配置摘要
 *   ccs config            查看/设置同步后端
 *   ccs diff              预览本机与云端的差异
 *   ccs update            检查并更新到最新版本
 */

import { pushCommand } from "./src/commands/push.ts";
import { syncCommand } from "./src/commands/sync.ts";
import { statusCommand } from "./src/commands/status.ts";
import { configCommand } from "./src/commands/config.ts";
import { diffCommand } from "./src/commands/diff.ts";
import { updateCommand } from "./src/commands/update.ts";

declare const __APP_VERSION__: string;

function getVersion(): string {
  if (typeof __APP_VERSION__ !== "undefined") return __APP_VERSION__;
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const pkgPath = resolve(import.meta.dirname ?? ".", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version ?? "dev";
  } catch { return "dev"; }
}

const VERSION = getVersion();

function printHelp() {
  console.log(`ccs v${VERSION} - CC Switch Sync CLI

使用方法:
  ccs push [--dry-run]      采集本机配置并上传到云端
  ccs sync                  从云端拉取并应用配置到指定 CLI 工具
  ccs status                显示本机当前配置摘要
  ccs diff                  预览本机与云端的差异
  ccs config                查看同步后端配置
  ccs config set <key> <value>  设置同步后端参数
  ccs update                检查并更新到最新版本

选项:
  --help, -h                显示帮助
  --version, -v             显示版本
  --only mcp,skill,prompt   只操作指定类型（push/sync，逗号分隔）
  --dry-run                 预览操作，不实际写入文件（push）

同步后端:
  gist     GitHub Gist（需设置 GITHUB_TOKEN）
  webdav   WebDAV 服务（如 Nextcloud、坚果云）
  local    本地文件（手动通过网盘同步）

工作流:
  ccs push                  本机 CLI 配置 → 云端
  ccs sync                  云端 → 选择条目 → 选择目标 CLI → 写入

示例:
  ccs config set backend gist
  ccs config set gist.token ghp_xxxx
  ccs push
  ccs sync
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`ccs v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];
  const restArgs = args.slice(1);
  const flags = parseFlags(restArgs);

  try {
    switch (command) {
      case "push":
        await pushCommand(flags);
        break;
      case "sync":
        await syncCommand(flags);
        break;
      case "status":
        await statusCommand(flags);
        break;
      case "diff":
        await diffCommand(flags);
        break;
      case "config":
        await configCommand(restArgs);
        break;
      case "update":
        await updateCommand(VERSION);
        break;
      default:
        console.error(`未知命令: ${command}`);
        console.error(`运行 ccs --help 查看可用命令`);
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`错误: ${message}`);
    process.exit(1);
  }
}

export interface Flags {
  dryRun: boolean;
  only: string[] | null;
  verbose: boolean;
}

function parseFlags(args: string[]): Flags {
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose") || args.includes("-V");

  const onlyIdx = args.indexOf("--only");
  let only: string[] | null = null;
  if (onlyIdx !== -1 && args[onlyIdx + 1]) {
    only = args[onlyIdx + 1].split(",").map((s) => s.trim().toLowerCase());
  }

  return { dryRun, only, verbose };
}

main();
