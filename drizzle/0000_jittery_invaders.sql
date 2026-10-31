CREATE TABLE `reclaim_workspaces` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
