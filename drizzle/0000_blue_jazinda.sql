CREATE TABLE `context_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`input_type` text NOT NULL,
	`input_text` text DEFAULT '' NOT NULL,
	`image_metadata` text,
	`structured_context` text NOT NULL,
	`confidence` real NOT NULL,
	`ai_provider` text NOT NULL,
	`clarification` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_context_sessions_user_created` ON `context_sessions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`track_id` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`reason` text,
	`direction` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_events_user_created` ON `feedback_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_feedback_events_recommendation` ON `feedback_events` (`recommendation_id`);--> statement-breakpoint
CREATE TABLE `music_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`encrypted_credential` text,
	`credential_expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_music_connections_user_provider` ON `music_connections` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `playback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`recommendation_id` text,
	`track_id` text NOT NULL,
	`event_type` text NOT NULL,
	`position_ms` integer DEFAULT 0 NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_playback_events_client_event` ON `playback_events` (`client_event_id`);--> statement-breakpoint
CREATE INDEX `idx_playback_events_user_created` ON `playback_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `recommendation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`role` text NOT NULL,
	`score` real NOT NULL,
	`reason` text NOT NULL,
	`score_breakdown` text NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recommendation_items_position` ON `recommendation_items` (`recommendation_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_recommendation_items_track` ON `recommendation_items` (`track_id`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context_session_id` text NOT NULL,
	`profile_version` integer NOT NULL,
	`mode` text NOT NULL,
	`model_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_session_id`) REFERENCES `context_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_recommendations_user_created` ON `recommendations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_recommendations_context` ON `recommendations` (`context_session_id`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`cover_variant` text NOT NULL,
	`tags` text NOT NULL,
	`features` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tracks_provider_track` ON `tracks` (`provider`,`provider_track_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`personalization_enabled` integer DEFAULT true NOT NULL,
	`explicit_preferences` text NOT NULL,
	`long_term_traits` text NOT NULL,
	`scene_preferences` text NOT NULL,
	`negative_track_ids` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);