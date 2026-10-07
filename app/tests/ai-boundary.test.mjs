import test from 'node:test';
import assert from 'node:assert/strict';
import {readAIConfig,publicAIConfig} from '../lib/ai/config.ts';
import {generateWithConfig} from '../lib/ai/providers.ts';
const req={system:'Use synthetic sources only.',prompt:'Return synthetic text.',public_data_acknowledged:true};
const fake='test-only-placeholder-not-a-real-credential';
const config=()=>readAIConfig({AI_ENABLED:'true',GEMINI_API_KEY:fake,GROQ_API_KEY:fake,AI_MAX_RETRIES:'0'});
test('disabled/missing keys produce real blockers without a provider request',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call');};
 await assert.rejects(()=>generateWithConfig(req,readAIConfig({}),fetcher),e=>e.code==='AI_DISABLED');
 await assert.rejects(()=>generateWithConfig(req,readAIConfig({AI_ENABLED:'true'}),fetcher),e=>e.code==='AI_NOT_CONFIGURED');
 assert.equal(calls,0);
});
test('free-provider allowlist, public-data acknowledgement and input budget are enforced',async()=>{
 assert.throws(()=>readAIConfig({AI_PROVIDER:'openai'}),e=>e.code==='PROVIDER_NOT_APPROVED');
 assert.throws(()=>readAIConfig({GEMINI_API_KEY:fake,GEMINI_MODEL:'unapproved-paid-model'}),e=>e.code==='MODEL_NOT_APPROVED');
 await assert.rejects(()=>generateWithConfig({...req,public_data_acknowledged:false},config(),async()=>{throw Error('must not call');}),e=>e.code==='PUBLIC_DATA_ACK_REQUIRED');
 await assert.rejects(()=>generateWithConfig({...req,prompt:'synthetic '.repeat(5000)},config(),async()=>{throw Error('must not call');}),e=>e.code==='AI_INPUT_BUDGET_EXCEEDED');
});
test('public config omits secrets and reports configuration-only verification',()=>{
 const result=publicAIConfig(config());assert.ok(!JSON.stringify(result).includes(fake));assert.equal(result.paid_calls_enabled,false);assert.equal(result.provider_model_verification,'configuration-only');
});
test('MOCK ONLY: primary rate limit uses configured backup and records actual adapter',async()=>{
 const requests=[];
 const result=await generateWithConfig(req,config(),async(url,init)=>{
  requests.push({url,body:JSON.parse(init.body)});
  if(url.includes('googleapis'))return new Response('upstream body must not leak', {status:429,headers:{'retry-after':'100'}});
  return Response.json({model:'openai/gpt-oss-120b',choices:[{message:{content:'synthetic mock answer'},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:3,total_tokens:10},id:'mock-receipt'});
 });
 assert.equal(requests.length,2);assert.equal(result.provider,'groq');assert.equal(result.fallback_used,true);assert.equal(result.attempts,2);assert.equal(result.request_id,'mock-receipt');
});
test('MOCK ONLY: returned Gemini output excludes thought/tool blocks',async()=>{
 const result=await generateWithConfig(req,readAIConfig({AI_ENABLED:'true',GEMINI_API_KEY:fake,AI_MAX_RETRIES:'0'}),async()=>Response.json({status:'completed',model:'gemini-3.8-flash',steps:[{type:'thought',content:[{type:'text',text:'private thought'}]},{type:'model_output',content:[{type:'text',text:'visible synthetic result'},{type:'thought',text:'hidden'}]}],usage:{total_input_tokens:8,total_output_tokens:3,total_tokens:11}}));
 assert.equal(result.text,'visible synthetic result');assert.equal(result.provider,'gemini');
});
test('cancelled request does not invoke providers',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(()=>generateWithConfig({...req,signal:controller.signal},config(),async()=>{calls++;throw Error('must not call');}),e=>e.code==='AI_CANCELLED');assert.equal(calls,0);
});
