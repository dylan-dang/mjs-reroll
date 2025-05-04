PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`email` text NOT NULL,
	`uuid` text NOT NULL,
	PRIMARY KEY(`email`, `uuid`),
	FOREIGN KEY (`email`) REFERENCES `accounts`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_games`("email", "uuid") SELECT "email", "uuid" FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("email", "uid", "token") SELECT "email", "uid", "token" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_uid_unique` ON `accounts` (`uid`);