import type { ShiyinjiRepository } from "@/src/repositories";
import type { NcmSession, NcmSessionPersistence } from "@/src/providers/music/netease-session";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class NcmCredentialVault implements NcmSessionPersistence {
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(private readonly repository: ShiyinjiRepository, private readonly encodedKey: string) {}

  async load(appUserId: string): Promise<NcmSession | null> {
    const stored = await this.repository.getMusicConnection(appUserId, "netease");
    if (!stored) return null;
    try {
      const [version, ivValue, cipherValue] = stored.encryptedCredential.split(".");
      if (version !== "v1" || !ivValue || !cipherValue) return null;
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decodeBase64Url(ivValue), additionalData: this.additionalData(appUserId) },
        await this.key(),
        decodeBase64Url(cipherValue),
      );
      const value = JSON.parse(decoder.decode(plain)) as Partial<NcmSession>;
      if (!isSession(value)) return null;
      return value;
    } catch {
      console.error("[shiyinji-music] Stored Netease credential could not be decrypted");
      return null;
    }
  }

  async save(appUserId: string, session: NcmSession): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.additionalData(appUserId) },
      await this.key(),
      encoder.encode(JSON.stringify(session)),
    );
    await this.repository.saveMusicConnection(appUserId, "netease", `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(cipher))}`);
  }

  async delete(appUserId: string): Promise<void> {
    await this.repository.deleteMusicConnection(appUserId, "netease");
  }

  private key() {
    this.keyPromise ??= this.importKey();
    return this.keyPromise;
  }

  private async importKey() {
    const raw = decodeBase64Url(this.encodedKey);
    if (raw.byteLength !== 32) throw new Error("MUSIC_CREDENTIAL_KEY_INVALID");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  private additionalData(appUserId: string) {
    return encoder.encode(`shiyinji:netease:${appUserId}:v1`);
  }
}

function isSession(value: Partial<NcmSession>): value is NcmSession {
  return typeof value.cookie === "string" && value.cookie.length > 0
    && typeof value.userId === "number" && Number.isFinite(value.userId)
    && (value.source === "password" || value.source === "qr")
    && typeof value.connectedAt === "string";
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
