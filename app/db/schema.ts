import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id:text('id').primaryKey(), owner_id:text('owner_id').notNull(), name:text('name').notNull(), description:text('description').notNull().default(''), created_at:text('created_at').notNull(), updated_at:text('updated_at').notNull(),
}, t=>[index('projects_owner').on(t.owner_id)]);
export const documents = sqliteTable('documents', {
  id:text('id').primaryKey(), owner_id:text('owner_id').notNull(), title:text('title').notNull(), filename:text('filename').notNull(), content_type:text('content_type').notNull(), document_type:text('document_type').notNull().default('other'),department:text('department').notNull().default(''), source_date:text('source_date'), version:text('version').notNull().default('1'), family_id:text('family_id').notNull(), previous_document_id:text('previous_document_id'), status:text('status').notNull().default('pending'), extraction_method:text('extraction_method'), error_message:text('error_message'), r2_key:text('r2_key'), source_sha256:text('source_sha256'), page_count:integer('page_count').notNull().default(0), chunk_count:integer('chunk_count').notNull().default(0), created_at:text('created_at').notNull(), updated_at:text('updated_at').notNull(),
}, t=>[index('documents_owner').on(t.owner_id),index('documents_family').on(t.family_id),index('documents_hash').on(t.owner_id,t.source_sha256)]);
export const projectDocuments=sqliteTable('project_documents',{
  project_id:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),document_id:text('document_id').notNull().references(()=>documents.id,{onDelete:'cascade'}),added_at:text('added_at').notNull(),
}, t=>[uniqueIndex('project_documents_pair').on(t.project_id,t.document_id),index('project_documents_document').on(t.document_id)]);
export const pages=sqliteTable('pages',{
  id:text('id').primaryKey(),document_id:text('document_id').notNull().references(()=>documents.id,{onDelete:'cascade'}),page_number:integer('page_number').notNull(),text:text('text').notNull(),markdown:text('markdown').notNull(),extraction_method:text('extraction_method'),extraction_metadata_json:text('extraction_metadata_json').notNull().default('{}'),image_r2_key:text('image_r2_key'),created_at:text('created_at').notNull(),
},t=>[uniqueIndex('pages_document_number').on(t.document_id,t.page_number)]);
export const chunks=sqliteTable('chunks',{
  id:text('id').primaryKey(),document_id:text('document_id').notNull().references(()=>documents.id,{onDelete:'cascade'}),page_id:text('page_id').notNull().references(()=>pages.id,{onDelete:'cascade'}),page_number:integer('page_number').notNull(),sequence:integer('sequence').notNull(),text:text('text').notNull(),start_offset:integer('start_offset').notNull().default(0),end_offset:integer('end_offset').notNull().default(0),embedding_json:text('embedding_json'),embedding_model:text('embedding_model'),created_at:text('created_at').notNull(),
},t=>[index('chunks_document').on(t.document_id),uniqueIndex('chunks_document_sequence').on(t.document_id,t.sequence)]);
export const tasks=sqliteTable('tasks',{
  id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),document_id:text('document_id').references(()=>documents.id,{onDelete:'cascade'}),project_id:text('project_id').references(()=>projects.id,{onDelete:'cascade'}),kind:text('kind').notNull().default('ingestion'),queue_position:integer('queue_position'),queued_at:text('queued_at'),request_json:text('request_json').notNull().default('{}'),result_artifact_id:text('result_artifact_id'),status:text('status').notNull().default('idle'),attempt:integer('attempt').notNull().default(0),claim_id:text('claim_id'),lease_expires_at:text('lease_expires_at'),model:text('model'),error_message:text('error_message'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('tasks_owner_status').on(t.owner_id,t.status)]);
export const chats=sqliteTable('chats',{
  id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),project_id:text('project_id').references(()=>projects.id,{onDelete:'cascade'}),title:text('title').notNull(),status:text('status').notNull().default('active'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('chats_owner').on(t.owner_id)]);
export const chatMessages=sqliteTable('chat_messages',{
  id:text('id').primaryKey(),chat_id:text('chat_id').notNull().references(()=>chats.id,{onDelete:'cascade'}),role:text('role').notNull(),sequence:integer('sequence').notNull(),status:text('status').notNull().default('queued'),created_at:text('created_at').notNull(),
},t=>[uniqueIndex('chat_messages_sequence').on(t.chat_id,t.sequence)]);
export const chatMessageParts=sqliteTable('chat_message_parts',{
  id:text('id').primaryKey(),message_id:text('message_id').notNull().references(()=>chatMessages.id,{onDelete:'cascade'}),sequence:integer('sequence').notNull(),type:text('type').notNull(),text:text('text').notNull(),citation_document_id:text('citation_document_id'),citation_page_number:integer('citation_page_number'),citation_chunk_id:text('citation_chunk_id'),citation_quote:text('citation_quote'),metadata_json:text('metadata_json').notNull().default('{}'),
},t=>[uniqueIndex('message_parts_sequence').on(t.message_id,t.sequence)]);
export const chatJobs=sqliteTable('chat_jobs',{
  id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),chat_id:text('chat_id').notNull().references(()=>chats.id,{onDelete:'cascade'}),request_message_id:text('request_message_id').notNull().references(()=>chatMessages.id),response_message_id:text('response_message_id').notNull().references(()=>chatMessages.id),request_text:text('request_text').notNull(),request_json:text('request_json').notNull().default('{}'),status:text('status').notNull().default('queued'),attempt:integer('attempt').notNull().default(0),claim_id:text('claim_id'),lease_expires_at:text('lease_expires_at'),model:text('model'),error_message:text('error_message'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('chat_jobs_owner_status').on(t.owner_id,t.status),uniqueIndex('chat_jobs_request').on(t.request_message_id),uniqueIndex('chat_jobs_response').on(t.response_message_id)]);
export const chatJobSources=sqliteTable('chat_job_sources',{
  job_id:text('job_id').notNull().references(()=>chatJobs.id,{onDelete:'cascade'}),document_id:text('document_id').notNull().references(()=>documents.id),source_sha256:text('source_sha256'),
},t=>[uniqueIndex('chat_job_sources_pair').on(t.job_id,t.document_id)]);
export const artifacts=sqliteTable('artifacts',{
  id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),project_id:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),kind:text('kind').notNull(),title:text('title').notNull(),markdown:text('markdown').notNull().default(''),content_json:text('content_json').notNull().default('{}'),document_ids_json:text('document_ids_json').notNull().default('[]'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('artifacts_project').on(t.project_id)]);
export const notes=sqliteTable('notes',{
  id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),project_id:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),title:text('title').notNull(),content:text('content').notNull().default(''),citations_json:text('citations_json').notNull().default('[]'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('notes_project').on(t.project_id)]);

export const analysisJobs=sqliteTable('analysis_jobs',{
 id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),project_id:text('project_id').notNull().references(()=>projects.id,{onDelete:'cascade'}),kind:text('kind').notNull(),request_json:text('request_json').notNull(),source_snapshot_json:text('source_snapshot_json').notNull(),status:text('status').notNull().default('queued'),attempt:integer('attempt').notNull().default(0),lease_id:text('lease_id'),lease_expires_at:text('lease_expires_at'),artifact_id:text('artifact_id').references(()=>artifacts.id),error_message:text('error_message'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('analysis_jobs_owner_status').on(t.owner_id,t.status)]);
export const aiUsage=sqliteTable('ai_usage',{
 id:text('id').primaryKey(),owner_id:text('owner_id').notNull(),job_id:text('job_id'),provider:text('provider').notNull(),model:text('model').notNull(),input_tokens:integer('input_tokens').notNull().default(0),output_tokens:integer('output_tokens').notNull().default(0),status:text('status').notNull(),created_at:text('created_at').notNull(),
},t=>[index('ai_usage_owner_created').on(t.owner_id,t.created_at)]);
