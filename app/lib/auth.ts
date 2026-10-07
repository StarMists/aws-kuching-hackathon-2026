import { ApiError } from './http';
export async function requireOwner(request:Request):Promise<string>{
  const id=request.headers.get('oai-authenticated-user-id');
  const email=request.headers.get('oai-authenticated-user-email');
  if(id&&email)return id;
  throw new ApiError(401,'SIGN_IN_REQUIRED','Sign in with ChatGPT to open your private workspace.');
}
export function assertSameOrigin(request:Request):void{
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)throw new ApiError(403,'INVALID_ORIGIN','This request must come from the workspace.');
}
