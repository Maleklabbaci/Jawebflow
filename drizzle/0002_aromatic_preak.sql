ALTER TABLE `bots` ADD `website_url` varchar(512);--> statement-breakpoint
ALTER TABLE `bots` ADD `business_category` varchar(160);--> statement-breakpoint
ALTER TABLE `bots` ADD `business_description` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `pricing_services_text` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `faq_text` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `special_rules_text` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `assistant_tone` varchar(32) DEFAULT 'professionnel' NOT NULL;--> statement-breakpoint
ALTER TABLE `bots` ADD `languages` json;--> statement-breakpoint
ALTER TABLE `bots` ADD `auto_lead_capture` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bots` ADD `bubble_theme` varchar(32) DEFAULT 'violet' NOT NULL;--> statement-breakpoint
ALTER TABLE `bots` ADD `bubble_position` varchar(32) DEFAULT 'bottom-right' NOT NULL;--> statement-breakpoint
ALTER TABLE `jawebflow_users` ADD `subscription_status` enum('free','active','past_due','canceled') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `jawebflow_users` ADD `plan` varchar(32) DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `jawebflow_users` ADD `messages_used` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jawebflow_users` ADD `messages_limit` int DEFAULT 100 NOT NULL;