/**
 * ccs config - 查看和设置同步后端
 *
 * 用法:
 *   ccs config                        查看当前配置
 *   ccs config set backend gist       设置后端类型
 *   ccs config set gist.token <tok>   设置 Gist token
 *   ccs config set gist.id <id>       手动设置 Gist ID
 *   ccs config set webdav.url <url>   设置 WebDAV URL
 *   ccs config set webdav.username u  设置 WebDAV 用户名
 *   ccs config set webdav.password p  设置 WebDAV 密码
 *   ccs config set webdav.path /p     设置 WebDAV 存储路径
 *   ccs config set local.path /p      设置本地文件路径
 */

import { readConfig, writeConfig, type CcsConfig, type SyncBackend } from "../config.ts";
import { getConfigPath } from "../config.ts";

export async function configCommand(args: string[]): Promise<void> {
  const config = readConfig();

  // ccs config（无子命令）→ 显示当前配置
  if (args.length === 0) {
    showConfig(config);
    return;
  }

  const sub = args[0];

  if (sub === "set") {
    if (args.length < 3) {
      console.error("用法: ccs config set <key> <value>");
      process.exit(1);
    }
    const key = args[1];
    const value = args.slice(2).join(" "); // 支持含空格的密码
    applySet(config, key, value);
    writeConfig(config);
    console.log(`✓ 已设置 ${key} = ${maskSecret(key, value)}`);
    return;
  }

  console.error(`未知子命令: ${sub}`);
  process.exit(1);
}

function showConfig(config: CcsConfig): void {
  console.log(`配置文件: ${getConfigPath()}\n`);

  if (!config.backend) {
    console.log("后端: 未配置");
    console.log("\n运行 ccs config set backend gist|webdav|local 开始配置");
    return;
  }

  const b = config.backend;
  console.log(`后端: ${b.type}`);

  if (b.type === "gist") {
    console.log(`  token:   ${b.token ? maskValue(b.token) : "(未设置)"}`);
    console.log(`  gist.id: ${b.gistId ?? "(首次 push 后自动生成)"}`);
  } else if (b.type === "webdav") {
    console.log(`  url:      ${b.url}`);
    console.log(`  username: ${b.username ?? "(未设置)"}`);
    console.log(`  password: ${b.password ? "***" : "(未设置)"}`);
    console.log(`  path:     ${b.path ?? "/ccs-sync/bundle.json"}`);
  } else if (b.type === "local") {
    console.log(`  path: ${b.path}`);
  }

  if (config.lastPush) console.log(`\n上次 push: ${config.lastPush}`);
  if (config.lastPull) console.log(`上次 pull:  ${config.lastPull}`);
}

function applySet(config: CcsConfig, key: string, value: string): void {
  // backend 类型切换
  if (key === "backend") {
    if (value !== "gist" && value !== "webdav" && value !== "local") {
      console.error(`不支持的后端类型: ${value}（可选: gist, webdav, local）`);
      process.exit(1);
    }
    if (!config.backend || config.backend.type !== value) {
      // 切换后端类型，保留旧配置
      if (value === "gist") config.backend = { type: "gist", token: "" };
      else if (value === "webdav") config.backend = { type: "webdav", url: "" };
      else config.backend = { type: "local", path: "" };
    }
    return;
  }

  if (!config.backend) {
    console.error("请先设置后端类型: ccs config set backend gist|webdav|local");
    process.exit(1);
  }

  const b = config.backend as any;

  // gist.*
  if (key === "gist.token") { assertType(b, "gist", key); b.token = value; return; }
  if (key === "gist.id")    { assertType(b, "gist", key); b.gistId = value; return; }

  // webdav.*
  if (key === "webdav.url")      { assertType(b, "webdav", key); b.url = value; return; }
  if (key === "webdav.username") { assertType(b, "webdav", key); b.username = value; return; }
  if (key === "webdav.password") { assertType(b, "webdav", key); b.password = value; return; }
  if (key === "webdav.path")     { assertType(b, "webdav", key); b.path = value; return; }

  // local.*
  if (key === "local.path") { assertType(b, "local", key); b.path = value; return; }

  console.error(`未知配置项: ${key}`);
  process.exit(1);
}

function assertType(backend: any, expected: string, key: string): void {
  if (backend.type !== expected) {
    console.error(`配置项 ${key} 仅适用于 ${expected} 后端（当前: ${backend.type}）`);
    process.exit(1);
  }
}

function maskValue(v: string): string {
  if (v.length <= 8) return "***";
  return v.slice(0, 4) + "..." + v.slice(-4);
}

function maskSecret(key: string, value: string): string {
  if (key.includes("token") || key.includes("password")) return maskValue(value);
  return value;
}
