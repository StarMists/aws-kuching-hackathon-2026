import { requireOwner } from '@/lib/auth';
import { apiData,apiError } from '@/lib/http';
import { runtimeConfig } from '@/lib/config';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireOwner(request);return apiData(runtimeConfig())}catch(e){return apiError(e)}}
