#!/usr/bin/env bun
/**
 * ccs - CC Switch Sync CLI
 *
 * 将 MCP、Skill、Prompt 配置在多台机器间同步
 * 支持 GitHub Gist / WebDAV / 本地文件 三种后端
 *
 * 用法:
 *   ccs push              导出本机配置并上传
 *   ccs pull              下载配置并应用到本机
 *   ccs status            显示本机当前配置摘要
 *   ccs config            查看/设置同步后端
 *   ccs diff              预览 pull 前的差异
 */

import { readConfig, writeConfig, type CcsConfig } from "./src/config.ts";
import { pushCommand } from "./src/commands/push.ts";
import { pullCommand } from "./src/commands/pull.ts";
import { statusCommand } from "./src/commands/status.ts";
import { configCommand } from "./src/commands/config.ts";
import { diffCommand } from "./src/commands/diff.ts";

const VERSION = "1.0.0";

function printHelp() {
  console.log(`ccs v${VERSION} - CC Switch Sync CLI

使用方法:
  ccs push [--dry-run]      导出本机配置并上传到云端
  ccs pull [--dry-run]      从云端下载配置并应用到本机
  ccs status                显示本机当前配置摘要
  ccs diff                  预览 pull 前本机与云端的差异
  ccs config                查看同步后端配置
  ccs config set <key> <value>  设置同步后端参数

选项:
  --help, -h                显示帮助
  --version, -v             显示版本
  --only mcp,skill,prompt   只同步指定类型（逗号分隔）
  --dry-run                 预览操作，不实际写入文件

同步后端:
  gist     GitHub Gist（需设置 GITHUB_TOKEN）
  webdav   WebDAV 服务（如 Nextcloud、坚果云）
  local    本地文件（手动通过网盘同步）

示例:
  ccs config set backend gist
  ccs config set gist.token ghp_xxxx
  ccs push
  ccs pull --dry-run
  ccs push --only mcp,prompt
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

  // 解析公共 flags
  const flags = parseFlags(restArgs);

  try {
    switch (command) {
      case "push":
        await pushCommand(flags);
        break;
      case "pull":
        await pullCommand(flags);
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
  only: string[] | null; // null = all
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
