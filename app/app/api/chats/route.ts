import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { all } from '@/lib/db';
import { apiData,apiError,readJson } from '@/lib/http';
import { createChat } from '@/lib/chat/service';
import type { Chat } from '@/lib/contracts';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const owner=await requireOwner(request),project=new URL(request.url).searchParams.get('project_id');return apiData(project?await all<Chat>('SELECT * FROM chats WHERE owner_id=? AND project_id=? ORDER BY updated_at DESC',owner,project):await all<Chat>('SELECT * FROM chats WHERE owner_id=? ORDER BY updated_at DESC',owner));}catch(error){return apiError(error);}}
export async function POST(request:Request){try{assertSameOrigin(request);const owner=await requireOwner(request);return apiData(await createChat(owner,await readJson(request)),201);}catch(error){return apiError(error);}}
