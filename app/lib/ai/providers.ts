import { AIError, type AIConfig, type AIRequest, type AIResult, type AIUsage, type EmbeddingResult, type ProviderAdapter, type ProviderConfig } from './types';

// REST contracts checked against official docs on 2026-10-07:
// https://ai.google.dev/api/interactions-api
// https://console.groq.com/docs/api-reference
// https://console.groq.com/docs/structured-outputs
// https://ai.google.dev/gemini-api/docs/embeddings
const GEMINI_ENDPOINT='https://generativelanguage.googleapis.com/v1beta/interactions';
const GROQ_ENDPOINT='https://api.groq.com/openai/v1/chat/completions';
function numeric(value:unknown) { return typeof value==='number'&&Number.isFinite(value)&&value>=0 ? Math.floor(value) : 0; }
function obj(value:unknown):Record<string,unknown> { return value&&typeof value==='object'&&!Array.isArray(value) ? value as Record<string,unknown> : {}; }
export function estimateTokens(text:string):number {
  // Conservative bound for multilingual material; includes CJK/emoji rather than assuming 4 chars/token.
  let ascii=0,nonAscii=0;
  for(const char of text) { if(char.charCodeAt(0)<=127) ascii++; else nonAscii++; }
  return Math.ceil(ascii/3)+nonAscii+16;
}
function retryAfter(headers:Headers):number|null {
  const value=headers.get('retry-after');
  if(!value) return null;
  const seconds=Number(value);
  if(Number.isFinite(seconds)) return Math.max(0,Math.min(300000,Math.ceil(seconds*1000)));
  const date=Date.parse(value);
  return Number.isFinite(date)?Math.max(0,Math.min(300000,date-Date.now())):null;
}
async function responseJSON(response:Response,provider:string):Promise<Record<string,unknown>> {
  if(!response.ok) {
    // Never include upstream bodies: they can echo prompts, source documents, or secrets.
    const retryable=response.status===429||response.status>=500;
    const code=response.status===429?'AI_RATE_LIMIT':response.status===401||response.status===403?'AI_CREDENTIALS_REJECTED':response.status===404?'AI_MODEL_UNAVAILABLE':'AI_PROVIDER_ERROR';
    throw new AIError(code,`${provider} returned HTTP ${response.status}.`,response.status===429?429:503,retryable,retryAfter(response.headers));
  }
  if(Number(response.headers.get('content-length'))>1_000_000) throw new AIError('AI_RESPONSE_TOO_LARGE','The provider response exceeded the allowed size.',502);
  const raw=await response.text();
  if(raw.length>1_000_000) throw new AIError('AI_RESPONSE_TOO_LARGE','The provider response exceeded the allowed size.',502);
  try { return obj(JSON.parse(raw)); } catch { throw new AIError('AI_INVALID_RESPONSE','The provider returned invalid JSON.',502); }
}
function geminiText(payload:Record<string,unknown>):string {
  const steps=Array.isArray(payload.steps)?payload.steps:[];
  // Thought blocks and tool calls are intentionally excluded from user output.
  return steps.filter(s=>obj(s).type==='model_output').flatMap(s=>Array.isArray(obj(s).content)?obj(s).content as unknown[]:[]).filter(c=>obj(c).type==='text').map(c=>typeof obj(c).text==='string'?obj(c).text as string:'').join('');
}
function assertText(text:string,maxTokens:number) {
  if(!text.trim()) throw new AIError('AI_EMPTY_RESPONSE','The provider returned no answer.',502);
  if(text.length>Math.max(32000,maxTokens*20)) throw new AIError('AI_RESPONSE_TOO_LARGE','The generated answer exceeded the allowed size.',502);
}
export const geminiAdapter:ProviderAdapter={
  name:'gemini',
  async generate(request,config,signal,fetcher) {
    const started=Date.now();
    const input=request.image ? [{type:'text',text:request.prompt},{type:'image',data:request.image.base64,mime_type:request.image.mime_type}] : request.prompt;
    const body={model:config.model,system_instruction:request.system,input,store:false,stream:false,generation_config:{max_output_tokens:request.max_output_tokens,thinking_level:'low'},...(request.schema?{response_format:{type:'text',mime_type:'application/json',schema:request.schema}}:{})};
    const response=await fetcher(GEMINI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.api_key},body:JSON.stringify(body),signal});
    const payload=await responseJSON(response,'Gemini');
    if(payload.status!=='completed') throw new AIError('AI_INCOMPLETE_RESPONSE',`Gemini generation was ${typeof payload.status==='string'?payload.status:'incomplete'}.`,502);
    const text=geminiText(payload); assertText(text,request.max_output_tokens||1800);
    const u=obj(payload.usage);
    const usage:AIUsage={input_tokens:numeric(u.total_input_tokens),output_tokens:numeric(u.total_output_tokens),total_tokens:numeric(u.total_tokens),thought_tokens:numeric(u.total_thought_tokens)};
    if(!usage.total_tokens) {usage.input_tokens=estimateTokens(request.system+request.prompt);usage.output_tokens=estimateTokens(text);usage.total_tokens=usage.input_tokens+usage.output_tokens;usage.estimated=true;}
    return {text,provider:'gemini',model:typeof payload.model==='string'?payload.model:config.model,usage,latency_ms:Date.now()-started,...(typeof payload.id==='string'?{request_id:payload.id}:{})};
  },
};
export const groqAdapter:ProviderAdapter={
  name:'groq',
  async generate(request,config,signal,fetcher) {
    const started=Date.now();
    const content=request.image?[{type:'text',text:request.prompt},{type:'image_url',image_url:{url:`data:${request.image.mime_type};base64,${request.image.base64}`}}]:request.prompt;
    const response=await fetcher(GROQ_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.api_key}`},body:JSON.stringify({model:config.model,messages:[{role:'system',content:request.system},{role:'user',content}],max_completion_tokens:request.max_output_tokens,reasoning_effort:'low',stream:false,...(request.schema?{response_format:{type:'json_schema',json_schema:{name:(request.schema_name||'grounded_result').replace(/[^A-Za-z0-9_-]/g,'').slice(0,64),strict:true,schema:request.schema}}}:{})}),signal});
    const payload=await responseJSON(response,'Groq');
    const choice=obj(Array.isArray(payload.choices)?payload.choices[0]:null);
    if(choice.finish_reason!=='stop') throw new AIError('AI_INCOMPLETE_RESPONSE','Groq generation did not finish successfully.',502);
    const message=obj(choice.message);
    const text=typeof message.content==='string'?message.content:''; assertText(text,request.max_output_tokens||1800);
    const u=obj(payload.usage);
    const usage:AIUsage={input_tokens:numeric(u.prompt_tokens),output_tokens:numeric(u.completion_tokens),total_tokens:numeric(u.total_tokens)};
    if(!usage.total_tokens) {usage.input_tokens=estimateTokens(request.system+request.prompt);usage.output_tokens=estimateTokens(text);usage.total_tokens=usage.input_tokens+usage.output_tokens;usage.estimated=true;}
    return {text,provider:'groq',model:typeof payload.model==='string'?payload.model:config.model,usage,latency_ms:Date.now()-started,...(typeof payload.id==='string'?{request_id:payload.id}:{})};
  },
};
const adapters:Partial<Record<ProviderConfig['provider'],ProviderAdapter>>={gemini:geminiAdapter,groq:groqAdapter};
export function ensureAIReady(config:AIConfig,acknowledged:boolean|undefined) {
  if(!config.enabled) throw new AIError('AI_DISABLED','AI is disabled. Configure approved server-side provider secrets and enable AI.',503);
  if(!config.primary&&!config.fallback) throw new AIError('AI_NOT_CONFIGURED','No approved AI provider is configured.',503);
  if(acknowledged!==true) throw new AIError('PUBLIC_DATA_ACK_REQUIRED','Confirm that all submitted documents and prompts are public or synthetic before using free-tier AI.',422);
}
function sleep(ms:number,signal?:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    if(signal?.aborted) return reject(new AIError('AI_CANCELLED','Generation was cancelled.',499));
    const cancelled=()=>{clearTimeout(timer);reject(new AIError('AI_CANCELLED','Generation was cancelled.',499));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancelled);resolve();},ms);
    signal?.addEventListener('abort',cancelled,{once:true});
  });
}
async function attempt(request:AIRequest,config:ProviderConfig,timeout:number,fetcher:typeof fetch) {
  const adapter=adapters[config.provider];
  if(!adapter) throw new AIError('AI_PROVIDER_UNSUPPORTED','This provider is not enabled for the current free-only project.',503);
  const controller=new AbortController();
  let timedOut=false;
  const cancelled=()=>controller.abort();
  request.signal?.addEventListener('abort',cancelled,{once:true});
  if(request.signal?.aborted) controller.abort();
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
  try { return await adapter.generate(request,config,controller.signal,fetcher); }
  catch(error) {
    if(request.signal?.aborted) throw new AIError('AI_CANCELLED','Generation was cancelled.',499);
    if(timedOut) throw new AIError('AI_TIMEOUT','The AI provider timed out.',504,true);
    if(error instanceof AIError) throw error;
    throw new AIError('AI_NETWORK_ERROR','The AI provider could not be reached.',503,true);
  } finally {clearTimeout(timer);request.signal?.removeEventListener('abort',cancelled);}
}
export async function generateWithConfig(request:AIRequest,config:AIConfig,fetcher:typeof fetch=fetch):Promise<AIResult> {
  ensureAIReady(config,request.public_data_acknowledged);
  if(request.signal?.aborted) throw new AIError('AI_CANCELLED','Generation was cancelled.',499);
  const maxOutput=Math.min(config.max_output_tokens,Math.max(128,request.max_output_tokens||config.max_output_tokens));
  const estimate=estimateTokens(request.system+request.prompt+JSON.stringify(request.schema||{}))+(request.image?2048:0);
  if(estimate>config.max_input_tokens) throw new AIError('AI_INPUT_BUDGET_EXCEEDED',`The prompt exceeds the ${config.max_input_tokens}-token input budget. Narrow the selected source documents.`,413);
  const choices=[config.primary,config.fallback].filter((p):p is ProviderConfig=>!!p).map(p=>request.image?{...p,model:p.provider==='gemini'?(p.vision_model||p.model):(p.vision_model||'')}:p).filter(p=>!!p.model);
  if(!choices.length) throw new AIError('OCR_NOT_CONFIGURED','No supported vision provider is configured.',503);
  let lastError:AIError|null=null,attempts=0;
  const started=Date.now();
  for(let providerIndex=0;providerIndex<choices.length;providerIndex++) {
    const choice=choices[providerIndex];
    for(let retry=0;retry<=config.max_retries;retry++) {
      if(request.signal?.aborted) throw new AIError('AI_CANCELLED','Generation was cancelled.',499);
      const remaining=24000-(Date.now()-started);
      if(remaining<1000) throw lastError||new AIError('AI_TIMEOUT','The bounded generation window expired. Retry the durable job.',504,true);
      attempts++;
      try {const result=await attempt({...request,max_output_tokens:maxOutput},choice,Math.min(config.timeout_ms,remaining),fetcher);return {...result,fallback_used:providerIndex>0||(!config.primary&&!!config.fallback),attempts,cached:false,latency_ms:Date.now()-started};}
      catch(error) {
        lastError=error instanceof AIError?error:new AIError('AI_PROVIDER_ERROR','AI generation failed.',503);
        if(lastError.code==='AI_CANCELLED') throw lastError;
        // Prefer the already-approved backup on rate limits/timeouts, avoiding repeated quota pressure.
        if(providerIndex<choices.length-1) break;
        if(!lastError.retryable||retry===config.max_retries) break;
        const delay=lastError.retry_after_ms??Math.min(2000,500*2**retry);
        if(delay>5000||Date.now()-started+delay+1000>=24000) break;
        await sleep(delay,request.signal);
      }
    }
  }
  throw lastError||new AIError('AI_NOT_CONFIGURED','No AI provider is available.',503);
}
export async function embeddingWithConfig(text:string,task:'query'|'document',config:AIConfig,options:{signal?:AbortSignal;public_data_acknowledged?:boolean}={},fetcher:typeof fetch=fetch):Promise<EmbeddingResult> {
  ensureAIReady(config,options.public_data_acknowledged);
  const gemini=[config.primary,config.fallback].find(p=>p?.provider==='gemini');
  if(!config.embedding_model||!gemini) throw new AIError('EMBEDDING_NOT_CONFIGURED','Semantic search requires a configured Gemini embedding model.',503);
  if(options.signal?.aborted) throw new AIError('AI_CANCELLED','Embedding was cancelled.',499);
  const input= config.embedding_model==='gemini-embedding-2'?`task: ${task==='query'?'retrieval query':'retrieval document'} | ${task==='query'?'query':'text'}: ${text}`:text;
  const tokens=estimateTokens(input);
  if(tokens>Math.min(1800,config.max_input_tokens)) throw new AIError('AI_INPUT_BUDGET_EXCEEDED','Embedding text exceeds the bounded input budget.',413);
  const controller=new AbortController();
  const cancelled=()=>controller.abort();options.signal?.addEventListener('abort',cancelled,{once:true});
  const timer=setTimeout(()=>controller.abort(),config.timeout_ms);
  try {
    const response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.embedding_model)}:embedContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':gemini.api_key},body:JSON.stringify({model:`models/${config.embedding_model}`,content:{parts:[{text:input}]},output_dimensionality:768,...(config.embedding_model==='gemini-embedding-001'?{task_type:task==='query'?'RETRIEVAL_QUERY':'RETRIEVAL_DOCUMENT'}:{})}),signal:controller.signal});
    const payload=await responseJSON(response,'Gemini embeddings');
    const embedding=obj(payload.embedding);
    if(!Array.isArray(embedding.values)||embedding.values.length!==768||!embedding.values.every(v=>typeof v==='number'&&Number.isFinite(v))) throw new AIError('AI_INVALID_RESPONSE','The embedding provider returned an invalid vector.',502);
    const values=embedding.values as number[];
    const norm=Math.sqrt(values.reduce((sum,v)=>sum+v*v,0));
    if(norm<=0) throw new AIError('AI_INVALID_RESPONSE','The embedding vector has zero magnitude.',502);
    return {values:values.map(v=>v/norm),provider:'gemini',model:config.embedding_model,input_tokens_estimate:tokens};
  } catch(error) {if(options.signal?.aborted) throw new AIError('AI_CANCELLED','Embedding was cancelled.',499);if(error instanceof AIError) throw error;throw new AIError('AI_NETWORK_ERROR','The embedding provider could not be reached.',503,true);}
  finally {clearTimeout(timer);options.signal?.removeEventListener('abort',cancelled);}
}
