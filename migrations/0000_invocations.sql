CREATE TABLE `invocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`source` text NOT NULL,
	`action` text NOT NULL,
	`outcome` text NOT NULL,
	`summary` text NOT NULL,
	`actor` text,
	`payload` text
);
--> statement-breakpoint
CREATE INDEX `invocations_at` ON `invocations` (`at`);