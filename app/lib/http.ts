import { AIError } from './ai/types';
export class ApiError extends Error {
  constructor(public status:number,public code:string,message:string,public details?:unknown){super(message);this.name='ApiError';}
}
export function apiData<T>(data:T,status=200):Response{return Response.json({data},{status,headers:{'Cache-Control':'no-store'}})}
export function apiError(error:unknown):Response{
  if(error instanceof AIError)return Response.json({error:{code:error.code,message:error.message,...(error.retry_after_ms===null?{}:{details:{retry_after_ms:error.retry_after_ms}})}},{status:error.status,headers:{'Cache-Control':'no-store'}});
  if(error instanceof ApiError)return Response.json({error:{code:error.code,message:error.message,...(error.details===undefined?{}:{details:error.details})}},{status:error.status,headers:{'Cache-Control':'no-store'}});
  console.error('api_failed',error instanceof Error?error.message:String(error));
  return Response.json({error:{code:'INTERNAL_ERROR',message:'The workspace could not complete this request. Please try again.'}},{status:500,headers:{'Cache-Control':'no-store'}});
}
export async function readJson<T=Record<string,unknown>>(request:Request):Promise<T>{try{return await request.json() as T}catch{throw new ApiError(400,'INVALID_JSON','Send a valid JSON request.')}}
export function requiredString(value:unknown,label:string,max=200):string{if(typeof value!=='string'||!value.trim())throw new ApiError(400,'INVALID_INPUT',`${label} is required.`);const result=value.trim();if(result.length>max)throw new ApiError(400,'INVALID_INPUT',`${label} must be ${max} characters or fewer.`);return result;}
