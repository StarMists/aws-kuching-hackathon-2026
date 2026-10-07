import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, groupSearchHits, parseEmbedding, queryTerms, rankPassages, tokenize } from '../lib/retrieval/ranking.ts';
import { buildRelationshipGraph } from '../lib/graph/build.ts';

const document = (id, overrides = {}) => ({ id, owner_id: 'owner-a', title: `Document ${id}`, filename: `${id}.txt`, content_type: 'text/plain', document_type: 'policy', department: 'Procurement', source_date: '2026-10-01', version: '1', family_id: id, previous_document_id: null, status: 'ready', extraction_method: 'text', error_message: null, r2_key: null, source_sha256: id.repeat(8), page_count: 1, chunk_count: 1, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...overrides });
const chunk = (id, doc, text, overrides = {}) => ({ id, document_id: doc.id, page_id: `${doc.id}-page`, page_number: 1, sequence: 0, text, start_offset: 0, end_offset: text.length, embedding_json: null, embedding_model: null, created_at: doc.created_at, document_title: doc.title, filename: doc.filename, document_type: doc.document_type, department: doc.department, source_date: doc.source_date, version: doc.version, family_id: doc.family_id, previous_document_id: doc.previous_document_id, source_sha256: doc.source_sha256, ...overrides });

test('tokenization retains English meaning, identifiers and Chinese passage overlap', () => {
  assert.deepEqual(tokenize('Please find the procurement approvals'), ['procurement', 'approval']);
  assert.ok(tokenize('采购审批要求').includes('采购'));
  assert.ok(tokenize('采购审批要求').includes('审批'));
  assert.ok(tokenize('SERAI-47-PLUM-KITE').includes('47'));
  assert.ok(queryTerms('采购审批要求').has('procurement'));
});

test('genuine lexical relevance prioritizes exact policy passages over boilerplate', () => {
  const a = document('policy-a', { title: 'Procurement approval procedure' });
  const b = document('memo-b', { title: 'Office kitchen memo' });
  const hits = rankPassages([chunk('a', a, 'Procurement approval requires a manager signature before a purchase order.'), chunk('b', b, 'Approval of tea and coffee flavors is optional.')], 'procurement approval');
  assert.equal(hits[0].document_id, a.id);
  assert.ok(hits[0].score > hits[1].score);
  assert.equal(hits[0].mode, 'keyword');
  assert.equal(hits[0].source_sha256, a.source_sha256);
  assert.match(hits[0].citation_url, /page=1&chunk=a/);
});

test('Chinese and English terminology is deterministic lexical expansion, not fake vectors', () => {
  const doc = document('cn', { title: '采购流程' });
  const hits = rankPassages([chunk('cn-c', doc, '采购申请必须经部门负责人审批后方可执行。')], 'procurement approval');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].mode, 'keyword');
  assert.equal(hits[0].semantic_score, undefined);
  assert.ok(hits[0].matched_terms.includes('采购'));
});

test('document-balanced evidence prevents a long PDF monopolizing retrieval', () => {
  const a = document('long'), b = document('short');
  const sources = [0, 1, 2, 3, 4].map(index => chunk(`long-${index}`, a, 'Procurement approval requires two signatures.', { sequence: index, page_number: index + 1 }));
  sources.push(chunk('short-0', b, 'Procurement approval requires review.'));
  const hits = rankPassages(sources, 'procurement approval', { limit: 3 });
  assert.deepEqual(new Set(hits.slice(0, 2).map(hit => hit.document_id)), new Set(['long', 'short']));
  const groups = groupSearchHits(hits);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.document_id === 'long').passage_count, 2);
  assert.equal(groups.find(group => group.document_id === 'long').passages.length, 2);
});

test('model-supplied expansion remains lexical and only affects genuine matching chunks', () => {
  const a = document('a'), b = document('b');
  const sources = [chunk('a', a, 'The contractor warranty remains valid for 24 months.'), chunk('b', b, 'The break room closes at five.')];
  assert.equal(rankPassages(sources, 'guarantee period').length, 0);
  const hits = rankPassages(sources, 'guarantee period', { expanded_terms: ['warranty'], mode: 'query-expanded' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].document_id, 'a');
  assert.equal(hits[0].mode, 'query-expanded');
});

test('vectors require valid dimensions, finite values and matching model provenance', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [1]), null);
  assert.equal(cosineSimilarity([1, Number.NaN], [1, 0]), null);
  assert.equal(parseEmbedding('[1,"2"]'), null);
  const a = document('a'), b = document('b');
  const sources = [chunk('a', a, 'Expected matching material.', { embedding_json: '[1,0]', embedding_model: 'model-v1' }), chunk('b', b, 'Unrelated material.', { embedding_json: '[1,0]', embedding_model: 'old-model' })];
  const hits = rankPassages(sources, 'unseen synonym', { query_vector: [1, 0], embedding_model: 'model-v1', mode: 'semantic' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].chunk_id, 'a');
  assert.equal(hits[0].semantic_score, 1);
});

test('official graph links require predecessor metadata or actual reference language', () => {
  const old = document('old', { title: 'Procurement Standard', version: '1' });
  const revised = document('new', { title: 'Revised Procurement Standard', version: '2', previous_document_id: 'old' });
  const memo = document('memo', { title: 'Implementation Circular' });
  const graph = buildRelationshipGraph([old, revised, memo], [chunk('old-c', old, 'Procurement Standard requires manager approval.'), chunk('new-c', revised, 'Procurement approval uses updated thresholds.'), chunk('memo-c', memo, 'For the approval rule, see Procurement Standard before placing a purchase order.')]);
  const supersedes = graph.edges.find(edge => edge.type === 'supersedes');
  assert.equal(supersedes.source, 'new'); assert.equal(supersedes.target, 'old'); assert.equal(supersedes.relationship, 'explicit');
  const reference = graph.edges.find(edge => edge.type === 'references' && edge.source === 'memo' && edge.target === 'old');
  assert.ok(reference); assert.equal(reference.evidence[0].chunk_id, 'memo-c'); assert.equal(reference.evidence[0].page_number, 1);
  assert.ok(graph.topics.some(topic => topic.label.includes('Procurement')));
  assert.ok(graph.edges.filter(edge => edge.type === 'has_topic').every(edge => edge.relationship === 'inferred'));
  assert.equal(graph.method, 'deterministic');
});

test('a title mentioned without a reference cue never creates an official relationship', () => {
  const a = document('a', { title: 'Procurement Standard' }), b = document('b', { title: 'Minutes' });
  const graph = buildRelationshipGraph([a, b], [chunk('a-c', a, 'Approval and procurement guidance.'), chunk('b-c', b, 'The phrase Procurement Standard was discussed. Approval and procurement guidance was debated.')]);
  assert.ok(!graph.edges.some(edge => edge.type === 'references'));
  assert.ok(graph.edges.some(edge => edge.type === 'shared_topic' && edge.relationship === 'inferred'));
  const separated = buildRelationshipGraph([a, b], [chunk('b-c', b, 'See the attachments. Procurement Standard was a phrase discussed at the meeting.')]);
  assert.ok(!separated.edges.some(edge => edge.type === 'references'));
});

test('reference linking avoids overlapping titles and ambiguous duplicate versions', () => {
  const old = document('old', { title: 'Procurement Standard' });
  const revised = document('revised', { title: 'Revised Procurement Standard' });
  const memo = document('memo');
  const graph = buildRelationshipGraph([old, revised, memo], [chunk('memo-c', memo, 'See Revised Procurement Standard for the current threshold.')]);
  assert.deepEqual(graph.edges.filter(edge => edge.type === 'references').map(edge => edge.target), ['revised']);
  const duplicate = document('duplicate', { title: 'Procurement Standard' });
  const ambiguous = buildRelationshipGraph([old, duplicate, memo], [chunk('memo-c', memo, 'See Procurement Standard for the current threshold.')]);
  assert.ok(!ambiguous.edges.some(edge => edge.type === 'references'));
});

test('graph builders ignore chunks not present in the verified source collection', () => {
  const a = document('a'), foreign = document('foreign', { title: 'Foreign Procurement Standard', owner_id: 'owner-b' });
  const graph = buildRelationshipGraph([a], [chunk('a-c', a, 'Kitchen opening hours.'), chunk('foreign-c', foreign, 'Procurement approval secret target.')]);
  assert.ok(!graph.nodes.some(node => node.document_id === 'foreign'));
  assert.ok(!graph.topics.some(topic => topic.label.includes('Procurement')));
  assert.ok(!JSON.stringify(graph).includes('foreign-c'));
});

test('empty collection produces honest empty graph and no fabricated topics', () => {
  const graph = buildRelationshipGraph([], []);
  assert.deepEqual(graph.nodes, []); assert.deepEqual(graph.edges, []); assert.deepEqual(graph.topics, []);
  assert.match(graph.warning, /rule-derived/);
});
