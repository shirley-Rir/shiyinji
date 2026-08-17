import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_users_email").on(table.email)]);

export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  emailVerifiedAt: text("email_verified_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const emailVerificationCodes = sqliteTable("email_verification_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  codeSalt: text("code_salt").notNull(),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_email_codes_email_purpose_created").on(table.email, table.purpose, table.createdAt),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_auth_sessions_token_hash").on(table.tokenHash),
  index("idx_auth_sessions_user_expires").on(table.userId, table.expiresAt),
]);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  personalizationEnabled: integer("personalization_enabled", { mode: "boolean" }).notNull().default(true),
  explicitPreferences: text("explicit_preferences").notNull(),
  longTermTraits: text("long_term_traits").notNull(),
  scenePreferences: text("scene_preferences").notNull(),
  negativeTrackIds: text("negative_track_ids").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountMusicProfiles = sqliteTable("account_music_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  version: integer("version").notNull(),
  profile: text("profile").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_account_music_profiles_user_version").on(table.userId, table.version),
  index("idx_account_music_profiles_user_created").on(table.userId, table.createdAt),
]);

export const userLibraryTracks = sqliteTable("user_library_tracks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerTrackId: text("provider_track_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  durationMs: integer("duration_ms").notNull().default(0),
  sources: text("sources").notNull(),
  playlistIds: text("playlist_ids").notNull(),
  playlistContexts: text("playlist_contexts").notNull(),
  evidenceWeight: real("evidence_weight").notNull(),
  syncedAt: text("synced_at").notNull(),
}, (table) => [
  uniqueIndex("idx_user_library_tracks_provider_track").on(table.userId, table.provider, table.providerTrackId),
  index("idx_user_library_tracks_user_synced").on(table.userId, table.syncedAt),
]);

export const trackTasteFeatures = sqliteTable("track_taste_features", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerTrackId: text("provider_track_id").notNull(),
  features: text("features").notNull(),
  confidence: real("confidence").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_track_taste_features_provider_track").on(table.provider, table.providerTrackId),
]);

export const musicConnections = sqliteTable("music_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  encryptedCredential: text("encrypted_credential"),
  credentialExpiresAt: text("credential_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_music_connections_user_provider").on(table.userId, table.provider),
]);

export const contextSessions = sqliteTable("context_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inputType: text("input_type").notNull(),
  inputText: text("input_text").notNull().default(""),
  imageMetadata: text("image_metadata"),
  structuredContext: text("structured_context").notNull(),
  confidence: real("confidence").notNull(),
  aiProvider: text("ai_provider").notNull(),
  clarification: text("clarification"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_context_sessions_user_created").on(table.userId, table.createdAt),
]);

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerTrackId: text("provider_track_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  durationMs: integer("duration_ms").notNull(),
  coverVariant: text("cover_variant").notNull(),
  tags: text("tags").notNull(),
  features: text("features").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_tracks_provider_track").on(table.provider, table.providerTrackId),
]);

export const recommendations = sqliteTable("recommendations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contextSessionId: text("context_session_id").notNull().references(() => contextSessions.id, { onDelete: "cascade" }),
  profileVersion: integer("profile_version").notNull(),
  mode: text("mode").notNull(),
  modelVersion: text("model_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_recommendations_user_created").on(table.userId, table.createdAt),
  index("idx_recommendations_context").on(table.contextSessionId),
]);

export const recommendationItems = sqliteTable("recommendation_items", {
  id: text("id").primaryKey(),
  recommendationId: text("recommendation_id").notNull().references(() => recommendations.id, { onDelete: "cascade" }),
  trackId: text("track_id").notNull().references(() => tracks.id),
  position: integer("position").notNull(),
  role: text("role").notNull(),
  score: real("score").notNull(),
  reason: text("reason").notNull(),
  scoreBreakdown: text("score_breakdown").notNull(),
}, (table) => [
  uniqueIndex("idx_recommendation_items_position").on(table.recommendationId, table.position),
  index("idx_recommendation_items_track").on(table.trackId),
]);

export const playbackEvents = sqliteTable("playback_events", {
  id: text("id").primaryKey(),
  clientEventId: text("client_event_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recommendationId: text("recommendation_id").references(() => recommendations.id, { onDelete: "set null" }),
  trackId: text("track_id").notNull().references(() => tracks.id),
  eventType: text("event_type").notNull(),
  positionMs: integer("position_ms").notNull().default(0),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_playback_events_client_event").on(table.clientEventId),
  index("idx_playback_events_user_created").on(table.userId, table.createdAt),
]);

export const feedbackEvents = sqliteTable("feedback_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recommendationId: text("recommendation_id").notNull().references(() => recommendations.id, { onDelete: "cascade" }),
  trackId: text("track_id").notNull().references(() => tracks.id),
  type: text("type").notNull(),
  scope: text("scope").notNull(),
  reason: text("reason"),
  direction: text("direction"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_feedback_events_user_created").on(table.userId, table.createdAt),
  index("idx_feedback_events_recommendation").on(table.recommendationId),
]);
