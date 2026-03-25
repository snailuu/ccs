/**
 * ccs config - 查看和设置 WebDAV 同步后端
 *
 * 交互式模式:
 *   ccs config                        启动交互式配置向导
 *
 * 脚本模式:
 *   ccs config set webdav.url <url>   设置 WebDAV 地址
 *   ccs config show                   显示当前配置
 */

import * as p from "@clack/prompts";
import { readConfig, writeConfig, type CcsConfig, getConfigPath } from "../config.ts";

export async function configCommand(args: string[]): Promise<void> {
  const config = readConfig();
  const sub = args[0];

  if (sub === "show") {
    showConfig(config);
    return;
  }

  if (sub === "set") {
    if (args.length < 3) {
      console.error("用法: ccs config set <key> <value>");
      process.exit(1);
    }
    applySet(config, args[1], args.slice(2).join(" "));
    writeConfig(config);
    console.log(`已设置 ${args[1]} = ${maskSecret(args[1], args.slice(2).join(" "))}`);
    return;
  }

  await interactiveConfig(config);
}

// ============================================================
// 交互式配置向导
// ============================================================

async function interactiveConfig(config: CcsConfig): Promise<void> {
  p.intro("ccs 同步配置");

  if (config.backend) {
    showConfigClack(config);

    const action = await p.select({
      message: "你想做什么？",
      options: [
        { value: "reconfigure", label: "重新配置", hint: "修改 WebDAV 设置" },
        { value: "reset", label: "重置配置", hint: "清除所有配置" },
        { value: "exit", label: "退出" },
      ],
    });
    if (p.isCancel(action) || action === "exit") {
      p.outro("已取消");
      return;
    }
    if (action === "reset") {
      writeConfig({});
      p.outro("配置已重置");
      return;
    }
  }

  await configureWebDav(config);
}

async function configureWebDav(config: CcsConfig): Promise<void> {
  const existing = config.backend ?? null;

  const result = await p.group({
    url: () =>
      p.text({
        message: "WebDAV 服务地址",
        placeholder: "https://dav.jianguoyun.com/dav",
        initialValue: existing?.url ?? "",
        validate: (v) => (!v?.trim() ? "URL 不能为空" : undefined),
      }),
    username: () =>
      p.text({
        message: "用户名（可选）",
        placeholder: "your@email.com",
        initialValue: existing?.username ?? "",
      }),
    password: () =>
      p.password({
        message: "密码 / 应用密钥（可选）",
      }),
    path: () =>
      p.text({
        message: "远端根路径",
        placeholder: "/ccs-sync",
        initialValue: existing?.path ?? "/ccs-sync",
      }),
  });

  if (p.isCancel(result)) { p.outro("已取消"); return; }

  config.backend = {
    type: "webdav",
    url: result.url.trim(),
    username: result.username?.trim() || undefined,
    password: result.password?.trim() || undefined,
    path: result.path?.trim() || "/ccs-sync",
  };
  writeConfig(config);

  p.log.success("WebDAV 配置完成");
  p.log.step(`地址: ${config.backend.url}${config.backend.path}`);
  p.outro("运行 ccs push 开始同步");
}

// ============================================================
// 展示
// ============================================================

function showConfigClack(config: CcsConfig): void {
  const b = config.backend;
  if (!b) return;

  const lines: string[] = [
    `URL: ${b.url}`,
    `用户名: ${b.username ?? "(未设置)"}`,
    `密码: ${b.password ? "***" : "(未设置)"}`,
    `路径: ${b.path ?? "/ccs-sync"}`,
  ];
  if (config.lastPush) lines.push(`上次 push: ${config.lastPush}`);
  if (config.lastSync) lines.push(`上次 sync: ${config.lastSync}`);

  p.log.info("当前配置:\n" + lines.map((l) => `  ${l}`).join("\n"));
}

function showConfig(config: CcsConfig): void {
  console.log(`配置文件: ${getConfigPath()}\n`);
  if (!config.backend) {
    console.log("后端: 未配置");
    console.log("\n运行 ccs config 启动交互式配置向导");
    return;
  }
  const b = config.backend;
  console.log(`后端: webdav`);
  console.log(`  url:      ${b.url}`);
  console.log(`  username: ${b.username ?? "(未设置)"}`);
  console.log(`  password: ${b.password ? "***" : "(未设置)"}`);
  console.log(`  path:     ${b.path ?? "/ccs-sync"}`);
  if (config.lastPush) console.log(`\n上次 push: ${config.lastPush}`);
  if (config.lastSync) console.log(`上次 sync:  ${config.lastSync}`);
}

// ============================================================
// 脚本模式
// ============================================================

function applySet(config: CcsConfig, key: string, value: string): void {
  if (key === "backend") {
    if (value !== "webdav") {
      console.error(`仅支持 webdav 后端`);
      process.exit(1);
    }
    if (!config.backend) config.backend = { type: "webdav", url: "" };
    return;
  }
  if (!config.backend) {
    config.backend = { type: "webdav", url: "" };
  }
  const b = config.backend;
  if (key === "webdav.url") { b.url = value; return; }
  if (key === "webdav.username") { b.username = value; return; }
  if (key === "webdav.password") { b.password = value; return; }
  if (key === "webdav.path") { b.path = value; return; }
  console.error(`未知配置项: ${key}（可用: webdav.url, webdav.username, webdav.password, webdav.path）`);
  process.exit(1);
}

function maskSecret(key: string, value: string): string {
  if (key.includes("password")) {
    if (value.length <= 8) return "***";
    return value.slice(0, 4) + "..." + value.slice(-4);
  }
  return value;
}
