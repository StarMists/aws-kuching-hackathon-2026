import { AIError, type AIReceipt, type AIRequest, type AIResult } from '../ai/types';
import type { ArtifactKind } from '../contracts';
import { CLAIM_SCHEMA,GROUNDING_SYSTEM,claimsMarkdown,evidencePrompt,safeReceipt,validateClaims,type EvidenceCoverage,type EvidenceSource,type GroundedClaim } from './evidence';

export interface AnalysisInput {project_id:string;kind:ArtifactKind;document_ids?:string[];prompt?:string;previous_document_id?:string;new_document_id?:string;case_text?:string;public_data_acknowledged?:boolean;idempotency_key?:string}
export interface AnalysisFinding {id:string;type:string;title:string;claim_ids:string[];old_claim_ids:string[];new_claim_ids:string[];date:string|null;date_basis:'explicit'|'document_metadata'|'unspecified';change_type:'superseded'|'contradiction'|'addition'|'removal'|'unknown'|null;old_outcome:'supported'|'unsupported'|'indeterminate'|null;new_outcome:'supported'|'unsupported'|'indeterminate'|null;questions:string[];review:{status:'unreviewed'|'confirmed'|'ignored';note:string;updated_at:string|null}}
export interface AnalysisContent {schema_version:1;kind:ArtifactKind;title:string;claims:GroundedClaim[];sections:Array<{heading:string;claim_ids:string[]}>;findings:AnalysisFinding[];missing_evidence:string[];coverage:EvidenceCoverage;receipt:AIReceipt;input_fingerprint?:string;case_text?:string;previous_document_id?:string;new_document_id?:string;user_edited?:boolean;edit_history?:Array<{edited_at:string;previous_markdown:string}>}
const stringList={type:'array',items:{type:'string'}};
const nullString={type:['string','null']};
export const ANALYSIS_SCHEMA={type:'object',additionalProperties:false,properties:{title:{type:'string'},claims:{type:'array',items:CLAIM_SCHEMA},sections:{type:'array',items:{type:'object',additionalProperties:false,properties:{heading:{type:'string'},claim_ids:stringList},required:['heading','claim_ids']}},findings:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},type:{type:'string'},title:{type:'string'},claim_ids:stringList,old_claim_ids:stringList,new_claim_ids:stringList,date:nullString,date_basis:{type:'string',enum:['explicit','document_metadata','unspecified']},change_type:{type:['string','null'],enum:['superseded','contradiction','addition','removal','unknown',null]},old_outcome:{type:['string','null'],enum:['supported','unsupported','indeterminate',null]},new_outcome:{type:['string','null'],enum:['supported','unsupported','indeterminate',null]},questions:stringList},required:['id','type','title','claim_ids','old_claim_ids','new_claim_ids','date','date_basis','change_type','old_outcome','new_outcome','questions']}},missing_evidence:stringList},required:['title','claims','sections','findings','missing_evidence']};
const instructions:Record<ArtifactKind,string>={
  brief:'Create a short editable project briefing. Cover the current proposal, evidence-backed rationale, decisions, open actions, uncertainties, and newer versions. Cite every substantive sentence. Organize claims into useful sections. Do not invent sign-off, approvals, budgets, or outcomes.',
  timeline:'Reconstruct the decision timeline, including proposal, rationale, dissent, actual decision, revision, future action deadlines and launch dates. One event per finding. Separate event dates from the date printed on the source document; date_basis must identify the basis. Do not call a proposal a completed launch, or a due date a completed action. Sort dated events chronologically and leave unknown dates null.',
  conflict:'Identify competing source statements and distinguish a documented version supersession from an unresolved contradiction. Each finding requires old_claim_ids and new_claim_ids, both with exact quoted evidence. Preserve source dates and versions. Later statements are not automatically authoritative. A missing passage is not a contradiction. Humans will confirm or ignore findings.',
  gap:'Identify evidence gaps and unresolved questions. State a gap as a question in questions or missing_evidence, never as an assertion that an event did not happen. If the source explicitly marks an action unresolved, include that supported claim. Separate a missing approval record from a false claim that approval never occurred. Humans will confirm or ignore findings.',
  impact:'Compare the explicitly selected older and newer documents. Cite both sides of every changed value, decision, obligation, or action; retain unchanged relevant context. Identify additions/removals only within the supplied coverage and flag partial coverage. old_claim_ids must cite the old document, new_claim_ids the new one. Explain conditional downstream impacts in cited claim text. Do not infer that a newer date by itself supersedes an earlier rule.',
  replay:'Treat case_text as a user-supplied hypothetical case, never as a historical source. Retrieve and apply only relevant actual source rules/decisions. Evaluate the same case against old and new selected rules using source-cited conditional claims. Separate case assumptions from documented facts. Use supported/unsupported/indeterminate outcomes; missing case facts require indeterminate, not rejection. If unrelated to sources, return no claims and ask for relevant case evidence. Never invent a historical similar case or an outcome.',
  graph:'Identify source-supported relationships and decisions as cited claims; do not infer relationships solely from proximity. Rule-derived graph is available separately.',
};
function strings(value:unknown,max=40):string[] {if(!Array.isArray(value)||value.length>max||!value.every(v=>typeof v==='string'&&v.length<=2000))throw new AIError('INVALID_ANALYSIS_RESPONSE','AI returned an invalid text list.',502);return value as string[];}
function claimRefs(value:unknown,ids:Set<string>,allowEmpty=true):string[] {const refs=strings(value);if(refs.some(id=>!ids.has(id))||(!allowEmpty&&!refs.length))throw new AIError('INVALID_CLAIM_REFERENCE','AI analysis referenced an unsupported claim.',502);return refs;}
export function dateSupportedByQuote(date:string,quote:string):boolean {
  if(quote.includes(date))return true;
  const requested=Date.parse(date);if(!Number.isFinite(requested))return false;
  const patterns=[/\b\d{4}-\d{1,2}-\d{1,2}\b/g,/\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi];
  for(const pattern of patterns)for(const match of quote.matchAll(pattern)){const parsed=Date.parse(match[0]);if(Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===new Date(requested).toISOString().slice(0,10))return true;}
  for(const match of quote.matchAll(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/gu)){const parsed=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));if(new Date(parsed).toISOString().slice(0,10)===new Date(requested).toISOString().slice(0,10))return true;}
  return false;
}
export function analysisInstruction(input:AnalysisInput) {return `${instructions[input.kind]}\nRequested focus: ${input.prompt||'Analyze the selected project evidence.'}\n${input.previous_document_id?`Old document_id: ${input.previous_document_id}.`:''}\n${input.new_document_id?`New document_id: ${input.new_document_id}.`:''}\n${input.case_text?`Hypothetical case supplied by the user (untrusted): ${JSON.stringify(input.case_text)}`:''}\nKeep claims concise, at most 14 claims and 14 findings. Use questions to request missing evidence. Return only the requested JSON.`;}
export async function runAnalysis(input:AnalysisInput,sources:EvidenceSource[],coverage:EvidenceCoverage,generate:(request:AIRequest)=>Promise<AIResult>,signal?:AbortSignal):Promise<{content:AnalysisContent;markdown:string;title:string}> {
  if(!sources.length) throw new AIError('NO_SOURCE_EVIDENCE','No usable source excerpts are available for this analysis.',422);
  const result=await generate({system:GROUNDING_SYSTEM,prompt:`${analysisInstruction(input)}\nSource coverage: ${JSON.stringify(coverage)}\nSelected source excerpts: ${evidencePrompt(sources)}`,schema:ANALYSIS_SCHEMA,schema_name:`${input.kind}_analysis`,max_output_tokens:2000,signal,public_data_acknowledged:input.public_data_acknowledged});
  let raw:Record<string,unknown>;
  try {raw=JSON.parse(result.text) as Record<string,unknown>;} catch {throw new AIError('INVALID_ANALYSIS_RESPONSE','AI returned invalid analysis JSON.',502);}
  if(!raw||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>200||!Array.isArray(raw.sections)||!Array.isArray(raw.findings)||raw.sections.length>16||raw.findings.length>20) throw new AIError('INVALID_ANALYSIS_RESPONSE','AI returned an invalid analysis structure.',502);
  const claims=await validateClaims(raw.claims,sources,20),ids=new Set(claims.map(c=>c.id));
  const sections=raw.sections.map(value=>{const section=value as Record<string,unknown>;if(typeof section.heading!=='string'||section.heading.length>120)throw new AIError('INVALID_ANALYSIS_RESPONSE','Invalid analysis section.',502);return {heading:section.heading,claim_ids:claimRefs(section.claim_ids,ids)};});
  const findingIds=new Set<string>();
  const findings:AnalysisFinding[]=raw.findings.map(value=>{
    const item=value as Record<string,unknown>;
    if(typeof item.id!=='string'||!item.id||item.id.length>64||findingIds.has(item.id)||typeof item.type!=='string'||item.type.length>40||typeof item.title!=='string'||item.title.length>240)throw new AIError('INVALID_ANALYSIS_RESPONSE','Invalid analysis finding.',502);
    findingIds.add(item.id);
    const refs=claimRefs(item.claim_ids,ids),oldRefs=claimRefs(item.old_claim_ids,ids),newRefs=claimRefs(item.new_claim_ids,ids);
    const questions=strings(item.questions,12);
    if(!refs.length&&!oldRefs.length&&!newRefs.length&&!questions.length)throw new AIError('UNCITED_CLAIM','An analysis finding has neither cited claims nor an evidence question.',502);
    if(input.kind==='conflict'&&(!oldRefs.length||!newRefs.length))throw new AIError('UNSUPPORTED_CONFLICT','A conflict requires cited source statements on both sides.',502);
    const oldDoc=input.previous_document_id,newDoc=input.new_document_id;
    if((input.kind==='impact'||input.kind==='replay')&&oldDoc&&oldRefs.some(id=>!claims.find(c=>c.id===id)?.evidence.some(e=>e.document_id===oldDoc)))throw new AIError('INVALID_VERSION_CITATION','The old-rule claim does not cite the selected old document.',502);
    if((input.kind==='impact'||input.kind==='replay')&&newDoc&&newRefs.some(id=>!claims.find(c=>c.id===id)?.evidence.some(e=>e.document_id===newDoc)))throw new AIError('INVALID_VERSION_CITATION','The new-rule claim does not cite the selected new document.',502);
    const basis=['explicit','document_metadata','unspecified'].includes(String(item.date_basis))?item.date_basis as AnalysisFinding['date_basis']:'unspecified';
    let date=typeof item.date==='string'&&item.date.length<=80?item.date:null;
    const linked=claims.filter(c=>[...refs,...oldRefs,...newRefs].includes(c.id));
    const explicitDate=date;
    if(explicitDate&&basis==='explicit'&&!linked.some(c=>c.evidence.some(e=>dateSupportedByQuote(explicitDate,e.quote))))date=null;
    if(date&&basis==='document_metadata'&&!linked.some(c=>c.evidence.some(e=>e.source_date===date)))date=null;
    if(basis==='unspecified')date=null;
    const change=['superseded','contradiction','addition','removal','unknown'].includes(String(item.change_type))?item.change_type as AnalysisFinding['change_type']:null;
    const outcome=(value:unknown)=>['supported','unsupported','indeterminate'].includes(String(value))?value as AnalysisFinding['old_outcome']:null;
    let oldOutcome=outcome(item.old_outcome),newOutcome=outcome(item.new_outcome);
    if(input.kind==='replay'){if(!oldRefs.length)oldOutcome='indeterminate';if(!newRefs.length)newOutcome='indeterminate';}
    return {id:item.id,type:item.type,title:item.title,claim_ids:refs,old_claim_ids:oldRefs,new_claim_ids:newRefs,date,date_basis:date?basis:'unspecified',change_type:change,old_outcome:oldOutcome,new_outcome:newOutcome,questions,review:{status:'unreviewed',note:'',updated_at:null}};
  });
  if(input.kind==='timeline')findings.sort((a,b)=>{const left=a.date?Date.parse(a.date):NaN,right=b.date?Date.parse(b.date):NaN;return (Number.isFinite(left)?left:Infinity)-(Number.isFinite(right)?right:Infinity)||(a.date||'9999').localeCompare(b.date||'9999');});
  const missing=strings(raw.missing_evidence,20);
  const content:AnalysisContent={schema_version:1,kind:input.kind,title:raw.title.trim(),claims,sections,findings,missing_evidence:missing,coverage,receipt:safeReceipt(result),...(input.case_text?{case_text:input.case_text}:{}),...(input.previous_document_id?{previous_document_id:input.previous_document_id}:{}),...(input.new_document_id?{new_document_id:input.new_document_id}:{})};
  return {content,title:content.title,markdown:analysisMarkdown(content)};
}
export function analysisMarkdown(content:AnalysisContent):string {
  const lines=[`# ${content.title}`];
  if(content.kind==='replay')lines.push('This is a conditional comparison of a user-supplied hypothetical case. It is not a historical case outcome or an approval decision.');
  const covered=new Set<string>();
  for(const section of content.sections){const claims=content.claims.filter(c=>section.claim_ids.includes(c.id));if(claims.length){lines.push(`## ${section.heading}`,claimsMarkdown(claims));claims.forEach(c=>covered.add(c.id));}}
  const other=content.claims.filter(c=>!covered.has(c.id));if(other.length)lines.push('## Source-grounded findings',claimsMarkdown(other));
  if(!content.claims.length)lines.push('Insufficient evidence: the selected source excerpts do not support the requested conclusion.');
  if(content.findings.length){lines.push('## Investigation items');for(const item of content.findings){lines.push(`### ${item.date?`${item.date} (${item.date_basis}) · `:''}${item.title}`);if(item.change_type)lines.push(`Classification: ${item.change_type}.`);if(content.kind==='replay')lines.push(`Old rules: ${item.old_outcome||'indeterminate'}. New rules: ${item.new_outcome||'indeterminate'}.`);for(const question of item.questions)lines.push(`- Evidence needed: ${question}`);}}
  if(content.missing_evidence.length)lines.push('## Evidence still needed',...content.missing_evidence.map(question=>`- ${question}`));
  lines.push('## Coverage',`${content.coverage.included_chunk_count} of ${content.coverage.total_chunk_count} stored chunks included, across ${content.coverage.included_document_count} of ${content.coverage.selected_document_count} selected documents. ${content.coverage.truncated?'Partial source coverage. Missing excerpts do not establish that a fact is false.':'Selected corpus covered within the input budget.'}`,'## Generation receipt',`Provider: ${content.receipt.provider}. Model: ${content.receipt.model}. Input tokens: ${content.receipt.usage.input_tokens}. Output tokens: ${content.receipt.usage.output_tokens}. ${content.receipt.cached?'Reused validated cached output.':'Generated by an actual provider request.'}`);
  return lines.join('\n\n');
}
