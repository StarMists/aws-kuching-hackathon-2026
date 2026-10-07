declare namespace Cloudflare {
 interface Env {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  AI_ENABLED?:string;
  GEMINI_API_KEY?:string;
  GEMINI_MODEL?:string;
  GEMINI_EMBEDDING_MODEL?:string;
  GROQ_API_KEY?:string;
  GROQ_MODEL?:string;
  OPENAI_API_KEY?:string;
  OPENAI_MODEL?:string;
  AI_DAILY_REQUEST_LIMIT?:string;
  AI_DAILY_TOKEN_LIMIT?:string;
 }
}
