/** Server-only AI boundary. Never import runtime helpers from a client component. */
export type AIProviderName = 'gemini' | 'groq' | 'openai';
export type JSONSchema = Record<string, unknown>;
export interface AIUsage { input_tokens:number; output_tokens:number; total_tokens:number; thought_tokens?:number; estimated?:boolean }
export interface AIReceipt { provider:AIProviderName; model:string; usage:AIUsage; latency_ms:number; request_id?:string; fallback_used:boolean; attempts:number; cached:boolean }
export interface AIResult extends AIReceipt { text:string }
export interface AIImage { base64:string; mime_type:'image/png'|'image/jpeg'|'image/webp' }
export interface AIRequest {
  system:string;
  prompt:string;
  schema?:JSONSchema;
  schema_name?:string;
  max_output_tokens?:number;
  signal?:AbortSignal;
  image?:AIImage;
  public_data_acknowledged?:boolean;
}
export interface ProviderConfig { provider:AIProviderName; model:string; api_key:string; vision_model?:string }
export interface AIConfig {
  enabled:boolean;
  primary:ProviderConfig|null;
  fallback:ProviderConfig|null;
  embedding_model:string|null;
  data_policy:'public-synthetic-only';
  timeout_ms:number;
  max_input_tokens:number;
  max_output_tokens:number;
  max_retries:number;
}
export interface VisionPageRequest extends AIImage { page_number:number; signal?:AbortSignal; public_data_acknowledged?:boolean }
export interface VisionPageResult extends AIReceipt { text:string; markdown:string; illegible_regions:string[] }
export interface EmbeddingResult { values:number[]; provider:'gemini'; model:string; input_tokens_estimate:number }
export interface ProviderAdapter { readonly name:AIProviderName; generate(request:AIRequest,config:ProviderConfig,signal:AbortSignal,fetcher:typeof fetch):Promise<Omit<AIResult,'fallback_used'|'attempts'|'cached'>> }

export class AIError extends Error {
  readonly code:string;
  readonly status:number;
  readonly retryable:boolean;
  readonly retry_after_ms:number|null;
  constructor(code:string,message:string,status=503,retryable=false,retryAfter:number|null=null) {
    super(message); this.name='AIError'; this.code=code; this.status=status; this.retryable=retryable; this.retry_after_ms=retryAfter;
  }
}
