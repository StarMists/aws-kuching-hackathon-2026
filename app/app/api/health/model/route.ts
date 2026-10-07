import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { apiData,apiError,ApiError } from '@/lib/http';
import { generateText,AIError,aiReadiness } from '@/lib/ai';
import { reserveAIUsage,completeAIUsage } from '@/lib/intelligence/usage';
import { newId } from '@/lib/db';
export const dynamic='force-dynamic';
// Fixed public synthetic probe. Accepts no document, prompt, credential, or owner input.
export async function POST(request:Request){
 let reservation:string|undefined;
 try{
  assertSameOrigin(request);const owner=await requireOwner(request);const readiness=aiReadiness();
  if(!readiness.configured)throw new ApiError(503,'AI_NOT_CONFIGURED','Configure the approved free provider key before checking model readiness.');
  reservation=await reserveAIUsage(owner,newId(),readiness.provider,readiness.model,100,32);
  const result=await generateText({system:'This is a public synthetic API health check. Return only the text API_READY.',prompt:'Reply API_READY.',max_output_tokens:32,public_data_acknowledged:true,signal:AbortSignal.timeout(24_000)});
  await completeAIUsage(reservation,result);
  return apiData({reachable:true,verified_at:new Date().toISOString(),provider:result.provider,model:result.model,usage:result.usage,latency_ms:result.latency_ms,fallback_used:result.fallback_used,request_id:result.request_id||null,probe_valid:result.text.trim()==='API_READY'});
 }catch(error){if(reservation)await completeAIUsage(reservation,null,true).catch(()=>{});if(error instanceof AIError)return apiError(new ApiError(error.status,error.code,error.message));return apiError(error)}
}
