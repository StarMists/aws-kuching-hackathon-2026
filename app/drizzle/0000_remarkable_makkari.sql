CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_owner_created` ON `ai_usage` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`request_json` text NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_expires_at` text,
	`artifact_id` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `analysis_jobs_owner_status` ON `analysis_jobs` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	`document_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifacts_project` ON `artifacts` (`project_id`);--> statement-breakpoint
CREATE TABLE `chat_job_sources` (
	`job_id` text NOT NULL,
	`document_id` text NOT NULL,
	`source_sha256` text,
	FOREIGN KEY (`job_id`) REFERENCES `chat_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_job_sources_pair` ON `chat_job_sources` (`job_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `chat_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`request_message_id` text NOT NULL,
	`response_message_id` text NOT NULL,
	`request_text` text NOT NULL,
	`request_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`claim_id` text,
	`lease_expires_at` text,
	`model` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`response_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_jobs_owner_status` ON `chat_jobs` (`owner_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_jobs_request` ON `chat_jobs` (`request_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_jobs_response` ON `chat_jobs` (`response_message_id`);--> statement-breakpoint
CREATE TABLE `chat_message_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`text` text NOT NULL,
	`citation_document_id` text,
	`citation_page_number` integer,
	`citation_chunk_id` text,
	`citation_quote` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_parts_sequence` ON `chat_message_parts` (`message_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`sequence` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_sequence` ON `chat_messages` (`chat_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chats_owner` ON `chats` (`owner_id`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`sequence` integer NOT NULL,
	`text` text NOT NULL,
	`start_offset` integer DEFAULT 0 NOT NULL,
	`end_offset` integer DEFAULT 0 NOT NULL,
	`embedding_json` text,
	`embedding_model` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_document` ON `chunks` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chunks_document_sequence` ON `chunks` (`document_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`document_type` text DEFAULT 'other' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`source_date` text,
	`version` text DEFAULT '1' NOT NULL,
	`family_id` text NOT NULL,
	`previous_document_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`extraction_method` text,
	`error_message` text,
	`r2_key` text,
	`source_sha256` text,
	`page_count` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_owner` ON `documents` (`owner_id`);--> statement-breakpoint
CREATE INDEX `documents_family` ON `documents` (`family_id`);--> statement-breakpoint
CREATE INDEX `documents_hash` ON `documents` (`owner_id`,`source_sha256`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`citations_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_project` ON `notes` (`project_id`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`text` text NOT NULL,
	`markdown` text NOT NULL,
	`extraction_method` text,
	`extraction_metadata_json` text DEFAULT '{}' NOT NULL,
	`image_r2_key` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_document_number` ON `pages` (`document_id`,`page_number`);--> statement-breakpoint
CREATE TABLE `project_documents` (
	`project_id` text NOT NULL,
	`document_id` text NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_documents_pair` ON `project_documents` (`project_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `project_documents_document` ON `project_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`document_id` text,
	`project_id` text,
	`kind` text DEFAULT 'ingestion' NOT NULL,
	`queue_position` integer,
	`queued_at` text,
	`request_json` text DEFAULT '{}' NOT NULL,
	`result_artifact_id` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`claim_id` text,
	`lease_expires_at` text,
	`model` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_owner_status` ON `tasks` (`owner_id`,`status`);