'use client';
import { INGEST_LIMITS, type UploadMetadata } from './limits';
import { needsVisionOcr } from './chunks';

interface RenderedPage { page_number:number; content_type:'image/jpeg'; width:number; height:number; }
export interface PrepareUploadOptions { onProgress?:(message:string)=>void; signal?:AbortSignal; }
function aborted(signal?:AbortSignal):void { if (signal?.aborted) throw new DOMException('Upload was cancelled.','AbortError'); }
function jpegBlob(canvas:HTMLCanvasElement):Promise<Blob> {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The source page could not be rendered.')),'image/jpeg',0.86));
}
async function boundedJpeg(canvas:HTMLCanvasElement):Promise<Blob> {
  let blob=await jpegBlob(canvas);
  for(let attempt=0;blob.size>INGEST_LIMITS.max_page_image_bytes&&attempt<3;attempt++) {
    const smaller=document.createElement('canvas');smaller.width=Math.round(canvas.width*0.75);smaller.height=Math.round(canvas.height*0.75);
    smaller.getContext('2d')!.drawImage(canvas,0,0,smaller.width,smaller.height);canvas=smaller;blob=await jpegBlob(canvas);
  }
  if(blob.size>INGEST_LIMITS.max_page_image_bytes)throw new Error('This page image is too large. Use a lower-resolution scan.');
  return blob;
}

/** Exact-page images are generated in the user's browser; OCR itself is server-side API only. */
export async function prepareDocumentUpload(file:File,metadata:UploadMetadata={},options:PrepareUploadOptions={}):Promise<FormData> {
  if(!file.size)throw new Error('Choose a file with readable content.');
  if(file.size>INGEST_LIMITS.max_upload_bytes)throw new Error('Source files must be 20 MB or smaller.');
  aborted(options.signal);
  const form=new FormData();form.set('file',file);
  for(const [key,value] of Object.entries(metadata))if(value!==undefined&&value!==null&&value!=='')form.set(key,String(value));
  const images:RenderedPage[]=[];let totalBytes=file.size;
  const append=async(page:number,canvas:HTMLCanvasElement)=>{
    aborted(options.signal);const image=await boundedJpeg(canvas);totalBytes+=image.size;
    if(totalBytes>INGEST_LIMITS.max_request_bytes-1024*1024)throw new Error('This scan has too many large pages. Split it into smaller documents.');
    form.set(`page_image_${page}`,image,`page-${page}.jpg`);
    images.push({page_number:page,content_type:'image/jpeg',width:canvas.width,height:canvas.height});
  };
  const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
  if(isPdf) {
    options.onProgress?.('Reading PDF pages…');
    const pdfjs=await import('pdfjs-dist');
    const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,maxImageSize:INGEST_LIMITS.max_image_pixels,useSystemFonts:true,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true}).promise;
    try {
      if(pdf.numPages>INGEST_LIMITS.max_pages)throw new Error(`PDFs may contain at most ${INGEST_LIMITS.max_pages} pages.`);
      for(let number=1;number<=pdf.numPages;number++) {
        aborted(options.signal);const page=await pdf.getPage(number);const text=await page.getTextContent();
        const nativeText=text.items.map(item=>'str'in item?item.str:'').join(' ');
        if(needsVisionOcr(nativeText)) {
          if(!metadata.public_data_acknowledged)throw new Error('Scanned PDFs use the free Gemini OCR API. Confirm this document contains only public or permitted non-sensitive information before uploading.');
          if(images.length>=INGEST_LIMITS.max_ocr_pages)throw new Error(`Use at most ${INGEST_LIMITS.max_ocr_pages} scanned pages per document.`);
          options.onProgress?.(`Preparing scanned page ${number} of ${pdf.numPages}…`);
          const base=page.getViewport({scale:1});const scale=Math.min(2,1600/Math.max(base.width,base.height));const viewport=page.getViewport({scale});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const context=canvas.getContext('2d');if(!context)throw new Error('Your browser could not render this PDF page.');
          await page.render({canvas,canvasContext:context,viewport,background:'#ffffff'}).promise;
          await append(number,canvas);canvas.width=0;canvas.height=0;
        }
        page.cleanup();
      }
    } finally { await pdf.destroy(); }
  } else if(file.type.startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(file.name)) {
    if(!metadata.public_data_acknowledged)throw new Error('Photo transcription uses the free Gemini API. Confirm this image contains only public or permitted non-sensitive information before uploading.');
    options.onProgress?.('Preparing photo transcription…');
    const bitmap=await createImageBitmap(file);
    try {
      if(bitmap.width*bitmap.height>INGEST_LIMITS.max_image_pixels)throw new Error('Use a photo with no more than 12 megapixels.');
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('Your browser could not prepare this photo.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      await append(1,canvas);canvas.width=0;canvas.height=0;
    } finally {bitmap.close();}
  }
  if(images.length)form.set('page_images',JSON.stringify(images));
  return form;
}
