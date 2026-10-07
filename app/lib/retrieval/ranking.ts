import type { CorpusChunk, RankedSearchHit, SearchDocumentGroup } from './types';

const STOP_WORDS = new Set(('a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may me my of on or our please shall should that the their them then there these they this those to us was we were what when where which who why will with would you your find search show tell help about document documents information related relevant 根据 关于 查找 搜索 找到 有关 相关 什么 哪些 如何 请问 请帮 帮我 文件 文档 文獻').split(/\s+/));
/** Small, deterministic terminology bridge. This is lexical expansion, not a vector model. */
const TERMINOLOGY = [
  ['procurement', 'purchasing', 'purchase', '采购', '採購'],
  ['approval', 'approve', 'approved', 'authorization', '审批', '批准', '審批', '核准'],
  ['contract', 'agreement', '合同', '合約', '契约'],
  ['policy', 'regulation', 'policies', '政策', '规定', '規定', '制度'],
  ['procedure', 'sop', 'workflow', '流程', '程序', '规程', '規程'],
  ['finance', 'financial', 'budget', '财务', '財務', '预算', '預算'],
  ['deadline', 'due', '期限', '截止'],
  ['risk', 'risks', '风险', '風險'],
  ['revision', 'revised', 'supersedes', 'updated', '修订', '修訂', '更新'],
] as const;

export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\u0300-\u036f]/g, '');
}

function stemLatin(token: string): string {
  if (token.length < 5 || !/^[a-z]+$/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Latin words plus overlapping Han bigrams support English and Chinese OCR. */
export function tokenize(text: string): string[] {
  const result: string[] = [];
  for (const match of normalizeText(text).matchAll(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu)) {
    const value = match[0];
    if (/\p{Script=Han}/u.test(value)) {
      if (value.length === 1) result.push(value);
      else for (let i = 0; i < value.length - 1; i++) {
        const term = value.slice(i, i + 2);
        if (!STOP_WORDS.has(term)) result.push(term);
      }
    } else if (value.length > 1 && !STOP_WORDS.has(value)) result.push(stemLatin(value));
  }
  return result;
}

export function queryTerms(query: string, expandedTerms: string[] = []): Map<string, number> {
  const original = tokenize(query);
  const weights = new Map<string, number>(original.map(term => [term, 1]));
  const normalized = normalizeText(query);
  for (const group of TERMINOLOGY) {
    if (!group.some(term => normalized.includes(term))) continue;
    for (const phrase of group) for (const term of tokenize(phrase)) {
      if (!weights.has(term)) weights.set(term, 0.38);
    }
  }
  for (const phrase of expandedTerms.slice(0, 16)) for (const term of tokenize(phrase)) {
    if (!weights.has(term)) weights.set(term, 0.55);
  }
  return new Map([...weights].slice(0, 64));
}

function frequencies(tokens: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (!a.length || a.length !== b.length || a.some(n => !Number.isFinite(n)) || b.some(n => !Number.isFinite(n))) return null;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  if (!aa || !bb) return null;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)));
}

export function parseEmbedding(value: string | null): number[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every(n => typeof n === 'number' && Number.isFinite(n)) ? parsed as number[] : null;
  } catch { return null; }
}

export interface RankingOptions {
  expanded_terms?: string[];
  query_vector?: number[];
  embedding_model?: string;
  mode?: string;
  limit?: number;
  max_passages_per_document?: number;
  balanced?: boolean;
}

export function rankPassages(chunks: CorpusChunk[], query: string, options: RankingOptions = {}): RankedSearchHit[] {
  const terms = queryTerms(query, options.expanded_terms);
  const tokens = chunks.map(chunk => tokenize(chunk.text));
  const freqs = tokens.map(frequencies);
  const averageLength = tokens.reduce((sum, values) => sum + values.length, 0) / Math.max(1, chunks.length);
  const documentFrequency = new Map<string, number>();
  for (const term of terms.keys()) documentFrequency.set(term, freqs.filter(freq => freq.has(term)).length);
  const phrase = normalizeText(query).trim();
  const originalTerms = new Set(tokenize(query));
  const titleFrequencies = new Map<string, Map<string, number>>();
  for (const chunk of chunks) if (!titleFrequencies.has(chunk.document_id)) titleFrequencies.set(chunk.document_id, frequencies(tokenize(`${chunk.document_title} ${chunk.filename}`)));
  const results: RankedSearchHit[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index], freq = freqs[index];
    const titleFreq = titleFrequencies.get(chunk.document_id)!;
    let lexical = 0, originalMatches = 0;
    const matched: string[] = [];
    for (const [term, weight] of terms) {
      const count = freq.get(term) ?? 0;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
      if (count) {
        lexical += weight * idf * ((count * 2.2) / (count + 1.2 * (0.25 + 0.75 * tokens[index].length / Math.max(averageLength, 1))));
        matched.push(term);
        if (originalTerms.has(term)) originalMatches++;
      }
      if (titleFreq.has(term)) lexical += weight * (1.6 + idf * 0.6);
    }
    const body = normalizeText(chunk.text);
    if (phrase.length >= 3 && body.includes(phrase)) lexical += 3;
    if (phrase.length >= 3 && normalizeText(chunk.document_title).includes(phrase)) lexical += 4;
    // Favor passages that address more of the user's original request.
    if (originalTerms.size) lexical *= 0.7 + 0.6 * originalMatches / originalTerms.size;
    let semantic: number | null = null;
    if (options.query_vector && options.embedding_model && chunk.embedding_model === options.embedding_model) {
      const vector = parseEmbedding(chunk.embedding_json);
      if (vector) semantic = cosineSimilarity(options.query_vector, vector);
    }
    if (options.mode === 'semantic' && semantic === null) continue;
    const lexicalNormalized = lexical / (lexical + 3);
    const semanticNormalized = semantic === null ? 0 : Math.max(0, (semantic - 0.25) / 0.75);
    const score = options.mode === 'semantic' && semantic !== null
      ? semanticNormalized
      : semantic === null ? lexicalNormalized : 0.65 * lexicalNormalized + 0.35 * semanticNormalized;
    if (score <= 0 || (options.mode === 'semantic' && semantic !== null && semantic < 0.3)) continue;
    const source = `/api/documents/${encodeURIComponent(chunk.document_id)}`;
    results.push({
      chunk_id: chunk.id, document_id: chunk.document_id, document_title: chunk.document_title,
      filename: chunk.filename, page_number: chunk.page_number, text: chunk.text, score: Number(score.toFixed(6)),
      lexical_score: Number(lexical.toFixed(6)), ...(semantic === null ? {} : { semantic_score: Number(semantic.toFixed(6)) }),
      mode: options.mode ?? 'keyword', matched_terms: matched, source_date: chunk.source_date, version: chunk.version,
      document_type: chunk.document_type, department: chunk.department ?? '', source_sha256: chunk.source_sha256,
      source_url: source, file_url: `${source}/file`, citation_url: `${source}?page=${chunk.page_number}&chunk=${encodeURIComponent(chunk.id)}`,
    });
  }
  results.sort((a, b) => b.score - a.score || b.lexical_score - a.lexical_score || a.document_id.localeCompare(b.document_id) || a.page_number - b.page_number);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const perDocument = Math.max(1, Math.min(12, options.max_passages_per_document ?? 3));
  const grouped = new Map<string, RankedSearchHit[]>();
  for (const hit of results) {
    const group = grouped.get(hit.document_id) ?? [];
    if (group.length < perDocument) group.push(hit);
    grouped.set(hit.document_id, group);
  }
  if (options.balanced === false) return [...grouped.values()].flat().sort((a, b) => b.score - a.score).slice(0, limit);
  // Round robin prevents a large PDF from monopolizing the evidence pool.
  const balanced: RankedSearchHit[] = [];
  for (let index = 0; index < perDocument && balanced.length < limit; index++) {
    for (const group of grouped.values()) {
      if (group[index]) balanced.push(group[index]);
      if (balanced.length === limit) break;
    }
  }
  return balanced;
}

export function groupSearchHits(hits: RankedSearchHit[]): SearchDocumentGroup[] {
  const groups = new Map<string, SearchDocumentGroup>();
  for (const hit of hits) {
    let group = groups.get(hit.document_id);
    if (!group) {
      group = {
        document_id: hit.document_id, document_title: hit.document_title, filename: hit.filename,
        document_type: hit.document_type ?? 'other', department: hit.department,
        source_date: hit.source_date ?? null, version: hit.version ?? '1', score: hit.score,
        passage_count: 0, passages: [], source_url: hit.source_url, file_url: hit.file_url,
      };
      groups.set(hit.document_id, group);
    }
    group.passages.push(hit); group.passage_count++; group.score = Math.max(group.score, hit.score);
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || a.document_title.localeCompare(b.document_title));
}
