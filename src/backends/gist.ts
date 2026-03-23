/**
 * GitHub Gist 后端
 * 使用一个私有 Gist 存储 bundle.json
 */

import type { BackendAdapter } from "./index.ts";
import type { GistBackend } from "../config.ts";
import type { SyncBundle } from "../bundle.ts";
import { readConfig, writeConfig } from "../config.ts";

const GIST_FILENAME = "ccs-bundle.json";
const GIST_DESCRIPTION = "ccs sync bundle (managed by ccs CLI)";

export class GistBackendImpl implements BackendAdapter {
  constructor(private cfg: GistBackend) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "ccs-cli/1.0",
    };
  }

  async read(): Promise<SyncBundle | null> {
    const gistId = this.cfg.gistId;
    if (!gistId) return null;

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: this.headers,
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gist 读取失败 (${res.status}): ${text}`);
    }

    const gist = await res.json();
    const file = gist.files?.[GIST_FILENAME];
    if (!file) return null;

    // Gist 内容可能被截断，需要通过 raw_url 获取完整内容
    const rawUrl = file.raw_url;
    const rawRes = await fetch(rawUrl, { headers: this.headers });
    if (!rawRes.ok) throw new Error(`读取 Gist raw 内容失败 (${rawRes.status})`);

    return JSON.parse(await rawRes.text()) as SyncBundle;
  }

  async write(bundle: SyncBundle): Promise<{ url?: string }> {
    const content = JSON.stringify(bundle, null, 2);
    const gistId = this.cfg.gistId;

    let res: Response;
    let url: string | undefined;

    if (gistId) {
      // 更新现有 Gist
      res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({
          files: { [GIST_FILENAME]: { content } },
        }),
      });
    } else {
      // 创建新 Gist
      res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          description: GIST_DESCRIPTION,
          public: false,
          files: { [GIST_FILENAME]: { content } },
        }),
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gist 写入失败 (${res.status}): ${text}`);
    }

    const result = await res.json();
    url = result.html_url;

    // 保存 gistId 以便下次复用
    if (!gistId && result.id) {
      const config = readConfig();
      (config.backend as GistBackend).gistId = result.id;
      writeConfig(config);
    }

    return { url };
  }
}
