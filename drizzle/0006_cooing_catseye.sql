CREATE TABLE `rewards` (
	`id` integer,
	`email` text,
	FOREIGN KEY (`email`) REFERENCES `accounts`(`email`) ON UPDATE no action ON DELETE no action
);
