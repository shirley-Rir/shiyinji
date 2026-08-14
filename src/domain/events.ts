export type PlaybackEventType =
  | "started"
  | "paused"
  | "resumed"
  | "seeked"
  | "skipped"
  | "completed"
  | "failed";

export type FeedbackType = "like" | "dislike" | "more_like_this" | "direction";
export type FeedbackScope = "current_context" | "scene_profile" | "long_term";
