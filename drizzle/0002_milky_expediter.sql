CREATE TABLE `games` (
	`account_id` integer NOT NULL,
	`uuid` text NOT NULL,
	PRIMARY KEY(`account_id`, `uuid`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`uid` integer NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("email", "uid", "token") SELECT "email", "uid", "token" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `uid_index` ON `accounts` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_uid_unique` ON `accounts` (`uid`);