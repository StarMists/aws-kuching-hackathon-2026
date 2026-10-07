export type TaskStatus = 'idle'|'queued'|'processing'|'completed'|'failed'|'stopped';
export type JobStatus = Exclude<TaskStatus,'idle'>;
export type DocumentStatus = 'pending'|'processing'|'ready'|'failed';
export type ArtifactKind = 'brief'|'timeline'|'conflict'|'gap'|'impact'|'replay'|'graph';
export interface Project { id:string; owner_id:string; name:string; description:string; created_at:string; updated_at:string }
export interface Document { id:string; owner_id:string; title:string; filename:string; content_type:string; document_type:string; department:string; source_date:string|null; version:string; family_id:string; previous_document_id:string|null; status:DocumentStatus; extraction_method:string|null; error_message:string|null; r2_key:string|null; source_sha256:string|null; page_count:number; chunk_count:number; created_at:string; updated_at:string }
export interface Page { id:string; document_id:string; page_number:number; text:string; markdown:string; created_at:string }
export interface Chunk { id:string; document_id:string; page_id:string; page_number:number; sequence:number; text:string; start_offset:number; end_offset:number; embedding_json:string|null; embedding_model:string|null; created_at:string }
export interface Task { id:string; owner_id:string; document_id:string|null; project_id?:string|null; kind?:string; request_json?:string; result_artifact_id?:string|null; model?:string|null; status:TaskStatus; attempt:number; error_message:string|null; created_at:string; updated_at:string }
export interface Chat { id:string; owner_id:string; project_id:string|null; title:string; status:'active'|'archived'; created_at:string; updated_at:string }
export interface Citation { document_id:string; document_title?:string; page_number:number; chunk_id:string; quote:string; source_sha256?:string|null }
export interface MessagePart { id:string; message_id:string; sequence:number; type:'text'|'citation'; text:string; citation_document_id:string|null; citation_page_number:number|null; citation_chunk_id:string|null; citation_quote:string|null; metadata_json:string }
export interface MessageView { id:string; chat_id:string; role:'user'|'assistant'; sequence:number; status:JobStatus; created_at:string; parts:MessagePart[]; text?:string; citations?:Citation[] }
export interface ChatJob { id:string; owner_id:string; chat_id:string; request_message_id:string; response_message_id:string; request_text:string; status:JobStatus; attempt:number; model:string|null; error_message:string|null; created_at:string; updated_at:string }
export interface SearchHit { chunk_id:string; document_id:string; document_title:string; page_number:number; text:string; score:number; mode?:string; source_date?:string|null; version?:string; document_type?:string; source_sha256?:string|null }
export interface Artifact { id:string; owner_id:string; project_id:string; kind:ArtifactKind; title:string; markdown:string; content_json:string; document_ids_json:string; created_at:string; updated_at:string; content?:unknown; document_ids?:string[] }
export interface Note { id:string; owner_id:string; project_id:string; title:string; content:string; citations_json?:string; citations?:Citation[]; created_at:string; updated_at:string }
export interface GraphNode { id:string; label:string; type:'document'|'topic'|'entity'|'decision'; document_id?:string; page_number?:number; count?:number }
export interface GraphEdge { source:string; target:string; type:string; weight?:number; evidence?:Citation[] }
export interface ProjectDetail { project:Project; documents:Document[]; chats:Chat[]; notes:Note[]; artifacts:Artifact[] }
export interface ApiResponse<T> { data:T }
export interface ApiErrorResponse { error:{code:string;message:string;details?:unknown} }
export interface RuntimeConfig { ai_enabled:boolean; provider:string; model:string; configured:boolean; embedding_configured:boolean; ocr_configured:boolean; max_upload_bytes:number; supported_types:string[]; [key:string]:unknown }
