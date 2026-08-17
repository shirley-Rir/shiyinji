import type { MusicProvider } from "@/src/providers";
import type { ShiyinjiRepository } from "@/src/repositories/types";

export class AccountMusicProfileService {
  constructor(private readonly repository: ShiyinjiRepository, private readonly musicProvider: MusicProvider) {}

  async sync(userId: string) {
    const profile = await this.repository.getProfile(userId);
    if (!profile.personalizationEnabled) throw new Error("PERSONALIZATION_DISABLED");
    if (!this.musicProvider.syncAccountMusicProfile) throw new Error("MUSIC_PROFILE_SYNC_UNAVAILABLE");
    const snapshot = await this.musicProvider.syncAccountMusicProfile(profile, {
      getCachedTrackFeatures: (provider, providerTrackIds) => this.repository.getTrackTasteFeatures(provider, providerTrackIds),
    });
    return this.repository.saveAccountMusicProfile(userId, snapshot);
  }
}
