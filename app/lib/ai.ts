/** Server runtime entry point; keys never leave Cloudflare Workers bindings. */
import { env } from 'cloudflare:workers';
import { readAIConfig,publicAIConfig } from './ai/config';
import { generateWithConfig,embeddingWithConfig } from './ai/providers';
import { visionWithConfig } from './ai/vision';
import type { AIRequest,VisionPageRequest } from './ai/types';
export { AIError } from './ai/types';
export type { AIRequest,AIResult,AIReceipt,AIUsage,VisionPageRequest,VisionPageResult,EmbeddingResult,JSONSchema } from './ai/types';
export function getAIConfig() {return readAIConfig(env as unknown as Record<string,unknown>);}
export function aiReadiness() {const config=getAIConfig();return {...publicAIConfig(config),embedding_model:config.embedding_model};}
export function generateText(request:AIRequest) {return generateWithConfig(request,getAIConfig());}
export function embedText(text:string,options:{task:'query'|'document';signal?:AbortSignal;public_data_acknowledged?:boolean}) {return embeddingWithConfig(text,options.task,getAIConfig(),options);}
export function extractVisionPage(request:VisionPageRequest) {return visionWithConfig(request,getAIConfig());}
