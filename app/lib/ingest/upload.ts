import type { Document, Task } from '../contracts';
import { all, bucket, db, first, newId, now, ownedDocument, ownedProject } from '../db';
import { ApiError } from '../http';
import { needsVisionOcr, splitTextPages } from './chunks';
import { imageDimensions } from './images';
import { INGEST_LIMITS, type IngestionManifest, type IngestionPage, type IngestionRequest, type UploadMetadata } from './limits';
import { extractPdfPages } from './pdf';
import { decodeSourceText, detectContentType, sanitizeFilename, validateUploadMetadata } from './validation';

interface PageImage { page_number:number; bytes:Uint8Array; content_type:'image/png'|'image/jpeg'|'image/webp'; dimensions:{width:number;height:number}; }
export interface UploadResult { document:Document; task:Task; deduplicated:boolean }
interface SourceUpload { bytes:Uint8Array; filename:string; content_type:string; metadata:UploadMetadata; images:PageImage[]; auto_queue:boolean; }
async function readSource(request:Request):Promise<SourceUpload> {
  const length=Number(request.headers.get('content-length')||0);
  if(length>INGEST_LIMITS.max_request_bytes)throw new ApiError(413,'REQUEST_TOO_LARGE','This upload is too large. Split scanned documents into smaller files.');
  if(request.headers.get('content-type')?.includes('application/json')) {
    let input:Record<string,unknown>;
    try{input=await request.json() as Record<string,unknown>;}catch{throw new ApiError(400,'INVALID_JSON','Send a valid text-upload request.');}
    if(typeof input.text!=='string'||!input.text.trim())throw new ApiError(400,'EMPTY_TEXT','Text is required.');
    if(input.text.length>INGEST_LIMITS.max_text_chars)throw new ApiError(413,'TEXT_TOO_LARGE','Text may contain at most one million characters.');
    const filename=sanitizeFilename(typeof input.filename==='string'?input.filename:'source.txt');
    return {bytes:new TextEncoder().encode(input.text),filename,content_type:/\.(md|markdown)$/i.test(filename)?'text/markdown':'text/plain',metadata:validateUploadMetadata(input),images:[],auto_queue:input.auto_queue!==false};
  }
  let form:FormData;
  try{form=await request.formData();}catch{throw new ApiError(400,'INVALID_UPLOAD','Send a multipart upload with a file.');}
  const file=form.get('file');
  if(!file||typeof file==='string'||!('arrayBuffer'in file))throw new ApiError(400,'FILE_REQUIRED','Choose a source file to upload.');
  if(file.size>INGEST_LIMITS.max_upload_bytes)throw new ApiError(413,'FILE_TOO_LARGE','Source files must be 20 MB or smaller.');
  const fields:Record<string,unknown>={};
  for(const name of ['title','project_id','document_type','department','source_date','version','family_id','previous_document_id','public_data_acknowledged'])fields[name]=form.get(name);
  const images:PageImage[]=[];const manifest=form.get('page_images');
  if(manifest) {
    let descriptors:unknown;
    try{descriptors=JSON.parse(String(manifest));}catch{throw new ApiError(400,'INVALID_PAGE_IMAGES','The scanned-page manifest is invalid.');}
    if(!Array.isArray(descriptors)||descriptors.length>INGEST_LIMITS.max_ocr_pages)throw new ApiError(400,'INVALID_PAGE_IMAGES',`Use at most ${INGEST_LIMITS.max_ocr_pages} scanned-page images.`);
    const seen=new Set<number>();let totalBytes=file.size;
    for(const descriptor of descriptors) {
      const page=descriptor&&typeof descriptor==='object'?'page_number'in descriptor?descriptor.page_number:0:0;
      if(!Number.isInteger(page)||page<1||page>INGEST_LIMITS.max_pages||seen.has(page))throw new ApiError(400,'INVALID_PAGE_IMAGES','Scanned-page numbers must be unique and within the document.');
      seen.add(page);
      const image=form.get(`page_image_${page}`);
      if(!image||typeof image==='string'||!('arrayBuffer'in image)||image.size>INGEST_LIMITS.max_page_image_bytes)throw new ApiError(400,'INVALID_PAGE_IMAGES',`Scanned page ${page} is missing or exceeds 4 MB.`);
      const bytes=new Uint8Array(await image.arrayBuffer());totalBytes+=bytes.length;
      if(totalBytes>INGEST_LIMITS.max_request_bytes)throw new ApiError(413,'REQUEST_TOO_LARGE','The source and scanned-page images exceed the upload limit.');
      const mime=detectContentType(bytes,image.name,image.type);
      if(mime!=='image/png'&&mime!=='image/jpeg'&&mime!=='image/webp')throw new ApiError(400,'INVALID_PAGE_IMAGES','Scanned pages must be PNG, JPEG, or WebP images.');
      images.push({page_number:page,bytes,content_type:mime,dimensions:imageDimensions(bytes,mime)});
    }
  }
  return {bytes:new Uint8Array(await file.arrayBuffer()),filename:sanitizeFilename(file.name),content_type:file.type,metadata:validateUploadMetadata(fields),images,auto_queue:form.get('auto_queue')!=='false'};
}
export async function uploadDocument(owner:string,request:Request):Promise<UploadResult> {
  const source=await readSource(request);const mime=detectContentType(source.bytes,source.filename,source.content_type);const meta=source.metadata;
  if(meta.project_id)await ownedProject(owner,meta.project_id);
  let previous:Document|null=null;
  if(meta.previous_document_id)previous=await ownedDocument(owner,meta.previous_document_id);
  if(meta.family_id) {
    const family=await first<Document>('SELECT * FROM documents WHERE family_id=? AND owner_id=? LIMIT 1',meta.family_id,owner);
    if(!family)throw new ApiError(404,'VERSION_FAMILY_NOT_FOUND','Choose a version family from your own documents.');
    if(previous&&previous.family_id!==meta.family_id)throw new ApiError(400,'VERSION_FAMILY_MISMATCH','The previous document belongs to a different version family.');
  }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(source.bytes).buffer))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  // An ordinary repeated source upload returns the same durable object/task. Explicit versions remain distinct.
  if(!previous&&!meta.family_id) {
    const existing=await first<Document>('SELECT * FROM documents WHERE owner_id=? AND source_sha256=? ORDER BY created_at LIMIT 1',owner,hash);
    if(existing)return reuse(owner,existing,meta.project_id);
  }
  const id=newId();const family=previous?.family_id||meta.family_id||id;
  const version=meta.version||(previous?(/^\d+$/.test(previous.version)?String(Number(previous.version)+1):`${previous.version}.1`):'1');
  const sameVersion=await first<Document>('SELECT * FROM documents WHERE owner_id=? AND family_id=? AND version=?',owner,family,version);
  if(sameVersion) {
    if(sameVersion.source_sha256===hash)return reuse(owner,sameVersion,meta.project_id);
    throw new ApiError(409,'VERSION_EXISTS','This version already exists. Give the new source a different version label.');
  }
  let pages:IngestionPage[];
  if(mime==='application/pdf') {
    const textPages=await extractPdfPages(source.bytes);
    pages=textPages.map((text,index)=>({page_number:index+1,text,markdown:text,extraction_method:needsVisionOcr(text)?'vision_ocr':'pdf_text'}));
  } else if(mime==='text/plain'||mime==='text/markdown') {
    const textPages=splitTextPages(decodeSourceText(source.bytes));
    if(textPages.length>INGEST_LIMITS.max_pages)throw new ApiError(413,'TEXT_PAGE_LIMIT',`Use at most ${INGEST_LIMITS.max_pages} explicit form-feed pages.`);
    pages=textPages.map((text,index)=>({page_number:index+1,text,markdown:text,extraction_method:mime==='text/markdown'?'markdown':'plain_text'}));
  } else {
    imageDimensions(source.bytes,mime);
    pages=[{page_number:1,text:'',markdown:'',extraction_method:'vision_ocr'}];
    if(!source.images.length) {
      if(source.bytes.length>INGEST_LIMITS.max_page_image_bytes)throw new ApiError(413,'OCR_IMAGE_TOO_LARGE','Use the upload dialog to resize this image before transcription.');
      source.images.push({page_number:1,bytes:source.bytes,content_type:mime,dimensions:imageDimensions(source.bytes,mime)});
    }
  }
  const ocrPages=pages.filter(page=>page.extraction_method==='vision_ocr');
  if(ocrPages.length>INGEST_LIMITS.max_ocr_pages)throw new ApiError(413,'OCR_PAGE_LIMIT',`Use at most ${INGEST_LIMITS.max_ocr_pages} scanned pages per document.`);
  if(ocrPages.length&&!meta.public_data_acknowledged)throw new ApiError(400,'PUBLIC_DATA_ACKNOWLEDGEMENT_REQUIRED','Free Gemini OCR requires confirmation that the source contains only public, synthetic, or permitted non-sensitive information.');
  for(const image of source.images)if(image.page_number>pages.length)throw new ApiError(400,'INVALID_PAGE_IMAGES','A scanned-page image refers to a page outside the source.');
  const missing=ocrPages.filter(page=>!source.images.some(image=>image.page_number===page.page_number));
  if(missing.length)throw new ApiError(400,'OCR_PAGE_IMAGE_REQUIRED','Scanned PDF pages must be rendered by the upload dialog before transcription.',{page_numbers:missing.map(page=>page.page_number)});
  if(pages.some(page=>page.text.length>INGEST_LIMITS.max_page_chars))throw new ApiError(413,'PAGE_TEXT_LIMIT','A source page exceeds the readable-text limit.');
  const prefix=`sources/${encodeURIComponent(owner)}/${id}`;const originalKey=`${prefix}/original`;const manifestKey=`${prefix}/manifest.json`;const storage=bucket();
  const writtenKeys:string[]=[];
  try {
    await storage.put(originalKey,source.bytes,{httpMetadata:{contentType:mime},customMetadata:{owner_id:owner,document_id:id,source_sha256:hash,filename:source.filename}});writtenKeys.push(originalKey);
    for(const page of ocrPages) {
      const image=source.images.find(image=>image.page_number===page.page_number)!;const key=`${prefix}/page-${page.page_number}.${image.content_type==='image/png'?'png':image.content_type==='image/webp'?'webp':'jpg'}`;
      const imageHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(image.bytes).buffer))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
      await storage.put(key,image.bytes,{httpMetadata:{contentType:image.content_type},customMetadata:{owner_id:owner,document_id:id,page_number:String(page.page_number),source_sha256:hash,image_sha256:imageHash}});writtenKeys.push(key);
      page.image_r2_key=key;page.image_content_type=image.content_type;page.extraction_metadata={source_sha256:hash,source_artifact_sha256:imageHash,input_kind:mime==='application/pdf'?'browser_rendered_pdf_page':'source_photo',image_width:image.dimensions.width,image_height:image.dimensions.height};
    }
    const manifest:IngestionManifest={schema_version:1,source_sha256:hash,source_content_type:mime,total_pages:pages.length,pages};
    await storage.put(manifestKey,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'},customMetadata:{owner_id:owner,document_id:id,source_sha256:hash}});writtenKeys.push(manifestKey);
    const taskId=newId(),time=now();const payload:IngestionRequest={manifest_r2_key:manifestKey,source_sha256:hash,auto_queue:source.auto_queue,public_data_acknowledged:meta.public_data_acknowledged===true};
    const title=meta.title||source.filename.replace(/\.[^.]+$/,'')||'Untitled source';
    const statements=[
      db().prepare(`INSERT INTO documents (id,owner_id,title,filename,content_type,document_type,department,source_date,version,family_id,previous_document_id,status,r2_key,source_sha256,page_count,chunk_count,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,0,?,? WHERE NOT EXISTS (SELECT 1 FROM documents WHERE owner_id=? AND ${!previous&&!meta.family_id?'source_sha256=?':'family_id=? AND version=?'})`).bind(id,owner,title,source.filename,mime,meta.document_type||'other',meta.department||'',meta.source_date||null,version,family,previous?.id||null,originalKey,hash,pages.length,time,time,owner,...(!previous&&!meta.family_id?[hash]:[family,version])),
      db().prepare(`INSERT INTO tasks (id,owner_id,document_id,project_id,kind,request_json,status,attempt,created_at,updated_at) SELECT ?,?,?,?,'ingestion',?,'idle',0,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id=? AND owner_id=?)`).bind(taskId,owner,id,meta.project_id||null,JSON.stringify(payload),time,time,id,owner),
    ];
    if(meta.project_id)statements.push(db().prepare('INSERT OR IGNORE INTO project_documents (project_id,document_id,added_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id=? AND owner_id=?)').bind(meta.project_id,id,time,id,owner));
    if(source.auto_queue)statements.push(db().prepare("UPDATE tasks SET status='queued',queue_position=(SELECT COALESCE(MAX(queue_position),0)+1 FROM tasks WHERE owner_id=? AND status IN ('queued','processing')),queued_at=?,updated_at=? WHERE id=? AND owner_id=? AND status='idle'").bind(owner,time,time,taskId,owner));
    await db().batch(statements);
    const document=await first<Document>('SELECT * FROM documents WHERE id=? AND owner_id=?',id,owner);
    if(!document) {
      await storage.delete(writtenKeys);writtenKeys.length=0;
      const raced=await first<Document>(`SELECT * FROM documents WHERE owner_id=? AND ${!previous&&!meta.family_id?'source_sha256=?':'family_id=? AND version=?'} LIMIT 1`,owner,...(!previous&&!meta.family_id?[hash]:[family,version]));
      if(raced?.source_sha256===hash)return reuse(owner,raced,meta.project_id);
      throw new ApiError(409,'VERSION_EXISTS','This source version was created concurrently. Reload and choose a different version label.');
    }
    const task=await first<Task>('SELECT * FROM tasks WHERE id=? AND owner_id=?',taskId,owner);
    if(!task)throw new ApiError(500,'TASK_NOT_CREATED','The source was stored but its ingestion task could not be created.');
    return {document,task,deduplicated:false};
  } catch(error) {
    // Only uncommitted objects are removed; accepted source/version bytes are never overwritten or deleted.
    const committed=await first<Document>('SELECT * FROM documents WHERE id=? AND owner_id=?',id,owner).catch(()=>undefined);
    if(committed===null&&writtenKeys.length)await storage.delete(writtenKeys).catch(()=>undefined);
    throw error;
  }
}
async function reuse(owner:string,document:Document,projectId?:string):Promise<UploadResult> {
  if(projectId)await db().prepare('INSERT OR IGNORE INTO project_documents (project_id,document_id,added_at) VALUES (?,?,?)').bind(projectId,document.id,now()).run();
  const task=await first<Task>("SELECT * FROM tasks WHERE document_id=? AND owner_id=? AND kind='ingestion' ORDER BY created_at DESC LIMIT 1",document.id,owner);
  if(!task)throw new ApiError(409,'SOURCE_TASK_MISSING','The stored source has no ingestion task. Contact the workspace owner.');
  return {document,task,deduplicated:true};
}
export async function listDocuments(owner:string,projectId?:string|null):Promise<Document[]> {
  if(projectId)await ownedProject(owner,projectId);
  return projectId?all<Document>('SELECT d.* FROM documents d JOIN project_documents pd ON pd.document_id=d.id WHERE d.owner_id=? AND pd.project_id=? ORDER BY d.created_at DESC',owner,projectId):all<Document>('SELECT * FROM documents WHERE owner_id=? ORDER BY created_at DESC LIMIT 1000',owner);
}
