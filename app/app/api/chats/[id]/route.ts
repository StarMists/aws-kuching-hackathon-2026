import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { db,now } from '@/lib/db';
import { apiData,apiError,readJson,requiredString,ApiError } from '@/lib/http';
import { chatDetail,ownedChat } from '@/lib/chat/service';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await requireOwner(request),{id}=await params;return apiData(await chatDetail(owner,id));}catch(error){return apiError(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params,chat=await ownedChat(owner,id),body=await readJson(request);const title=body.title===undefined?chat.title:requiredString(body.title,'Title',160);const status=body.status===undefined?chat.status:body.status;if(status!=='active'&&status!=='archived')throw new ApiError(400,'INVALID_CHAT_STATUS','Choose active or archived.');await db().prepare('UPDATE chats SET title=?,status=?,updated_at=? WHERE id=? AND owner_id=?').bind(title,status,now(),id,owner).run();return apiData(await ownedChat(owner,id));}catch(error){return apiError(error);}}
