/**
 * ccs config - 查看和设置同步后端
 *
 * 交互式模式:
 *   ccs config                        启动交互式配置向导
 *
 * 脚本模式 (支持非交互式场景):
 *   ccs config set backend gist       设置后端类型
 *   ccs config set gist.token <tok>   设置 Gist token
 *   ccs config show                   显示当前配置
 */

import * as p from "@clack/prompts";
import { readConfig, writeConfig, type CcsConfig } from "../config.ts";
import { getConfigPath } from "../config.ts";

export async function configCommand(args: string[]): Promise<void> {
  const config = readConfig();
  const sub = args[0];

  // ccs config show → 纯文本展示
  if (sub === "show") {
    showConfig(config);
    return;
  }

  // ccs config set <key> <value> → 脚本模式
  if (sub === "set") {
    if (args.length < 3) {
      console.error("用法: ccs config set <key> <value>");
      process.exit(1);
    }
    applySet(config, args[1], args.slice(2).join(" "));
    writeConfig(config);
    console.log(`✓ 已设置 ${args[1]} = ${maskSecret(args[1], args.slice(2).join(" "))}`);
    return;
  }

  // ccs config → 交互式向导
  await interactiveConfig(config);
}

// ============================================================
// 交互式配置向导
// ============================================================

async function interactiveConfig(config: CcsConfig): Promise<void> {
  p.intro("ccs 同步配置");

  // 如果已有配置，先展示
  if (config.backend) {
    showConfigClack(config);

    const action = await p.select({
      message: "你想做什么？",
      options: [
        { value: "reconfigure", label: "重新配置", hint: "修改同步后端设置" },
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

  // 选择后端类型
  const backendType = await p.select({
    message: "选择同步后端",
    options: [
      { value: "gist", label: "GitHub Gist", hint: "推荐，免费，支持版本历史" },
      { value: "webdav", label: "WebDAV", hint: "Nextcloud / 坚果云 等" },
      { value: "local", label: "本地文件", hint: "手动通过 iCloud / Dropbox 同步" },
    ],
  });
  if (p.isCancel(backendType)) { p.outro("已取消"); return; }

  switch (backendType) {
    case "gist":
      await configureGist(config);
      break;
    case "webdav":
      await configureWebDav(config);
      break;
    case "local":
      await configureLocal(config);
      break;
  }
}

async function configureGist(config: CcsConfig): Promise<void> {
  const token = await p.text({
    message: "GitHub Personal Access Token",
    placeholder: "ghp_xxxxxxxxxxxx",
    initialValue: config.backend?.type === "gist" ? config.backend.token : "",
    validate: (v) => (!v?.trim() ? "Token 不能为空" : undefined),
  });
  if (p.isCancel(token)) { p.outro("已取消"); return; }

  const existingId =
    config.backend?.type === "gist" ? config.backend.gistId : undefined;

  let gistId = existingId;
  if (existingId) {
    p.log.info(`当前 Gist ID: ${existingId}`);
  } else {
    const inputId = await p.text({
      message: "Gist ID（留空则首次 push 时自动创建）",
      placeholder: "可选",
    });
    if (p.isCancel(inputId)) { p.outro("已取消"); return; }
    gistId = inputId.trim() || undefined;
  }

  config.backend = { type: "gist", token: token.trim(), gistId };
  writeConfig(config);

  p.log.success("GitHub Gist 后端配置完成");
  p.log.step(gistId
    ? `Gist ID: ${gistId}`
    : "首次 push 时将自动创建私有 Gist"
  );
  p.outro("运行 ccs push 开始同步");
}

async function configureWebDav(config: CcsConfig): Promise<void> {
  const existing = config.backend?.type === "webdav" ? config.backend : null;

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
        message: "远端存储路径",
        placeholder: "/ccs-sync/bundle.json",
        initialValue: existing?.path ?? "/ccs-sync/bundle.json",
      }),
  });

  if (p.isCancel(result)) { p.outro("已取消"); return; }

  config.backend = {
    type: "webdav",
    url: result.url.trim(),
    username: result.username?.trim() || undefined,
    password: result.password?.trim() || undefined,
    path: result.path?.trim() || "/ccs-sync/bundle.json",
  };
  writeConfig(config);

  p.log.success("WebDAV 后端配置完成");
  p.log.step(`地址: ${config.backend.url}`);
  p.outro("运行 ccs push 开始同步");
}

async function configureLocal(config: CcsConfig): Promise<void> {
  const existing = config.backend?.type === "local" ? config.backend : null;

  const filePath = await p.text({
    message: "Bundle 文件路径",
    placeholder: "~/iCloud/ccs-bundle.json",
    initialValue: existing?.path ?? "",
    validate: (v) => (!v?.trim() ? "路径不能为空" : undefined),
  });
  if (p.isCancel(filePath)) { p.outro("已取消"); return; }

  // 展开 ~ 为 HOME
  const resolved = filePath.trim().replace(/^~/, process.env.HOME ?? "~");

  config.backend = { type: "local", path: resolved };
  writeConfig(config);

  p.log.success("本地文件后端配置完成");
  p.log.step(`路径: ${resolved}`);
  p.outro("运行 ccs push 开始同步");
}

// ============================================================
// 在 clack UI 中展示当前配置
// ============================================================

function showConfigClack(config: CcsConfig): void {
  const b = config.backend;
  if (!b) return;

  const lines: string[] = [`后端类型: ${b.type}`];
  if (b.type === "gist") {
    lines.push(`Token: ${b.token ? maskValue(b.token) : "(未设置)"}`);
    lines.push(`Gist ID: ${b.gistId ?? "(首次 push 后生成)"}`);
  } else if (b.type === "webdav") {
    lines.push(`URL: ${b.url}`);
    lines.push(`用户名: ${b.username ?? "(未设置)"}`);
    lines.push(`密码: ${b.password ? "***" : "(未设置)"}`);
    lines.push(`路径: ${b.path ?? "/ccs-sync/bundle.json"}`);
  } else if (b.type === "local") {
    lines.push(`路径: ${b.path}`);
  }
  if (config.lastPush) lines.push(`上次 push: ${config.lastPush}`);
  if (config.lastPull) lines.push(`上次 pull: ${config.lastPull}`);

  p.log.info("当前配置:\n" + lines.map((l) => `  ${l}`).join("\n"));
}

// ============================================================
// 脚本模式辅助
// ============================================================

function showConfig(config: CcsConfig): void {
  console.log(`配置文件: ${getConfigPath()}\n`);
  if (!config.backend) {
    console.log("后端: 未配置");
    console.log("\n运行 ccs config 启动交互式配置向导");
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
  if (key === "backend") {
    if (value !== "gist" && value !== "webdav" && value !== "local") {
      console.error(`不支持的后端类型: ${value}（可选: gist, webdav, local）`);
      process.exit(1);
    }
    if (!config.backend || config.backend.type !== value) {
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
  if (key === "gist.token") { assertType(b, "gist", key); b.token = value; return; }
  if (key === "gist.id") { assertType(b, "gist", key); b.gistId = value; return; }
  if (key === "webdav.url") { assertType(b, "webdav", key); b.url = value; return; }
  if (key === "webdav.username") { assertType(b, "webdav", key); b.username = value; return; }
  if (key === "webdav.password") { assertType(b, "webdav", key); b.password = value; return; }
  if (key === "webdav.path") { assertType(b, "webdav", key); b.path = value; return; }
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
