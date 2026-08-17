export type StoredContextImage = {
  key: string;
  signedUrl: string;
  uploadedAt: string;
};

export type ContextImageStorage = {
  readonly isConfigured: boolean;
  upload(input: { userId: string; file: File }): Promise<StoredContextImage>;
};

// Cloudflare builds intentionally do not include the Tencent COS SDK. VPS
// production swaps this module for the COS-backed implementation through Vite.
export const contextImageStorage: ContextImageStorage = {
  isConfigured: false,
  async upload() {
    throw new Error("IMAGE_STORAGE_UNAVAILABLE");
  },
};
