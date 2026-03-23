/**
 * WebDAV 后端
 * 将 bundle.json 存储到 WebDAV 服务（如 Nextcloud、坚果云）
 */

import type { BackendAdapter } from "./index.ts";
import type { WebDavBackend } from "../config.ts";
import type { SyncBundle } from "../bundle.ts";

const DEFAULT_REMOTE_PATH = "/ccs-sync/bundle.json";

export class WebDavBackendImpl implements BackendAdapter {
  private readonly remotePath: string;

  constructor(private cfg: WebDavBackend) {
    this.remotePath = cfg.path ?? DEFAULT_REMOTE_PATH;
  }

  private get url(): string {
    const base = this.cfg.url.replace(/\/$/, "");
    const path = this.remotePath.startsWith("/") ? this.remotePath : `/${this.remotePath}`;
    return `${base}${path}`;
  }

  private get authHeader(): string | undefined {
    if (!this.cfg.username) return undefined;
    const cred = `${this.cfg.username}:${this.cfg.password ?? ""}`;
    return `Basic ${Buffer.from(cred).toString("base64")}`;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const auth = this.authHeader;
    if (auth) h["Authorization"] = auth;
    return h;
  }

  async read(): Promise<SyncBundle | null> {
    const res = await fetch(this.url, { headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`WebDAV 读取失败 (${res.status}): ${await res.text()}`);
    }
    return JSON.parse(await res.text()) as SyncBundle;
  }

  async write(bundle: SyncBundle): Promise<{ url?: string }> {
    // 确保父目录存在（MKCOL）
    await this.ensureParentDir();

    const res = await fetch(this.url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(bundle, null, 2),
    });

    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`WebDAV 写入失败 (${res.status}): ${await res.text()}`);
    }

    return { url: this.url };
  }

  private async ensureParentDir(): Promise<void> {
    const parts = this.remotePath.split("/").filter(Boolean);
    if (parts.length <= 1) return; // 根目录下无需创建

    const base = this.cfg.url.replace(/\/$/, "");
    const dirPath = parts.slice(0, -1).join("/");
    const dirUrl = `${base}/${dirPath}/`;

    const h: Record<string, string> = {};
    const auth = this.authHeader;
    if (auth) h["Authorization"] = auth;

    const res = await fetch(dirUrl, { method: "MKCOL", headers: h });
    // 405 = 目录已存在，忽略
    if (!res.ok && res.status !== 405 && res.status !== 301) {
      // 非致命，继续尝试写入
    }
  }
}
