CREATE TABLE `bots` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`business_name` varchar(160) NOT NULL,
	`widget_token` varchar(48) NOT NULL,
	`raw_knowledge` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bots_id` PRIMARY KEY(`id`),
	CONSTRAINT `bots_widget_token_unique` UNIQUE(`widget_token`)
);
--> statement-breakpoint
CREATE TABLE `jawebflow_users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jawebflow_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `jawebflow_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` varchar(36) NOT NULL,
	`bot_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`title` varchar(255) NOT NULL,
	`text_content` text,
	`storage_key` varchar(512),
	`storage_url` varchar(1024),
	`mime_type` varchar(127),
	`size_bytes` int NOT NULL DEFAULT 0,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `bots_user_id_idx` ON `bots` (`user_id`);--> statement-breakpoint
CREATE INDEX `knowledge_items_bot_id_idx` ON `knowledge_items` (`bot_id`);--> statement-breakpoint
CREATE INDEX `knowledge_items_user_id_idx` ON `knowledge_items` (`user_id`);