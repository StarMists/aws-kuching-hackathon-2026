import type { Citation, Document, GraphEdge, GraphNode } from '../contracts';
import { normalizeText, tokenize } from '../retrieval/ranking';
import type { CorpusChunk } from '../retrieval/types';

export interface EvidenceGraphNode extends GraphNode {
  inferred?: boolean;
  source_url?: string;
  version?: string;
  source_date?: string | null;
  document_type?: string;
  department?: string;
}
export interface EvidenceGraphEdge extends GraphEdge {
  relationship: 'explicit' | 'inferred';
  basis: 'version_metadata' | 'document_reference' | 'shared_terms' | 'topic_terms' | 'department_metadata';
  label: string;
}
export interface TopicGroup { id: string; label: string; inferred: boolean; document_count: number; document_ids: string[]; evidence: Citation[] }
export interface RelationshipGraph {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
  topics: TopicGroup[];
  related_documents: Array<{ document_id: string; related: Array<{ document_id: string; type: string; relationship: 'explicit' | 'inferred'; score: number }> }>;
  recent_documents: Array<{ document_id: string; title: string; version: string; source_date: string | null; updated_at: string }>;
  method: 'deterministic';
  label: string;
  warning: string;
}

const DOMAIN_TOPICS = [
  { id: 'procurement', label: 'Procurement / 采购', terms: ['procurement', 'purchase', 'purchasing', '采购', '採購'] },
  { id: 'approvals', label: 'Approvals / 审批', terms: ['approval', 'approve', 'approved', 'authorization', '审批', '批准', '審批', '核准'] },
  { id: 'contracts', label: 'Contracts / 合同', terms: ['contract', 'agreement', '合同', '合約'] },
  { id: 'finance', label: 'Finance / 财务', terms: ['finance', 'budget', 'payment', 'financial', '财务', '財務', '预算', '預算', '付款'] },
  { id: 'procedures', label: 'Procedures / 流程', terms: ['procedure', 'sop', 'workflow', '流程', '程序', '规程', '規程'] },
  { id: 'decisions', label: 'Decisions / 决策', terms: ['decision', 'decided', 'resolution', '决定', '決定', '决议', '決議'] },
  { id: 'schedule', label: 'Dates & deadlines / 期限', terms: ['deadline', 'schedule', 'milestone', 'timeline', '截止', '期限', '日程'] },
  { id: 'risks', label: 'Risks / 风险', terms: ['risk', 'risks', 'exception', '风险', '風險', '例外'] },
  { id: 'revisions', label: 'Revisions / 修订', terms: ['revision', 'supersedes', 'revised', '修订', '修訂', '取代', '替代'] },
] as const;
const UNHELPFUL_TERMS = new Set(('page pages section appendix annex chapter table figure document file text other number date title version information issued notice circular authority public synthetic example demonstration first second third shall must required requirement policy manager department official within includes including following accordance unless million thousand hundred').split(/\s+/));

function citation(chunk: CorpusChunk, terms?: string[]): Citation {
  let start = 0;
  if (terms?.length) {
    const normalized = normalizeText(chunk.text);
    const offsets = terms.map(term => normalized.indexOf(term)).filter(offset => offset >= 0);
    if (offsets.length) start = Math.max(0, Math.min(...offsets) - 60);
  }
  return { document_id: chunk.document_id, document_title: chunk.document_title, chunk_id: chunk.id, page_number: chunk.page_number, quote: chunk.text.slice(start, start + 400), source_sha256: chunk.source_sha256 };
}

function intersects(a: Set<string>, b: Set<string>): string[] { return [...a].filter(term => b.has(term)); }

/** All relationships are backed by actual metadata or indexed source text. No model output is fabricated. */
export function buildRelationshipGraph(documents: Document[], chunks: CorpusChunk[]): RelationshipGraph {
  const documentsById = new Map(documents.map(document => [document.id, document]));
  const documentChunks = new Map<string, CorpusChunk[]>();
  const chunkTokens = new Map<string, Set<string>>();
  const chunkBodies = new Map<string, string>();
  for (const chunk of chunks) {
    if (!documentsById.has(chunk.document_id)) continue;
    const list = documentChunks.get(chunk.document_id) ?? []; list.push(chunk); documentChunks.set(chunk.document_id, list);
    chunkTokens.set(chunk.id, new Set(tokenize(chunk.text)));
    chunkBodies.set(chunk.id, normalizeText(chunk.text));
  }
  const nodes: EvidenceGraphNode[] = documents.map(document => ({
    id: document.id, label: document.title, type: 'document', document_id: document.id,
    source_url: `/api/documents/${encodeURIComponent(document.id)}`, version: document.version,
    source_date: document.source_date, document_type: document.document_type, department: document.department,
  }));
  const edges: EvidenceGraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (edge: EvidenceGraphEdge) => { const key = `${edge.source}|${edge.target}|${edge.type}`; if (!edgeKeys.has(key)) { edges.push(edge); edgeKeys.add(key); } };

  // A predecessor field is the only automatic official version relationship.
  for (const document of documents) {
    if (document.previous_document_id && documentsById.has(document.previous_document_id)) addEdge({ source: document.id, target: document.previous_document_id, type: 'supersedes', label: 'Supersedes (recorded version link)', relationship: 'explicit', basis: 'version_metadata', weight: 1, evidence: [] });
  }

  // An explicit reference requires both an exact title/filename and a nearby reference cue.
  const referenceCue = /(?:\bsee\b|\brefer(?:s|red|ring)?\b|\baccording to\b|\bpursuant to\b|\bas set out in\b|\bin accordance with\b|参见|參見|依据|依據|根据|根據|参考|參考|详见|詳見|引用)/u;
  const aliasesByDocument = documents.map(target => ({ target, aliases: [...new Set([target.title, target.filename].map(normalizeText).filter(value => value.length >= 4))] }));
  const aliasOwners = new Map<string, Set<string>>();
  for (const { target, aliases } of aliasesByDocument) for (const alias of aliases) {
    const owners = aliasOwners.get(alias) ?? new Set<string>(); owners.add(target.id); aliasOwners.set(alias, owners);
  }
  for (const chunk of chunks) {
    if (!documentsById.has(chunk.document_id)) continue;
    const body = chunkBodies.get(chunk.id)!;
    if (!referenceCue.test(body)) continue;
    const references: Array<{ at: number; end: number; target: Document; alias: string }> = [];
    for (const { target, aliases } of aliasesByDocument) {
      if (target.id === chunk.document_id) continue;
      for (const alias of aliases) {
        // A duplicated title/filename cannot identify one particular source version.
        if ((aliasOwners.get(alias)?.size ?? 0) > 1) continue;
        let at = body.indexOf(alias);
        while (at >= 0) {
          const before = body.slice(Math.max(0, at - 100), at).split(/(?:[.!?;]\s+|[。！？；]|\n)/u).at(-1) ?? '';
          if (referenceCue.test(before)) {
            references.push({ at, end: at + alias.length, target, alias });
          }
          at = body.indexOf(alias, at + alias.length);
        }
      }
    }
    const retained: typeof references = [];
    for (const reference of references.sort((a, b) => (b.end - b.at) - (a.end - a.at))) {
      if (retained.some(other => reference.at < other.end && reference.end > other.at)) continue;
      retained.push(reference);
      addEdge({ source: chunk.document_id, target: reference.target.id, type: 'references', label: 'Explicitly references', relationship: 'explicit', basis: 'document_reference', weight: 1, evidence: [citation(chunk, [reference.alias])] });
    }
  }

  // Department comes from user-supplied document metadata, not inferred affiliation.
  const departments = new Map<string, string[]>();
  for (const document of documents) if (document.department?.trim()) {
    const name = document.department.trim(); const members = departments.get(name) ?? []; members.push(document.id); departments.set(name, members);
  }
  for (const [department, members] of departments) {
    const id = `department:${department}`;
    nodes.push({ id, label: department, type: 'entity', inferred: false, count: members.length });
    for (const member of members) addEdge({ source: member, target: id, type: 'department', label: 'Department (document metadata)', relationship: 'explicit', basis: 'department_metadata', weight: 1, evidence: [] });
  }

  const docTokens = new Map<string, Set<string>>();
  const termDocs = new Map<string, Set<string>>();
  for (const document of documents) {
    const allTerms = new Set(tokenize(document.title));
    for (const chunk of documentChunks.get(document.id) ?? []) for (const term of chunkTokens.get(chunk.id) ?? []) allTerms.add(term);
    const terms = new Set([...allTerms].filter(term => !UNHELPFUL_TERMS.has(term) && !/^\d+$/.test(term) && (term.length > 2 || /\p{Script=Han}/u.test(term))));
    docTokens.set(document.id, terms);
    for (const term of terms) { const members = termDocs.get(term) ?? new Set<string>(); members.add(document.id); termDocs.set(term, members); }
  }
  const topics: TopicGroup[] = [];
  const usedTerms = new Set<string>();
  for (const topic of DOMAIN_TOPICS) {
    const terms = new Set(topic.terms.flatMap(term => tokenize(term)));
    const members = documents.filter(document => intersects(docTokens.get(document.id) ?? new Set(), terms).length > 0);
    if (!members.length) continue;
    for (const term of terms) usedTerms.add(term);
    const evidence = members.map(document => (documentChunks.get(document.id) ?? []).find(chunk => intersects(chunkTokens.get(chunk.id) ?? new Set(), terms).length > 0)).filter((chunk): chunk is CorpusChunk => Boolean(chunk)).slice(0, 8).map(chunk => citation(chunk, [...terms]));
    topics.push({ id: `topic:${topic.id}`, label: topic.label, inferred: true, document_count: members.length, document_ids: members.map(document => document.id), evidence });
  }
  const recurring = [...termDocs].filter(([term, members]) => members.size >= 2 && !usedTerms.has(term) && members.size <= Math.max(2, documents.length * 0.75)).sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, Math.max(0, 16 - topics.length));
  for (const [term, members] of recurring) {
    const evidence = [...members].map(id => (documentChunks.get(id) ?? []).find(chunk => chunkTokens.get(chunk.id)?.has(term))).filter((chunk): chunk is CorpusChunk => Boolean(chunk)).slice(0, 8).map(chunk => citation(chunk, [term]));
    topics.push({ id: `topic:term:${term}`, label: term, inferred: true, document_count: members.size, document_ids: [...members], evidence });
  }
  for (const topic of topics) {
    nodes.push({ id: topic.id, label: topic.label, type: 'topic', inferred: true, count: topic.document_count });
    for (const member of topic.document_ids) addEdge({ source: member, target: topic.id, type: 'has_topic', label: 'Contains topic terms (inferred)', relationship: 'inferred', basis: 'topic_terms', weight: 0.5, evidence: topic.evidence.filter(item => item.document_id === member).slice(0, 1) });
  }

  // Weighted overlap favors distinctive shared terms over ubiquitous boilerplate.
  const weight = (term: string) => Math.log(1 + documents.length / (termDocs.get(term)?.size ?? 1));
  const candidates: EvidenceGraphEdge[] = [];
  const sharedTerms = new Map<string, string[]>();
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const left = documents[i], right = documents[j];
    const a = docTokens.get(left.id) ?? new Set<string>(), b = docTokens.get(right.id) ?? new Set<string>();
    const shared = intersects(a, b); if (shared.length < 2) continue;
    const union = new Set([...a, ...b]);
    const score = shared.reduce((sum, term) => sum + weight(term), 0) / Math.max(1, [...union].reduce((sum, term) => sum + weight(term), 0));
    if (score < 0.12) continue;
    const distinctive = shared.sort((x, y) => weight(y) - weight(x)).slice(0, 6);
    sharedTerms.set(`${left.id}|${right.id}`, distinctive);
    candidates.push({ source: left.id, target: right.id, type: 'shared_topic', label: `Shared terms: ${distinctive.join(', ')} (inferred)`, relationship: 'inferred', basis: 'shared_terms', weight: Number(score.toFixed(4)), evidence: [] });
  }
  const neighbors = new Map<string, number>();
  for (const edge of candidates.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))) {
    if ((neighbors.get(edge.source) ?? 0) >= 4 || (neighbors.get(edge.target) ?? 0) >= 4) continue;
    const distinctive = sharedTerms.get(`${edge.source}|${edge.target}`) ?? [];
    for (const id of [edge.source, edge.target]) {
      const chunk = (documentChunks.get(id) ?? []).find(item => intersects(chunkTokens.get(item.id) ?? new Set(), new Set(distinctive)).length > 0);
      if (chunk) edge.evidence!.push(citation(chunk, distinctive));
    }
    addEdge(edge); neighbors.set(edge.source, (neighbors.get(edge.source) ?? 0) + 1); neighbors.set(edge.target, (neighbors.get(edge.target) ?? 0) + 1);
  }
  return {
    nodes, edges, topics,
    related_documents: documents.map(document => ({ document_id: document.id, related: edges.filter(edge => (edge.type === 'shared_topic' || edge.type === 'references' || edge.type === 'supersedes') && (edge.source === document.id || edge.target === document.id)).map(edge => ({ document_id: edge.source === document.id ? edge.target : edge.source, type: edge.type, relationship: edge.relationship, score: edge.weight ?? 0 })).sort((a, b) => b.score - a.score) })),
    recent_documents: [...documents].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 12).map(document => ({ document_id: document.id, title: document.title, version: document.version, source_date: document.source_date, updated_at: document.updated_at })),
    method: 'deterministic', label: 'Evidence-linked relationship graph',
    warning: 'Topics and shared-term links are rule-derived suggestions, not official document relationships. References require source-text cues; supersedes links come from recorded predecessor metadata.',
  };
}
