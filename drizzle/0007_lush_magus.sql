PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rewards` (
	`id` integer NOT NULL,
	`email` text NOT NULL,
	PRIMARY KEY(`email`, `id`),
	FOREIGN KEY (`email`) REFERENCES `accounts`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_rewards`("id", "email") SELECT "id", "email" FROM `rewards`;--> statement-breakpoint
DROP TABLE `rewards`;--> statement-breakpoint
ALTER TABLE `__new_rewards` RENAME TO `rewards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;