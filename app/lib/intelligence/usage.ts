import { env } from 'cloudflare:workers';
import { all,db,newId,now } from '../db';
import { ApiError } from '../http';
import type { AIReceipt } from '../ai/types';
export async function reserveAIUsage(owner:string,jobId:string,provider:string,model:string,inputEstimate=5000,outputEstimate=2000):Promise<string> {
  const e=env as unknown as Record<string,unknown>;
  const configured=Number(e.AI_DAILY_TOKEN_BUDGET);
  const budget=Number.isFinite(configured)&&configured>0?Math.min(200000,configured):50000;
  const id=newId(),timestamp=now(),start=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';
  // One conditional statement atomically reserves quota across isolates before a network call.
  const result=await db().prepare("INSERT INTO ai_usage (id,owner_id,job_id,provider,model,input_tokens,output_tokens,status,created_at) SELECT ?,?,?,?,?,?,?,'reserved',? WHERE COALESCE((SELECT SUM(input_tokens+output_tokens) FROM ai_usage WHERE owner_id=? AND created_at>=?),0)+?<=?").bind(id,owner,jobId,provider,model,inputEstimate,outputEstimate,timestamp,owner,start,inputEstimate+outputEstimate,budget).run();
  if(!result.meta.changes)throw new ApiError(429,'AI_DAILY_BUDGET_EXCEEDED','The workspace daily AI token budget is exhausted. Try after the next UTC day or reduce the configured budget usage.');
  return id;
}
export async function completeAIUsage(id:string,receipt:AIReceipt|null,failed=false) {
  if(receipt)await db().prepare('UPDATE ai_usage SET provider=?,model=?,input_tokens=?,output_tokens=?,status=? WHERE id=?').bind(receipt.provider,receipt.model,receipt.usage.input_tokens+(receipt.attempts>1?5000*(receipt.attempts-1):0),receipt.usage.output_tokens+(receipt.attempts>1?2000*(receipt.attempts-1):0),failed?'failed':receipt.attempts>1?'completed_with_unknown_prior_usage':'completed',id).run();
  else await db().prepare("UPDATE ai_usage SET status='failed_unknown_usage' WHERE id=?").bind(id).run(); // Preserve reservation if remote usage is unknown after timeout.
}
export async function releaseKnownUnusedReservation(id:string) {await db().prepare("UPDATE ai_usage SET input_tokens=0,output_tokens=0,status='rejected_before_generation' WHERE id=? AND status='reserved'").bind(id).run();}
export async function usageSummary(owner:string) {return all<{provider:string;model:string;input_tokens:number;output_tokens:number;calls:number}>('SELECT provider,model,SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens,COUNT(*) AS calls FROM ai_usage WHERE owner_id=? AND created_at>=? GROUP BY provider,model',owner,new Date().toISOString().slice(0,10)+'T00:00:00.000Z');}
