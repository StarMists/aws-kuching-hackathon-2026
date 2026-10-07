import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { all,db,newId,now } from '@/lib/db';
import { apiData,apiError,readJson,requiredString } from '@/lib/http';
import type { Project } from '@/lib/contracts';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const owner=await requireOwner(request);return apiData(await all<Project>('SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC',owner))}catch(e){return apiError(e)}}
export async function POST(request:Request){try{assertSameOrigin(request);const owner=await requireOwner(request);const input=await readJson(request);const name=requiredString(input.name,'Project name',120);const description=typeof input.description==='string'?input.description.trim().slice(0,4000):'';const stamp=now();const project:Project={id:newId(),owner_id:owner,name,description,created_at:stamp,updated_at:stamp};await db().prepare('INSERT INTO projects(id,owner_id,name,description,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(project.id,owner,name,description,stamp,stamp).run();return apiData(project,201)}catch(e){return apiError(e)}}
