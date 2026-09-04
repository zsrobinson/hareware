CREATE TABLE `article_index` (
	`page_id` text PRIMARY KEY NOT NULL,
	`headline` text NOT NULL,
	`section` text,
	`status` text,
	`image_status` text,
	`author_byline` text,
	`publication_date` text,
	`last_edited` text NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `article_index_headline` ON `article_index` (`headline`);--> statement-breakpoint
CREATE TABLE `choice_options` (
	`property` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`property`, `name`)
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
