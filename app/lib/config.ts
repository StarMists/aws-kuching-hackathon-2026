import { env } from 'cloudflare:workers';
import { aiReadiness } from './ai';
import type { RuntimeConfig } from './contracts';
export function runtimeConfig():RuntimeConfig{
 return {
  ...aiReadiness(),max_upload_bytes:20*1024*1024,supported_types:['application/pdf','text/plain','text/markdown','image/png','image/jpeg','image/webp'],
  max_document_pages:80,max_ocr_pages:20,storage:{database:!!env.DB,files:!!env.BUCKET},private_workspace:true,
 };
}
