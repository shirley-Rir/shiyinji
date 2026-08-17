CREATE TABLE `account_music_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`version` integer NOT NULL,
	`profile` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_music_profiles_user_version` ON `account_music_profiles` (`user_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_account_music_profiles_user_created` ON `account_music_profiles` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`email_verified_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_sessions_token_hash` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user_expires` ON `auth_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_salt` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_codes_email_purpose_created` ON `email_verification_codes` (`email`,`purpose`,`created_at`);--> statement-breakpoint
CREATE TABLE `track_taste_features` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`features` text NOT NULL,
	`confidence` real NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_track_taste_features_provider_track` ON `track_taste_features` (`provider`,`provider_track_id`);--> statement-breakpoint
CREATE TABLE `user_library_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`sources` text NOT NULL,
	`playlist_ids` text NOT NULL,
	`playlist_contexts` text NOT NULL,
	`evidence_weight` real NOT NULL,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_library_tracks_provider_track` ON `user_library_tracks` (`user_id`,`provider`,`provider_track_id`);--> statement-breakpoint
CREATE INDEX `idx_user_library_tracks_user_synced` ON `user_library_tracks` (`user_id`,`synced_at`);