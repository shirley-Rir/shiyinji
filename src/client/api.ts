export type ApiTrack = {
  track_id: string;
  provider: string;
  position: number;
  role: "top_pick" | "alternative";
  title: string;
  artist: string;
  cover_variant: string;
  duration_ms: number;
  reason: string;
  tags: string[];
  score: number;
  features: {
    genres: string[];
    lyric_density: "none" | "low" | "medium" | "high";
    energy: number;
    familiarity: number;
    provenance: {
      genres: "wiki" | "search" | "inferred";
      lyricDensity: "lyrics" | "instrumental-signal" | "inferred";
      energy: "wiki-bpm" | "genre-heuristic";
      familiarity: "account-history" | "anonymous";
      confidence: number;
    } | null;
  };
};

export type ApiContext = {
  current_mood: string[];
  target_mood: string[];
  activity: string | null;
  environment: string[];
  target_energy: number;
  confidence: number;
};

export type ApiProfile = {
  user_id: string;
  version: number;
  personalization_enabled: boolean;
  explicit: {
    likedArtists: string[];
    likedGenres: string[];
    dislikedArtists: string[];
    dislikedGenres: string[];
    languages: string[];
    familiarityBias: number;
  };
  long_term_traits: string[];
  scene_preferences: Record<string, { targetEnergy: number; lyricTolerance: string; preferredTags: string[] }>;
};

export type NeteaseConnection = {
  status: "disconnected" | "waiting" | "scanned" | "connected" | "unavailable";
  source: "password" | "qr" | null;
  connectedAt: string | null;
  message: string | null;
  taste: { likedCount: number; recordCount: number; preferredGenres: string[] } | null;
};

type RecommendationResponse = {
  recommendation_id: string;
  context_session_id: string;
  profile_version: number;
  generated_at: string;
  tracks: ApiTrack[];
};

export async function createContextRecommendation(text: string, image?: File | null) {
  const form = new FormData();
  form.set("text", text);
  form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (image) form.set("image", image);
  const context = await request<{ context_session_id: string; context: ApiContext; clarification: string | null; provider: string }>("/api/v1/context-sessions", { method: "POST", body: form });
  const recommendation = await request<RecommendationResponse>("/api/v1/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context_session_id: context.context_session_id, mode: "autoplay", count: 5 }),
  });
  return { context, recommendation };
}

export async function resolvePlayback(recommendationId: string, trackId: string) {
  return request<{ playback_handle: string; track_id: string; url: string; mime_type: string; expires_at: string }>("/api/v1/playback/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recommendation_id: recommendationId, track_id: trackId }),
  });
}

export async function adjustRecommendation(recommendationId: string, direction: string) {
  return request<RecommendationResponse>(`/api/v1/recommendations/${encodeURIComponent(recommendationId)}/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction }),
  });
}

export async function recordPlayback(input: { recommendationId: string | null; trackId: string; eventType: string; positionMs?: number }) {
  return request<{ accepted: boolean }>("/api/v1/events/playback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: `client_${crypto.randomUUID()}`, recommendation_id: input.recommendationId, track_id: input.trackId, event_type: input.eventType, position_ms: input.positionMs ?? 0, occurred_at: new Date().toISOString() }),
  });
}

export async function sendFeedback(input: { recommendationId: string; trackId: string; type: "like" | "dislike" | "direction"; scope: "current_context" | "scene_profile" | "long_term"; reason?: string; direction?: string }) {
  return request<{ feedback_id: string; status: string }>("/api/v1/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recommendation_id: input.recommendationId, track_id: input.trackId, type: input.type, scope: input.scope, reason: input.reason ?? null, direction: input.direction ?? null }),
  });
}

export async function getProfile() {
  return request<{ profile: ApiProfile }>("/api/v1/profile");
}

export async function updatePrivacy(personalizationEnabled: boolean) {
  return request<{ profile: ApiProfile }>("/api/v1/settings/privacy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personalization_enabled: personalizationEnabled }),
  });
}

export async function getNeteaseConnection() {
  return request<{ connection: NeteaseConnection }>("/api/v1/music-connections/netease");
}

export async function createNeteaseQr() {
  return request<{ key: string; qr_image: string; connection: Pick<NeteaseConnection, "status"> }>("/api/v1/music-connections/netease", { method: "POST" });
}

export async function checkNeteaseQr(key: string) {
  return request<{ connection: NeteaseConnection }>("/api/v1/music-connections/netease", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

export async function disconnectNetease() {
  await request<null>("/api/v1/music-connections/netease", { method: "DELETE" });
}

export async function getHistory() {
  return request<{ sessions: Array<{ context_session_id: string; input_text: string; context: ApiContext; created_at: string; recommendation: RecommendationResponse | null }> }>("/api/v1/history");
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = isApiError(payload) ? payload.error?.message : null;
    throw new Error(message ?? `请求失败 (${response.status})`);
  }
  return payload as T;
}

function isApiError(value: unknown): value is { error?: { message?: string } } {
  return typeof value === "object" && value !== null && "error" in value;
}
