import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/synthetic-civic');
const truth=JSON.parse(await readFile(path.join(root,'truth.json'),'utf8'));
test('all upload fixtures are original and explicitly synthetic',async()=>{
 assert.equal(truth.synthetic,true);
 assert.match(truth.rights,/Original fixtures/);
 assert.equal(truth.documents.length,4);
 for(const name of truth.upload_files){assert.ok((await stat(path.join(root,name))).size>500);assert.ok(truth.sha256[name]);}
 for(const doc of truth.documents){const txt=await readFile(path.join(root,doc.id+'.txt'),'utf8');assert.match(txt,/SYNTHETIC QA FIXTURE/);assert.equal(txt.split('\f').length,doc.page_count);}
});
test('stored fixture bytes match the explicit QA oracle',async()=>{
 for(const [name,expected] of Object.entries(truth.sha256)){
  const bytes=await readFile(path.join(root,name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,name);
 }
});
test('version/contradiction/gap test coverage is substantive',()=>{
 const v1=truth.documents.find(d=>d.id==='circular-v1');const v2=truth.documents.find(d=>d.id==='circular-v2');
 assert.equal(v1.family,v2.family);assert.equal(v2.previous,v1.id);assert.equal(v2.version,'2');
 assert.ok(truth.contradictions.length>=3);assert.ok(truth.gaps.includes('Procurement clearance reference'));
 assert.ok(truth.timeline.some(e=>e.event.includes('dissent')));assert.ok(truth.questions.some(q=>q.expected.includes('insufficient evidence')));
});
