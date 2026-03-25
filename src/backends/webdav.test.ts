import { afterEach, describe, expect, test } from "bun:test";
import { WebDavClient } from "./webdav.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("WebDavClient.downloadSkillPackage", () => {
  test("兼容 alist 风格的 PROPFIND，忽略目录自身和子目录", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/ccs-sync/skills/createcli/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><collection xmlns="DAV:"/></D:resourcetype>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/ccs-sync/skills/createcli/SKILL.md</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype />
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/ccs-sync/skills/createcli/references/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><collection xmlns="DAV:"/></D:resourcetype>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/ccs-sync/skills/createcli/references/guide.md</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype />
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    globalThis.fetch = (async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (method === "PROPFIND" && url === "https://dav.example.com/ccs-sync/skills/createcli/") {
        return new Response(xml, { status: 207 });
      }

      if (method === "GET" && url === "https://dav.example.com/ccs-sync/skills/createcli/") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (method === "GET" && url === "https://dav.example.com/ccs-sync/skills/createcli/SKILL.md") {
        return new Response("# CreateCLI", { status: 200 });
      }

      if (method === "GET" && url === "https://dav.example.com/ccs-sync/skills/createcli/references/guide.md") {
        return new Response("guide", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const client = new WebDavClient({
      type: "webdav",
      url: "https://dav.example.com",
      path: "/ccs-sync",
    });

    await expect(client.downloadSkillPackage("createcli")).resolves.toEqual({
      directory: "createcli",
      files: [
        { path: "SKILL.md", content: "# CreateCLI" },
        { path: "references/guide.md", content: "guide" },
      ],
    });
  });
});
