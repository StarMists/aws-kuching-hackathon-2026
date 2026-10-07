import { db } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { apiData,apiError } from '@/lib/http';
import { runtimeConfig } from '@/lib/config';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireOwner(request);await db().prepare('SELECT 1 AS ok').first();return apiData({status:'ok',database:'ready',runtime:runtimeConfig(),time:new Date().toISOString()})}catch(e){return apiError(e)}}
