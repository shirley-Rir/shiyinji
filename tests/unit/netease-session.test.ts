import assert from "node:assert/strict";
import test from "node:test";
import { NcmSessionManager } from "../../src/providers/music/netease-session";

class FakeSessionClient {
  passwordAttempts = 0;
  qrCode = 801;

  async loginWithPhone(): Promise<{ cookie: string; userId: number }> {
    this.passwordAttempts += 1;
    throw new Error("NCM_API_ERROR:-460");
  }

  async createQr() { return { key: "qr-key-long-enough", qrImage: "data:image/png;base64,test" }; }
  async checkQr() { return { code: this.qrCode, cookie: this.qrCode === 803 ? "MUSIC_U=server-only" : undefined }; }
  async getLoginStatus() { return { userId: 42 }; }
  async getTasteProfile() {
    return { likedIds: new Set([1, 2]), playCounts: new Map([[1, 8]]), familiarArtists: new Set(["测试艺人"]), preferredGenres: ["器乐"] };
  }
}

test("password risk control degrades to QR without repeated login attempts", async () => {
  const client = new FakeSessionClient();
  const sessions = new NcmSessionManager(client, { authMode: "password", phone: "local", md5Password: "local-hash" });
  assert.equal(await sessions.getSession("user-1"), null);
  assert.equal(await sessions.getSession("user-1"), null);
  assert.equal(client.passwordAttempts, 1);
  const status = await sessions.getStatus("user-1");
  assert.equal(status.status, "unavailable");
  assert.match(status.message ?? "", /二维码/);
});

test("QR login keeps the provider cookie server-side and exposes only taste summary", async () => {
  const client = new FakeSessionClient();
  const sessions = new NcmSessionManager(client, { authMode: "qr" });
  const qr = await sessions.createQr("user-1");
  assert.match(qr.qrImage, /^data:image/);
  client.qrCode = 803;
  const status = await sessions.checkQr("user-1", qr.key);
  assert.equal(status.status, "connected");
  assert.deepEqual(status.taste, { likedCount: 2, recordCount: 1, preferredGenres: ["器乐"] });
  assert.equal("cookie" in status, false);
  assert.equal((await sessions.getSession("user-1"))?.cookie, "MUSIC_U=server-only");
});

test("pending QR status takes priority after password login is blocked", async () => {
  const client = new FakeSessionClient();
  const sessions = new NcmSessionManager(client, { authMode: "password", phone: "local", md5Password: "local-hash" });
  await sessions.getSession("user-1");
  await sessions.createQr("user-1");
  assert.equal((await sessions.getStatus("user-1")).status, "waiting");
});

test("expired QR clears the pending session with an actionable status", async () => {
  const client = new FakeSessionClient();
  const sessions = new NcmSessionManager(client, { authMode: "qr" });
  const qr = await sessions.createQr("user-1");
  client.qrCode = 800;
  const status = await sessions.checkQr("user-1", qr.key);
  assert.equal(status.status, "disconnected");
  assert.match(status.message ?? "", /过期/);
});
