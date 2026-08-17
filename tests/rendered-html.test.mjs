import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Shiyinji authenticated product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>拾音记<\/title>/i);
  assert.match(html, /auth-loading/);
  assert.match(html, /拾音记/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("ships product metadata, docs, and the bespoke social card", async () => {
  const [layout, page, app, auth, packageJson, prd, tech] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/music-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../04-web-mvp-prd.md", import.meta.url), "utf8"),
    readFile(new URL("../05-web-mvp-tech-selection-and-resources.md", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /og\.png/);
  assert.match(page, /MusicApp/);
  assert.match(app, /开始听/);
  assert.match(auth, /密码登录/);
  assert.match(auth, /验证码登录/);
  assert.match(auth, /注册账号/);
  assert.match(packageJson, /lucide-react/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(prd, /Web MVP PRD/);
  assert.match(tech, /MusicProvider/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});
