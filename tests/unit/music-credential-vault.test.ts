import assert from "node:assert/strict";
import test from "node:test";
import type { ShiyinjiRepository } from "@/src/repositories";
import { NcmCredentialVault } from "@/src/services/music-credential-vault";

type Stored = { encryptedCredential: string; credentialExpiresAt: string | null };

function createRepository() {
  const values = new Map<string, Stored>();
  const repository = {
    async getMusicConnection(userId: string, provider: string) { return values.get(`${userId}:${provider}`) ?? null; },
    async saveMusicConnection(userId: string, provider: string, encryptedCredential: string, credentialExpiresAt: string | null = null) {
      values.set(`${userId}:${provider}`, { encryptedCredential, credentialExpiresAt });
    },
    async deleteMusicConnection(userId: string, provider: string) { values.delete(`${userId}:${provider}`); },
  } as unknown as ShiyinjiRepository;
  return { repository, values };
}

const key = Buffer.alloc(32, 7).toString("base64url");

test("Netease credentials are encrypted at rest and recoverable for their owner", async () => {
  const { repository, values } = createRepository();
  const vault = new NcmCredentialVault(repository, key);
  const session = { cookie: "MUSIC_U=private-cookie", userId: 42, source: "qr" as const, connectedAt: "2026-08-17T00:00:00.000Z" };
  await vault.save("user-1", session);
  const stored = values.get("user-1:netease");
  assert.ok(stored);
  assert.match(stored.encryptedCredential, /^v1\./);
  assert.doesNotMatch(stored.encryptedCredential, /private-cookie/);
  assert.deepEqual(await vault.load("user-1"), session);
});

test("encrypted credentials cannot be replayed under another app account", async () => {
  const { repository, values } = createRepository();
  const vault = new NcmCredentialVault(repository, key);
  await vault.save("user-1", { cookie: "owner-only", userId: 42, source: "qr", connectedAt: "2026-08-17T00:00:00.000Z" });
  values.set("user-2:netease", values.get("user-1:netease")!);
  assert.equal(await vault.load("user-2"), null);
});

test("deleting one account credential leaves other accounts untouched", async () => {
  const { repository } = createRepository();
  const vault = new NcmCredentialVault(repository, key);
  await vault.save("user-1", { cookie: "one", userId: 1, source: "qr", connectedAt: "2026-08-17T00:00:00.000Z" });
  await vault.save("user-2", { cookie: "two", userId: 2, source: "qr", connectedAt: "2026-08-17T00:00:00.000Z" });
  await vault.delete("user-1");
  assert.equal(await vault.load("user-1"), null);
  assert.equal((await vault.load("user-2"))?.cookie, "two");
});
