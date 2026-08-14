import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { initializeDatabase } from "@/db/initialize";
import { accountMusicProfiles, contextSessions, feedbackEvents, playbackEvents, recommendationItems, recommendations, trackTasteFeatures, tracks, userLibraryTracks, userProfiles, users } from "@/db/schema";
import { createDefaultProfile, type AccountMusicProfile, type AccountMusicProfileSyncSnapshot, type ContextInterpretation, type RankedTrack, type ScoreBreakdown, type StructuredContext, type TrackCandidate, type TrackTasteFeatures, type UserProfile } from "@/src/domain";
import type { AppUser, ShiyinjiRepository, StoredContextSession, StoredRecommendation } from "./types";

function json<T>(value: T): string { return JSON.stringify(value); }
function parse<T>(value: string): T { return JSON.parse(value) as T; }

export class D1ShiyinjiRepository implements ShiyinjiRepository {
  private async db() {
    await initializeDatabase();
    return getDb();
  }

  async ensureUser(user: AppUser): Promise<UserProfile> {
    const db = await this.db();
    await db.insert(users).values({ id: user.id, email: user.email, displayName: user.displayName }).onConflictDoUpdate({ target: users.id, set: { email: user.email, displayName: user.displayName, updatedAt: new Date().toISOString() } });
    const existing = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).get();
    if (!existing) {
      const profile = createDefaultProfile(user.id);
      await db.insert(userProfiles).values({ userId: user.id, version: profile.version, personalizationEnabled: profile.personalizationEnabled, explicitPreferences: json(profile.explicit), longTermTraits: json(profile.longTermTraits), scenePreferences: json(profile.scenePreferences), negativeTrackIds: json(profile.negativeTrackIds) });
      return profile;
    }
    return mapProfile(existing, await this.getAccountMusicProfile(user.id));
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const db = await this.db();
    const row = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).get();
    if (!row) throw new Error("PROFILE_NOT_FOUND");
    return mapProfile(row, await this.getAccountMusicProfile(userId));
  }

  async updateProfile(userId: string, patch: Partial<Pick<UserProfile, "explicit" | "personalizationEnabled">>): Promise<UserProfile> {
    const current = await this.getProfile(userId);
    const next: UserProfile = {
      ...current,
      version: current.version + 1,
      explicit: patch.explicit ?? current.explicit,
      personalizationEnabled: patch.personalizationEnabled ?? current.personalizationEnabled,
    };
    const db = await this.db();
    await db.update(userProfiles).set({ version: next.version, personalizationEnabled: next.personalizationEnabled, explicitPreferences: json(next.explicit), updatedAt: new Date().toISOString() }).where(eq(userProfiles.userId, userId));
    return next;
  }

  async getAccountMusicProfile(userId: string): Promise<AccountMusicProfile | null> {
    const db = await this.db();
    const row = await db.select().from(accountMusicProfiles).where(eq(accountMusicProfiles.userId, userId)).orderBy(desc(accountMusicProfiles.version)).get();
    return row ? parse<AccountMusicProfile>(row.profile) : null;
  }

  async saveAccountMusicProfile(userId: string, snapshot: AccountMusicProfileSyncSnapshot): Promise<AccountMusicProfile> {
    const current = await this.getProfile(userId);
    const previous = current.musicProfile;
    const profile: AccountMusicProfile = {
      ...snapshot.profile,
      userId,
      version: (previous?.version ?? 0) + 1,
      analyzedAt: new Date().toISOString(),
    };
    const db = await this.db();
    await db.insert(accountMusicProfiles).values({
      id: `amp_${crypto.randomUUID()}`,
      userId,
      provider: profile.provider,
      version: profile.version,
      profile: json(profile),
    });
    const syncedAt = profile.analyzedAt;
    for (const track of snapshot.libraryTracks) {
      const values = {
        id: `${userId}:${track.provider}:${track.providerTrackId}`,
        userId,
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.durationMs,
        sources: json(track.sources),
        playlistIds: json(track.playlistIds),
        playlistContexts: json(track.playlistContexts),
        evidenceWeight: track.evidenceWeight,
        syncedAt,
      };
      await db.insert(userLibraryTracks).values(values).onConflictDoUpdate({
        target: userLibraryTracks.id,
        set: { title: values.title, artist: values.artist, album: values.album, durationMs: values.durationMs, sources: values.sources, playlistIds: values.playlistIds, playlistContexts: values.playlistContexts, evidenceWeight: values.evidenceWeight, syncedAt },
      });
    }
    for (const feature of snapshot.trackFeatures) {
      const cacheableFeature = { ...feature, playlistContexts: [] };
      const values = {
        id: `${feature.provider}:${feature.providerTrackId}`,
        provider: feature.provider,
        providerTrackId: feature.providerTrackId,
        features: json(cacheableFeature),
        confidence: feature.confidence,
        updatedAt: syncedAt,
      };
      await db.insert(trackTasteFeatures).values(values).onConflictDoUpdate({
        target: trackTasteFeatures.id,
        set: { features: values.features, confidence: values.confidence, updatedAt: syncedAt },
      });
    }
    await db.update(userProfiles).set({ version: current.version + 1, updatedAt: syncedAt }).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async getTrackTasteFeatures(provider: string, providerTrackIds: string[]): Promise<TrackTasteFeatures[]> {
    if (!providerTrackIds.length) return [];
    const db = await this.db();
    const rows = await db.select().from(trackTasteFeatures).where(and(eq(trackTasteFeatures.provider, provider), inArray(trackTasteFeatures.providerTrackId, providerTrackIds))).all();
    return rows.map((row) => parse<TrackTasteFeatures>(row.features));
  }

  async createContextSession(userId: string, inputText: string, imageMetadata: object | null, interpretation: ContextInterpretation): Promise<StoredContextSession> {
    const id = `ctx_${crypto.randomUUID()}`;
    const db = await this.db();
    await db.insert(contextSessions).values({ id, userId, inputType: interpretation.context.source, inputText, imageMetadata: imageMetadata ? json(imageMetadata) : null, structuredContext: json(interpretation.context), confidence: interpretation.context.confidence, aiProvider: interpretation.provider, clarification: interpretation.clarification });
    return { id, userId, inputText, context: interpretation.context, confidence: interpretation.context.confidence, clarification: interpretation.clarification, createdAt: new Date().toISOString() };
  }

  async getContextSession(userId: string, sessionId: string): Promise<StoredContextSession | null> {
    const db = await this.db();
    const row = await db.select().from(contextSessions).where(and(eq(contextSessions.id, sessionId), eq(contextSessions.userId, userId))).get();
    return row ? mapContext(row) : null;
  }

  async saveTracks(candidates: TrackCandidate[]): Promise<void> {
    if (!candidates.length) return;
    const db = await this.db();
    for (const track of candidates) {
      await db.insert(tracks).values({ id: track.id, provider: track.provider, providerTrackId: track.providerTrackId, title: track.title, artist: track.artist, durationMs: track.durationMs, coverVariant: track.coverVariant, tags: json(track.tags), features: json(track.features) }).onConflictDoUpdate({ target: tracks.id, set: { title: track.title, artist: track.artist, durationMs: track.durationMs, coverVariant: track.coverVariant, tags: json(track.tags), features: json(track.features), updatedAt: new Date().toISOString() } });
    }
  }

  async createRecommendation(userId: string, contextSessionId: string, profileVersion: number, modelVersion: string, ranked: RankedTrack[]): Promise<StoredRecommendation> {
    const id = `rec_${crypto.randomUUID()}`;
    const db = await this.db();
    await db.insert(recommendations).values({ id, userId, contextSessionId, profileVersion, mode: "autoplay", modelVersion });
    for (const track of ranked) {
      await db.insert(recommendationItems).values({ id: `ri_${crypto.randomUUID()}`, recommendationId: id, trackId: track.id, position: track.position, role: track.role, score: track.score, reason: track.reason, scoreBreakdown: json(track.scoreBreakdown) });
    }
    return { id, contextSessionId, profileVersion, createdAt: new Date().toISOString(), tracks: ranked };
  }

  async getRecommendation(userId: string, recommendationId: string): Promise<StoredRecommendation | null> {
    const db = await this.db();
    const recommendation = await db.select().from(recommendations).where(and(eq(recommendations.id, recommendationId), eq(recommendations.userId, userId))).get();
    if (!recommendation) return null;
    const items = await db.select().from(recommendationItems).where(eq(recommendationItems.recommendationId, recommendationId)).orderBy(recommendationItems.position).all();
    const trackRows = items.length ? await db.select().from(tracks).where(inArray(tracks.id, items.map((item) => item.trackId))).all() : [];
    const byId = new Map(trackRows.map((track) => [track.id, track]));
    const ranked = items.flatMap((item) => {
      const track = byId.get(item.trackId);
      if (!track) return [];
      return [{ ...mapTrack(track), position: item.position, role: item.role as RankedTrack["role"], score: item.score, reason: item.reason, scoreBreakdown: parse<ScoreBreakdown>(item.scoreBreakdown) }];
    });
    return { id: recommendation.id, contextSessionId: recommendation.contextSessionId, profileVersion: recommendation.profileVersion, createdAt: recommendation.createdAt, tracks: ranked };
  }

  async listHistory(userId: string, limit: number) {
    const db = await this.db();
    const sessions = await db.select().from(contextSessions).where(eq(contextSessions.userId, userId)).orderBy(desc(contextSessions.createdAt)).limit(limit).all();
    return Promise.all(sessions.map(async (row) => {
      const recommendation = await db.select().from(recommendations).where(eq(recommendations.contextSessionId, row.id)).orderBy(desc(recommendations.createdAt)).get();
      return { context: mapContext(row), recommendation: recommendation ? await this.getRecommendation(userId, recommendation.id) : null };
    }));
  }

  async deleteHistory(userId: string, sessionId: string): Promise<boolean> {
    const db = await this.db();
    const result = await db.delete(contextSessions).where(and(eq(contextSessions.id, sessionId), eq(contextSessions.userId, userId)));
    return (result.meta.changes ?? 0) > 0;
  }

  async recordPlaybackEvent(input: { id: string; clientEventId: string; userId: string; recommendationId: string | null; trackId: string; eventType: string; positionMs: number; occurredAt: string }): Promise<void> {
    const db = await this.db();
    await db.insert(playbackEvents).values(input).onConflictDoNothing({ target: playbackEvents.clientEventId });
  }

  async recordFeedback(input: { id: string; userId: string; recommendationId: string; trackId: string; type: string; scope: string; reason?: string | null; direction?: string | null }): Promise<string> {
    const db = await this.db();
    await db.insert(feedbackEvents).values(input);
    return input.id;
  }

  async undoFeedback(userId: string, feedbackId: string): Promise<boolean> {
    const db = await this.db();
    const result = await db.update(feedbackEvents).set({ status: "undone", updatedAt: new Date().toISOString() }).where(and(eq(feedbackEvents.id, feedbackId), eq(feedbackEvents.userId, userId), eq(feedbackEvents.status, "active")));
    return (result.meta.changes ?? 0) > 0;
  }
}

function mapProfile(row: typeof userProfiles.$inferSelect, musicProfile: AccountMusicProfile | null): UserProfile {
  return { userId: row.userId, version: row.version, personalizationEnabled: row.personalizationEnabled, explicit: parse(row.explicitPreferences), longTermTraits: parse(row.longTermTraits), scenePreferences: parse(row.scenePreferences), negativeTrackIds: parse(row.negativeTrackIds), musicProfile };
}

function mapContext(row: typeof contextSessions.$inferSelect): StoredContextSession {
  const stored = parse<StructuredContext>(row.structuredContext);
  const context = { ...stored, requestIntent: stored.requestIntent ?? "recommendation" as const, directPlay: stored.directPlay ?? null };
  return { id: row.id, userId: row.userId, inputText: row.inputText, context, confidence: row.confidence, clarification: row.clarification, createdAt: row.createdAt };
}

function mapTrack(row: typeof tracks.$inferSelect): TrackCandidate {
  return { id: row.id, provider: row.provider, providerTrackId: row.providerTrackId, title: row.title, artist: row.artist, durationMs: row.durationMs, coverVariant: row.coverVariant, tags: parse(row.tags), features: parse(row.features) };
}
