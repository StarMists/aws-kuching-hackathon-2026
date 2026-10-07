import { env } from 'cloudflare:workers';
import { ApiError } from './http';
import type { Project,Document,Page,Chunk } from './contracts';
export function db():D1Database{if(!env.DB)throw new ApiError(503,'STORAGE_UNAVAILABLE','The durable workspace database is unavailable.');return env.DB;}
export function bucket():R2Bucket{if(!env.BUCKET)throw new ApiError(503,'STORAGE_UNAVAILABLE','Private file storage is unavailable.');return env.BUCKET;}
export const newId=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function parseJson<T>(value:unknown,fallback:T):T{if(typeof value!=='string')return fallback;try{return JSON.parse(value) as T}catch{return fallback}}
export async function all<T>(sql:string,...values:(string|number|null)[]):Promise<T[]>{const result=await db().prepare(sql).bind(...values).all<T>();return result.results??[];}
export async function first<T>(sql:string,...values:(string|number|null)[]):Promise<T|null>{return await db().prepare(sql).bind(...values).first<T>();}
export async function ownedProject(owner:string,id:string):Promise<Project>{const row=await first<Project>('SELECT * FROM projects WHERE id=? AND owner_id=?',id,owner);if(!row)throw new ApiError(404,'PROJECT_NOT_FOUND','This project was not found in your workspace.');return row;}
export async function ownedDocument(owner:string,id:string):Promise<Document>{const row=await first<Document>('SELECT * FROM documents WHERE id=? AND owner_id=?',id,owner);if(!row)throw new ApiError(404,'DOCUMENT_NOT_FOUND','This document was not found in your workspace.');return row;}
export async function scopedDocuments(owner:string,projectId?:string|null,documentIds?:string[],readyOnly=true):Promise<Document[]>{
 if(projectId)await ownedProject(owner,projectId);
 if(documentIds&&documentIds.length>100)throw new ApiError(400,'TOO_MANY_DOCUMENTS','Select up to 100 documents.');
 const values:(string|number|null)[]=[owner];
 let sql='SELECT d.* FROM documents d WHERE d.owner_id=?';
 if(projectId){sql+=' AND EXISTS (SELECT 1 FROM project_documents pd WHERE pd.document_id=d.id AND pd.project_id=?)';values.push(projectId)}
 if(documentIds){if(!documentIds.length)return [];sql+=' AND d.id IN (SELECT value FROM json_each(?))';values.push(JSON.stringify(documentIds))}
 if(readyOnly)sql+=" AND d.status='ready'";
 sql+=' ORDER BY d.created_at DESC';
 const rows=await all<Document>(sql,...values);
 if(documentIds&&new Set(documentIds).size!==rows.length)throw new ApiError(400,'INVALID_DOCUMENT_SCOPE','One or more selected documents are unavailable or outside this project.');
 return rows;
}
export async function listCorpusPages(owner:string,projectId?:string|null,documentIds?:string[]):Promise<Array<Page&{document_title:string;version:string;source_date:string|null;document_type:string;source_sha256:string|null}>>{
 const docs=await scopedDocuments(owner,projectId,documentIds);if(!docs.length)return [];
 return all(`SELECT p.*,d.title AS document_title,d.version,d.source_date,d.document_type,d.source_sha256 FROM pages p JOIN documents d ON d.id=p.document_id WHERE p.document_id IN (SELECT value FROM json_each(?)) ORDER BY d.created_at,p.page_number`,JSON.stringify(docs.map(d=>d.id)));
}
export async function listCorpusChunks(owner:string,projectId?:string|null,documentIds?:string[]):Promise<Array<Chunk&{document_title:string;version:string;source_date:string|null;document_type:string;source_sha256:string|null}>>{
 const docs=await scopedDocuments(owner,projectId,documentIds);if(!docs.length)return [];
 return all(`SELECT c.*,d.title AS document_title,d.version,d.source_date,d.document_type,d.source_sha256 FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.document_id IN (SELECT value FROM json_each(?)) ORDER BY d.created_at,c.sequence LIMIT 6000`,JSON.stringify(docs.map(d=>d.id)));
}
