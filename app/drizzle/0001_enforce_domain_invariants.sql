-- Append-only schema guards for AITLAU domain invariants. No seed or backfill data.

CREATE TRIGGER `tasks_valid_status_insert` BEFORE INSERT ON `tasks`
WHEN NEW.status NOT IN ('idle','queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_valid_status_update` BEFORE UPDATE ON `tasks`
WHEN NEW.status NOT IN ('idle','queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_jobs_valid_status_insert` BEFORE INSERT ON `chat_jobs`
WHEN NEW.status NOT IN ('queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_jobs_valid_status_update` BEFORE UPDATE ON `chat_jobs`
WHEN NEW.status NOT IN ('queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_valid_status_insert` BEFORE INSERT ON `analysis_jobs`
WHEN NEW.status NOT IN ('queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_valid_status_update` BEFORE UPDATE ON `analysis_jobs`
WHEN NEW.status NOT IN ('queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_messages_valid_status_insert` BEFORE INSERT ON `chat_messages`
WHEN NEW.status NOT IN ('queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_messages_valid_status_update` BEFORE UPDATE ON `chat_messages`
WHEN NEW.status NOT IN ('queued','processing','completed','failed','stopped')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `documents_valid_status_insert` BEFORE INSERT ON `documents`
WHEN NEW.status NOT IN ('pending','processing','ready','failed')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `documents_valid_status_update` BEFORE UPDATE ON `documents`
WHEN NEW.status NOT IN ('pending','processing','ready','failed')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_valid_status_insert` BEFORE INSERT ON `chats`
WHEN NEW.status NOT IN ('active','archived')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_valid_status_update` BEFORE UPDATE ON `chats`
WHEN NEW.status NOT IN ('active','archived')
BEGIN
  SELECT RAISE(ABORT, 'Invalid canonical status');
END;
--> statement-breakpoint
CREATE TRIGGER `projects_owner_immutable` BEFORE UPDATE OF owner_id ON `projects`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `documents_owner_immutable` BEFORE UPDATE OF owner_id ON `documents`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_owner_immutable` BEFORE UPDATE OF owner_id ON `tasks`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_owner_immutable` BEFORE UPDATE OF owner_id ON `chats`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_jobs_owner_immutable` BEFORE UPDATE OF owner_id ON `chat_jobs`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_owner_immutable` BEFORE UPDATE OF owner_id ON `analysis_jobs`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `notes_owner_immutable` BEFORE UPDATE OF owner_id ON `notes`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `artifacts_owner_immutable` BEFORE UPDATE OF owner_id ON `artifacts`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `ai_usage_owner_immutable` BEFORE UPDATE OF owner_id ON `ai_usage`
WHEN NEW.owner_id <> OLD.owner_id
BEGIN
  SELECT RAISE(ABORT, 'Record ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `project_documents_same_owner_insert` BEFORE INSERT ON `project_documents`
WHEN NOT EXISTS (SELECT 1 FROM projects p JOIN documents d ON d.id=NEW.document_id WHERE p.id=NEW.project_id AND p.owner_id=d.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project and document ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `project_documents_same_owner_update` BEFORE UPDATE ON `project_documents`
WHEN NOT EXISTS (SELECT 1 FROM projects p JOIN documents d ON d.id=NEW.document_id WHERE p.id=NEW.project_id AND p.owner_id=d.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project and document ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_project_owner_insert` BEFORE INSERT ON `chats`
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_project_owner_update` BEFORE UPDATE ON `chats`
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_project_owner_insert` BEFORE INSERT ON `tasks`
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_project_owner_update` BEFORE UPDATE ON `tasks`
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `notes_project_owner_insert` BEFORE INSERT ON `notes`
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `notes_project_owner_update` BEFORE UPDATE ON `notes`
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `artifacts_project_owner_insert` BEFORE INSERT ON `artifacts`
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `artifacts_project_owner_update` BEFORE UPDATE ON `artifacts`
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_project_owner_insert` BEFORE INSERT ON `analysis_jobs`
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_project_owner_update` BEFORE UPDATE ON `analysis_jobs`
WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id=NEW.project_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Project ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_document_owner_insert` BEFORE INSERT ON `tasks`
WHEN NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Source document ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_document_owner_update` BEFORE UPDATE ON `tasks`
WHEN NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND owner_id=NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Source document ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `document_predecessor_owner_insert` BEFORE INSERT ON `documents`
WHEN NEW.previous_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.previous_document_id AND owner_id=NEW.owner_id AND family_id=NEW.family_id)
BEGIN
  SELECT RAISE(ABORT, 'Document predecessor must share owner and family');
END;
--> statement-breakpoint
CREATE TRIGGER `document_predecessor_owner_update` BEFORE UPDATE ON `documents`
WHEN NEW.previous_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.previous_document_id AND owner_id=NEW.owner_id AND family_id=NEW.family_id)
BEGIN
  SELECT RAISE(ABORT, 'Document predecessor must share owner and family');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_jobs_ownership_insert` BEFORE INSERT ON `chat_jobs`
WHEN NOT EXISTS (SELECT 1 FROM chats c JOIN chat_messages req ON req.id=NEW.request_message_id JOIN chat_messages res ON res.id=NEW.response_message_id WHERE c.id=NEW.chat_id AND c.owner_id=NEW.owner_id AND req.chat_id=c.id AND res.chat_id=c.id AND req.role='user' AND res.role='assistant')
BEGIN
  SELECT RAISE(ABORT, 'Chat job envelope ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_jobs_ownership_update` BEFORE UPDATE ON `chat_jobs`
WHEN NOT EXISTS (SELECT 1 FROM chats c JOIN chat_messages req ON req.id=NEW.request_message_id JOIN chat_messages res ON res.id=NEW.response_message_id WHERE c.id=NEW.chat_id AND c.owner_id=NEW.owner_id AND req.chat_id=c.id AND res.chat_id=c.id AND req.role='user' AND res.role='assistant')
BEGIN
  SELECT RAISE(ABORT, 'Chat job envelope ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_sources_ownership_insert` BEFORE INSERT ON `chat_job_sources`
WHEN NOT EXISTS (SELECT 1 FROM chat_jobs j JOIN documents d ON d.id=NEW.document_id WHERE j.id=NEW.job_id AND j.owner_id=d.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Chat source ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_sources_ownership_update` BEFORE UPDATE ON `chat_job_sources`
WHEN NOT EXISTS (SELECT 1 FROM chat_jobs j JOIN documents d ON d.id=NEW.document_id WHERE j.id=NEW.job_id AND j.owner_id=d.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'Chat source ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_sources_immutable` BEFORE UPDATE ON `chat_job_sources`
WHEN NEW.job_id <> OLD.job_id OR NEW.document_id <> OLD.document_id OR NEW.source_sha256 IS NOT OLD.source_sha256
BEGIN
  SELECT RAISE(ABORT, 'Accepted chat sources are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_message_role_insert` BEFORE INSERT ON `chat_messages`
WHEN NEW.role NOT IN ('user','assistant') OR NEW.sequence < 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid ordered message envelope');
END;
--> statement-breakpoint
CREATE TRIGGER `chat_message_role_update` BEFORE UPDATE ON `chat_messages`
WHEN NEW.role NOT IN ('user','assistant') OR NEW.sequence < 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid ordered message envelope');
END;
--> statement-breakpoint
CREATE TRIGGER `message_part_type_insert` BEFORE INSERT ON `chat_message_parts`
WHEN NEW.type NOT IN ('text','citation') OR NEW.sequence < 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid ordered message part');
END;
--> statement-breakpoint
CREATE TRIGGER `message_part_type_update` BEFORE UPDATE ON `chat_message_parts`
WHEN NEW.type NOT IN ('text','citation') OR NEW.sequence < 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid ordered message part');
END;
--> statement-breakpoint
CREATE TRIGGER `citation_identity_insert` BEFORE INSERT ON `chat_message_parts`
WHEN NEW.type='citation' AND (NEW.citation_document_id IS NULL OR NEW.citation_page_number IS NULL OR NEW.citation_page_number<1 OR NEW.citation_chunk_id IS NULL OR NEW.citation_quote IS NULL OR length(NEW.citation_quote)=0 OR NOT EXISTS (SELECT 1 FROM chat_messages m JOIN chats ch ON ch.id=m.chat_id JOIN documents d ON d.id=NEW.citation_document_id JOIN chunks c ON c.id=NEW.citation_chunk_id WHERE m.id=NEW.message_id AND ch.owner_id=d.owner_id AND c.document_id=d.id AND c.page_number=NEW.citation_page_number))
BEGIN
  SELECT RAISE(ABORT, 'Citation must identify an owned source passage');
END;
--> statement-breakpoint
CREATE TRIGGER `citation_identity_update` BEFORE UPDATE ON `chat_message_parts`
WHEN NEW.type='citation' AND (NEW.citation_document_id IS NULL OR NEW.citation_page_number IS NULL OR NEW.citation_page_number<1 OR NEW.citation_chunk_id IS NULL OR NEW.citation_quote IS NULL OR length(NEW.citation_quote)=0 OR NOT EXISTS (SELECT 1 FROM chat_messages m JOIN chats ch ON ch.id=m.chat_id JOIN documents d ON d.id=NEW.citation_document_id JOIN chunks c ON c.id=NEW.citation_chunk_id WHERE m.id=NEW.message_id AND ch.owner_id=d.owner_id AND c.document_id=d.id AND c.page_number=NEW.citation_page_number))
BEGIN
  SELECT RAISE(ABORT, 'Citation must identify an owned source passage');
END;
--> statement-breakpoint
CREATE TRIGGER `pages_page_positive_insert` BEFORE INSERT ON `pages`
WHEN NEW.page_number < 1
BEGIN
  SELECT RAISE(ABORT, 'Page numbers must be positive');
END;
--> statement-breakpoint
CREATE TRIGGER `pages_page_positive_update` BEFORE UPDATE ON `pages`
WHEN NEW.page_number < 1
BEGIN
  SELECT RAISE(ABORT, 'Page numbers must be positive');
END;
--> statement-breakpoint
CREATE TRIGGER `chunks_page_positive_insert` BEFORE INSERT ON `chunks`
WHEN NEW.page_number < 1
BEGIN
  SELECT RAISE(ABORT, 'Page numbers must be positive');
END;
--> statement-breakpoint
CREATE TRIGGER `chunks_page_positive_update` BEFORE UPDATE ON `chunks`
WHEN NEW.page_number < 1
BEGIN
  SELECT RAISE(ABORT, 'Page numbers must be positive');
END;
--> statement-breakpoint
CREATE TRIGGER `chunk_page_identity_insert` BEFORE INSERT ON `chunks`
WHEN NOT EXISTS (SELECT 1 FROM pages WHERE id=NEW.page_id AND document_id=NEW.document_id AND page_number=NEW.page_number)
BEGIN
  SELECT RAISE(ABORT, 'Chunk must match its source page');
END;
--> statement-breakpoint
CREATE TRIGGER `chunk_page_identity_update` BEFORE UPDATE ON `chunks`
WHEN NOT EXISTS (SELECT 1 FROM pages WHERE id=NEW.page_id AND document_id=NEW.document_id AND page_number=NEW.page_number)
BEGIN
  SELECT RAISE(ABORT, 'Chunk must match its source page');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_artifact_owner_insert` BEFORE INSERT ON `analysis_jobs`
WHEN NEW.artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifacts WHERE id=NEW.artifact_id AND owner_id=NEW.owner_id AND project_id=NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'Result artifact ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `analysis_jobs_artifact_owner_update` BEFORE UPDATE ON `analysis_jobs`
WHEN NEW.artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifacts WHERE id=NEW.artifact_id AND owner_id=NEW.owner_id AND project_id=NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'Result artifact ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_artifact_owner_insert` BEFORE INSERT ON `tasks`
WHEN NEW.result_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifacts WHERE id=NEW.result_artifact_id AND owner_id=NEW.owner_id AND project_id=NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'Result artifact ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_artifact_owner_update` BEFORE UPDATE ON `tasks`
WHEN NEW.result_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifacts WHERE id=NEW.result_artifact_id AND owner_id=NEW.owner_id AND project_id=NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'Result artifact ownership must match');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_serial_processing_insert` BEFORE INSERT ON `tasks`
WHEN NEW.status='processing' AND EXISTS (SELECT 1 FROM tasks WHERE owner_id=NEW.owner_id AND id<>NEW.id AND status='processing')
BEGIN
  SELECT RAISE(ABORT, 'Only one source task may process per owner');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_serial_processing_update` BEFORE UPDATE ON `tasks`
WHEN NEW.status='processing' AND EXISTS (SELECT 1 FROM tasks WHERE owner_id=NEW.owner_id AND id<>NEW.id AND status='processing')
BEGIN
  SELECT RAISE(ABORT, 'Only one source task may process per owner');
END;
