import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from './http';
const contexts=new AsyncLocalStorage<ExecutionContext>();
export function runWithWorkerContext<T>(ctx:ExecutionContext,fn:()=>T):T{return contexts.run(ctx,fn);}
export function background(work:Promise<unknown>):void{
 const ctx=contexts.getStore();
 if(!ctx)throw new ApiError(503,'BACKGROUND_UNAVAILABLE','Background execution is unavailable. Please retry.');
 ctx.waitUntil(work.catch(error=>{console.error('background_failed',error instanceof Error?error.message:String(error));}));
}
