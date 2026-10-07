import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chunkPageText,needsVisionOcr,splitTextPages } from './chunks';
import { decodeSourceText,detectContentType,sanitizeFilename,validateUploadMetadata } from './validation';
import { imageDimensions,bytesToBase64 } from './images';
import { extractPdfPages } from './pdf';
const fixtures=fileURLToPath(new URL('../../tests/fixtures/synthetic-civic/',import.meta.url));

test('chunks preserve exact page offsets and all nonblank source characters',()=>{
 const text=('Council recommendation: preserve the public square.\n繁體中文資料與下一步。😀\n').repeat(65);
 const chunks=chunkPageText(text,150,30);assert.ok(chunks.length>5);
 const coverage=new Uint8Array(text.length);
 for(const chunk of chunks){assert.equal(chunk.text,text.slice(chunk.start_offset,chunk.end_offset));assert.ok(chunk.text.length<=150);assert.ok(!/^[\uDC00-\uDFFF]/.test(chunk.text));assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.text));for(let i=chunk.start_offset;i<chunk.end_offset;i++)coverage[i]=1;}
 for(let i=0;i<text.length;i++)if(text[i].trim())assert.equal(coverage[i],1);
 assert.throws(()=>chunkPageText('text',50,50));
});
test('text pages follow explicit form feeds only',()=>{assert.deepEqual(splitTextPages('\uFEFFfirst\fsecond\n\nthird'),['first','second\n\nthird']);assert.equal(needsVisionOcr(''),true);assert.equal(needsVisionOcr('x'.repeat(24)),false);});
test('source type comes from magic bytes and binary sources cannot masquerade as text',()=>{
 assert.equal(detectContentType(new TextEncoder().encode('%PDF-1.7\n'),'wrong.txt','text/plain'),'application/pdf');
 assert.equal(detectContentType(new TextEncoder().encode('# Plan\nPublic proposal.'),'plan.md'),'text/markdown');
 assert.throws(()=>detectContentType(new TextEncoder().encode('not a pdf'),'source.pdf'),/PDF header/);
 assert.throws(()=>decodeSourceText(new Uint8Array([255,255])),/UTF-8/);assert.throws(()=>decodeSourceText(new Uint8Array([65,0,66])),/binary/);
 assert.equal(sanitizeFilename('../secret\nplan.txt'),'secretplan.txt');
});
test('metadata dates and privacy acknowledgement are validated explicitly',()=>{
 assert.equal(validateUploadMetadata({source_date:'2026-10-07',public_data_acknowledged:'true',department:'Council'}).public_data_acknowledged,true);
 assert.equal(validateUploadMetadata({public_data_acknowledged:'yes'}).public_data_acknowledged,false);
 assert.throws(()=>validateUploadMetadata({source_date:'2026-02-30'}),/real date/);assert.throws(()=>validateUploadMetadata({source_date:'2026-99-99'}),/real date/);
});
test('real photo headers are bounded and byte base64 is exact',async()=>{
 const bytes=new Uint8Array(await readFile(`${fixtures}/field-slip-photo.jpg`));const size=imageDimensions(bytes,'image/jpeg');assert.ok(size.width>500&&size.height>500);assert.equal(detectContentType(bytes,'photo.jpg'),'image/jpeg');
 assert.deepEqual(new Uint8Array(Buffer.from(bytesToBase64(bytes),'base64')),bytes);
 const png=new Uint8Array(24);const view=new DataView(png.buffer);view.setUint32(16,100_000);view.setUint32(20,100_000);assert.throws(()=>imageDimensions(png,'image/png'),/12 megapixels/);
});
test('real native PDF extraction keeps page identity; a scanned PDF has no invented text',async()=>{
 const native=await extractPdfPages(new Uint8Array(await readFile(`${fixtures}/circular-v1.pdf`)));
 assert.ok(native.length>=2);assert.ok(native[0].includes('SYNTHETIC'));assert.ok(native.join('\n').includes('SERAI'));
 const scan=await extractPdfPages(new Uint8Array(await readFile(`${fixtures}/field-slip-scanned.pdf`)));assert.equal(scan.length,1);assert.equal(scan[0].trim(),'');assert.equal(needsVisionOcr(scan[0]),true);
 await assert.rejects(()=>extractPdfPages(new TextEncoder().encode('%PDF-1.7\ninvalid')),/could not be read/);
});

test('real nonembedded Mandarin CMap PDF is extracted natively on each exact page',async()=>{
 const pages=await extractPdfPages(new Uint8Array(await readFile(`${fixtures}/mandarin-native.pdf`)));
 assert.equal(pages.length,2);assert.ok(pages[0].includes('公共廣場提案：保留通道，坡道寬度112公分。'));assert.ok(pages[1].includes('修訂二：尚未批准，需要市議會確認。'));
});
