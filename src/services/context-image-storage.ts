import { env } from "cloudflare:workers";

export type StoredContextImage = {
  key: string;
  signedUrl: string;
  uploadedAt: string;
};

export type ContextImageStorage = {
  readonly isConfigured: boolean;
  upload(input: { userId: string; file: File }): Promise<StoredContextImage>;
};

const extensionForType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const isConfigured = Boolean(env.COS_SECRET_ID && env.COS_SECRET_KEY && env.COS_REGION && env.COS_BUCKET);
const signedUrlTtlSeconds = clampNumber(env.COS_SIGNED_URL_TTL_SECONDS, 600, 60, 3600);

export const contextImageStorage: ContextImageStorage = {
  isConfigured,
  async upload({ userId, file }): Promise<StoredContextImage> {
    if (!isConfigured) throw new Error("IMAGE_STORAGE_UNAVAILABLE");
    const extension = extensionForType[file.type];
    if (!extension) throw new Error("INVALID_IMAGE");

    const uploadedAt = new Date().toISOString();
    const date = uploadedAt.slice(0, 10);
    const key = `context-images/${userId}/${date}/${crypto.randomUUID()}.${extension}`;
    const { default: COS } = await import(/* @vite-ignore */ "cos-nodejs-sdk-v5");
    const client = new COS({ SecretId: env.COS_SECRET_ID!, SecretKey: env.COS_SECRET_KEY! });

    try {
      await client.putObject({
        Bucket: env.COS_BUCKET!,
        Region: env.COS_REGION!,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentLength: file.size,
        ContentType: file.type,
        ACL: "private",
      });
      return {
        key,
        uploadedAt,
        signedUrl: client.getObjectUrl({
          Bucket: env.COS_BUCKET!,
          Region: env.COS_REGION!,
          Key: key,
          Sign: true,
          Method: "GET",
          Expires: signedUrlTtlSeconds,
          Protocol: "https:",
        }),
      };
    } catch (error) {
      console.error("[shiyinji-image-storage] COS upload failed", {
        code: error && typeof error === "object" && "code" in error ? error.code : "unknown",
      });
      throw new Error("IMAGE_STORAGE_UPLOAD_FAILED");
    }
  },
};

function clampNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}
