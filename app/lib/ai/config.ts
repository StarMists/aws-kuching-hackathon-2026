import { AIError, type AIConfig, type AIProviderName, type ProviderConfig } from './types';

export const DATA_POLICY_NOTICE = 'Gemini free-tier prompts may be used to improve Google products. Only submit public or synthetic documents and prompts.';
const GEMINI_FREE_MODELS = new Set(['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash']);
const GROQ_FREE_MODELS = new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b']);
function setting(env:Record<string,unknown>,key:string) { const value=env[key]; return typeof value==='string' ? value.trim() : ''; }
function bound(env:Record<string,unknown>,key:string,otherwise:number,min:number,max:number) { const value=Number(setting(env,key)); return Number.isFinite(value)&&value>0 ? Math.max(min,Math.min(max,Math.floor(value))) : otherwise; }
function provider(env:Record<string,unknown>,name:AIProviderName):ProviderConfig|null {
  if(name==='openai') return null; // Preserved adapter boundary; paid calls are deliberately not enabled.
  const key=setting(env,name==='gemini'?'GEMINI_API_KEY':'GROQ_API_KEY');
  if(!key) return null;
  const model=setting(env,name==='gemini'?'GEMINI_MODEL':'GROQ_MODEL') || (name==='gemini'?'gemini-3.8-flash':'openai/gpt-oss-120b');
  const allowed=name==='gemini'?GEMINI_FREE_MODELS:GROQ_FREE_MODELS;
  if(!allowed.has(model)) throw new AIError('MODEL_NOT_APPROVED',`${name} model is outside the configured free-model allowlist.`,503);
  const visionModel=setting(env,name==='gemini'?'GEMINI_VISION_MODEL':'GROQ_VISION_MODEL');
  if(visionModel && !(name==='gemini'?GEMINI_FREE_MODELS:GROQ_FREE_MODELS).has(visionModel)) throw new AIError('MODEL_NOT_APPROVED','The vision model is outside the configured free-model allowlist.',503);
  if(name==='groq'&&visionModel&&visionModel!=='qwen/qwen3.8-27b') throw new AIError('VISION_MODEL_UNSUPPORTED','The configured Groq model does not support images.',503);
  return {provider:name,model,api_key:key,...(visionModel?{vision_model:visionModel}:{})};
}
export function readAIConfig(env:Record<string,unknown>):AIConfig {
  const enabled=setting(env,'AI_ENABLED')==='true';
  const name=setting(env,'AI_PROVIDER') || 'gemini';
  if(name!=='gemini'&&name!=='groq') throw new AIError('PROVIDER_NOT_APPROVED','Only the approved free Gemini and Groq providers are enabled.',503);
  const primary=provider(env,name);
  const fallback=provider(env,name==='gemini'?'groq':'gemini');
  const embeddingModel=setting(env,'GEMINI_EMBEDDING_MODEL');
  if(embeddingModel && !['gemini-embedding-2','gemini-embedding-001'].includes(embeddingModel)) throw new AIError('EMBEDDING_MODEL_UNSUPPORTED','Configure a supported Gemini embedding model.',503);
  return {enabled,primary,fallback,embedding_model:embeddingModel||null,data_policy:'public-synthetic-only',timeout_ms:bound(env,'AI_TIMEOUT_MS',11000,1000,12000),max_input_tokens:bound(env,'AI_MAX_INPUT_TOKENS',5000,500,5500),max_output_tokens:bound(env,'AI_MAX_OUTPUT_TOKENS',1800,128,2000),max_retries:setting(env,'AI_MAX_RETRIES')==='0'?0:1};
}
export function publicAIConfig(config:AIConfig) {
  const active=config.primary||config.fallback;
  const vision=config.primary?.provider==='gemini'||!!config.primary?.vision_model||config.fallback?.provider==='gemini'||!!config.fallback?.vision_model;
  return {ai_enabled:config.enabled,provider:active?.provider||'gemini',model:active?.model||'gemini-3.8-flash',configured:config.enabled&&!!active,embedding_configured:config.enabled&&!!config.embedding_model&&!![config.primary,config.fallback].find(p=>p?.provider==='gemini'),ocr_configured:config.enabled&&vision,data_policy:config.data_policy,data_policy_notice:DATA_POLICY_NOTICE,free_tier:true,paid_calls_enabled:false,max_input_tokens:config.max_input_tokens,max_output_tokens:config.max_output_tokens,provider_model_verification:'configuration-only',fallback_configured:config.enabled&&!!config.fallback};
}
