import { getDbBinding } from ".";

let initialization: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  initialization ??= createSchema().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

async function createSchema() {
  const db = getDbBinding();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE TABLE IF NOT EXISTS user_profiles (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, version INTEGER NOT NULL DEFAULT 1, personalization_enabled INTEGER NOT NULL DEFAULT 1, explicit_preferences TEXT NOT NULL, long_term_traits TEXT NOT NULL, scene_preferences TEXT NOT NULL, negative_track_ids TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS music_connections (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, status TEXT NOT NULL, encrypted_credential TEXT, credential_expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_music_connections_user_provider ON music_connections(user_id, provider)`,
    `CREATE TABLE IF NOT EXISTS context_sessions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, input_type TEXT NOT NULL, input_text TEXT NOT NULL DEFAULT '', image_metadata TEXT, structured_context TEXT NOT NULL, confidence REAL NOT NULL, ai_provider TEXT NOT NULL, clarification TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_context_sessions_user_created ON context_sessions(user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, provider_track_id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, duration_ms INTEGER NOT NULL, cover_variant TEXT NOT NULL, tags TEXT NOT NULL, features TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_provider_track ON tracks(provider, provider_track_id)`,
    `CREATE TABLE IF NOT EXISTS recommendations (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, context_session_id TEXT NOT NULL REFERENCES context_sessions(id) ON DELETE CASCADE, profile_version INTEGER NOT NULL, mode TEXT NOT NULL, model_version TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_recommendations_user_created ON recommendations(user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_recommendations_context ON recommendations(context_session_id)`,
    `CREATE TABLE IF NOT EXISTS recommendation_items (id TEXT PRIMARY KEY NOT NULL, recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id), position INTEGER NOT NULL, role TEXT NOT NULL, score REAL NOT NULL, reason TEXT NOT NULL, score_breakdown TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_items_position ON recommendation_items(recommendation_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_recommendation_items_track ON recommendation_items(track_id)`,
    `CREATE TABLE IF NOT EXISTS playback_events (id TEXT PRIMARY KEY NOT NULL, client_event_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recommendation_id TEXT REFERENCES recommendations(id) ON DELETE SET NULL, track_id TEXT NOT NULL REFERENCES tracks(id), event_type TEXT NOT NULL, position_ms INTEGER NOT NULL DEFAULT 0, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_playback_events_client_event ON playback_events(client_event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_playback_events_user_created ON playback_events(user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS feedback_events (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id), type TEXT NOT NULL, scope TEXT NOT NULL, reason TEXT, direction TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_events_user_created ON feedback_events(user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_events_recommendation ON feedback_events(recommendation_id)`,
  ];

  await db.batch(statements.map((statement) => db.prepare(statement)));
  await db.prepare("PRAGMA optimize").run();
}
