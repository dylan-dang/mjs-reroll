PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`token` text NOT NULL,
	`pulled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("email", "uid", "token", "pulled") SELECT "email", "uid", "token", "pulled" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_uid_unique` ON `accounts` (`uid`);