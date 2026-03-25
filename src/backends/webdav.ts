/**
 * WebDAV 后端 — 索引 + 按需下载
 *
 * 云端目录结构（与本地 ~/.ccs/ 一致）：
 *   <basePath>/manifest.json
 *   <basePath>/skills/<name>/SKILL.md
 *   <basePath>/skills/<name>/references/guide.md
 *   ...
 */

import type { WebDavBackend } from "../config.ts";
import type { Manifest, SkillPackage } from "../manifest.ts";

const DEFAULT_BASE_PATH = "/ccs-sync";

function normalizeRemotePath(path: string): string {
  const normalized = path.trim().replace(/\/{2,}/g, "/");
  if (!normalized) return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function extractRemotePathFromHref(href: string, basePath: string): string {
  let path = decodeURIComponent(href.trim());

  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      // 保留原值，后续继续做 basePath 截断
    }
  }

  const basePathIndex = path.indexOf(basePath);
  if (basePathIndex !== -1) {
    path = path.slice(basePathIndex + basePath.length);
  }

  return normalizeRemotePath(path);
}

function collectFilePathsFromPropfind(xml: string, basePath: string, dirPath: string): string[] {
  const normalizedDirPath = normalizeRemotePath(dirPath).replace(/\/$/, "");
  const responsePattern = /<(?:[\w.-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi;
  const hrefPattern = /<(?:[\w.-]+:)?href(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?href>/i;
  const collectionPattern = /<(?:[\w.-]+:)?collection(?:\s[^>]*)?\/?>/i;

  const files: string[] = [];

  for (const match of xml.matchAll(responsePattern)) {
    const responseXml = match[1];
    const hrefMatch = responseXml.match(hrefPattern);
    if (!hrefMatch) continue;

    const remotePath = extractRemotePathFromHref(hrefMatch[1], basePath);
    const isCollection = collectionPattern.test(responseXml);

    if (isCollection) continue;
    if (remotePath === normalizedDirPath) continue;
    if (remotePath === `${normalizedDirPath}/`) continue;
    if (remotePath.endsWith("/")) continue;
    if (!remotePath.startsWith(`${normalizedDirPath}/`)) continue;

    files.push(remotePath);
  }

  return files;
}

export class WebDavClient {
  private readonly basePath: string;

  constructor(private cfg: WebDavBackend) {
    let p = (cfg.path ?? DEFAULT_BASE_PATH).replace(/\/$/, "");
    // 兼容旧配置：如果路径指向文件（如 /ccs-sync/bundle.json），取其父目录
    if (p.endsWith(".json")) p = p.replace(/\/[^/]+\.json$/, "");
    this.basePath = p;
  }

  private get baseUrl(): string {
    return this.cfg.url.replace(/\/$/, "");
  }

  private get authHeader(): string | undefined {
    if (!this.cfg.username) return undefined;
    const cred = `${this.cfg.username}:${this.cfg.password ?? ""}`;
    return `Basic ${Buffer.from(cred).toString("base64")}`;
  }

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {};
    if (contentType) h["Content-Type"] = contentType;
    const auth = this.authHeader;
    if (auth) h["Authorization"] = auth;
    return h;
  }

  private url(remotePath: string): string {
    return `${this.baseUrl}${this.basePath}${remotePath}`;
  }

  // ---- 目录创建 ----

  private async ensureDir(dirPath: string): Promise<void> {
    const baseParts = this.basePath.split("/").filter(Boolean);
    const extraParts = dirPath.split("/").filter(Boolean);
    const allParts = [...baseParts, ...extraParts];
    let current = "";
    for (const part of allParts) {
      current += `/${part}`;
      const res = await fetch(`${this.baseUrl}${current}/`, {
        method: "MKCOL",
        headers: this.headers(),
      });
      // 405/301 = 已存在，忽略
      if (!res.ok && res.status !== 405 && res.status !== 301) {
        // 非致命，继续
      }
    }
  }

  // ---- 单文件上传/下载 ----

  private async putFile(remotePath: string, content: string, contentType = "text/plain"): Promise<void> {
    // 确保父目录存在
    const parts = remotePath.split("/").filter(Boolean);
    if (parts.length > 1) {
      const parentDir = parts.slice(0, -1).join("/");
      await this.ensureDir(parentDir);
    } else {
      await this.ensureDir("");
    }

    const res = await fetch(this.url(remotePath), {
      method: "PUT",
      headers: this.headers(contentType),
      body: content,
    });
    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`上传失败 ${remotePath} (${res.status}): ${await res.text()}`);
    }
  }

  private async getFile(remotePath: string): Promise<string | null> {
    const res = await fetch(this.url(remotePath), {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`下载失败 ${remotePath} (${res.status}): ${await res.text()}`);
    }
    return await res.text();
  }

  // ---- Manifest ----

  async uploadManifest(manifest: Manifest): Promise<string> {
    const targetUrl = this.url("/manifest.json");
    await this.putFile("/manifest.json", JSON.stringify(manifest, null, 2), "application/json");
    return targetUrl;
  }

  async downloadManifest(): Promise<Manifest | null> {
    const text = await this.getFile("/manifest.json");
    if (!text) return null;
    return JSON.parse(text) as Manifest;
  }

  // ---- Skill Package（原始目录结构）----

  /** 上传 skill 的所有文件到 skills/<name>/ 目录 */
  async uploadSkillPackage(pkg: SkillPackage): Promise<void> {
    for (const file of pkg.files) {
      await this.putFile(`/skills/${pkg.directory}/${file.path}`, file.content);
    }
  }

  /** 下载 skill 的所有文件，通过 PROPFIND 列出目录内容后逐个下载 */
  async downloadSkillPackage(directory: string): Promise<SkillPackage | null> {
    const filePaths = await this.listFiles(`/skills/${directory}`);
    if (filePaths.length === 0) return null;

    const files: SkillPackage["files"] = [];
    for (const filePath of filePaths) {
      const content = await this.getFile(filePath);
      if (content !== null) {
        // 从完整路径提取相对路径
        const prefix = `/skills/${directory}/`;
        const relativePath = filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
        files.push({ path: relativePath, content });
      }
    }

    return files.length > 0 ? { directory, files } : null;
  }

  /** PROPFIND 递归列出目录下所有文件的相对路径 */
  private async listFiles(dirPath: string): Promise<string[]> {
    const res = await fetch(this.url(`${dirPath}/`), {
      method: "PROPFIND",
      headers: {
        ...this.headers("application/xml"),
        Depth: "infinity",
      },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
    });

    if (res.status === 404) return [];
    if (!res.ok && res.status !== 207) return [];

    const xml = await res.text();
    return collectFilePathsFromPropfind(xml, this.basePath, dirPath);
  }
}
