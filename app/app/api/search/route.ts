import { assertSameOrigin, requireOwner } from '@/lib/auth';
import { apiData, apiError, readJson, requiredString } from '@/lib/http';
import { retrieve } from '@/lib/retrieval';
import { validateFilters } from '@/lib/retrieval/corpus';
import type { RetrievalOptions } from '@/lib/retrieval/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const owner = await requireOwner(request);
    const body = await readJson<Record<string, unknown>>(request);
    const options: RetrievalOptions = {
      query: requiredString(body.query, 'Search query', 2000),
      ...(body.project_id ? { project_id: requiredString(body.project_id, 'Project ID', 200) } : {}),
      ...(body.document_ids !== undefined ? { document_ids: body.document_ids as string[] } : {}),
      ...(body.allow_outside_project !== undefined ? { allow_outside_project: body.allow_outside_project as boolean } : {}),
      ...(body.mode !== undefined ? { mode: body.mode as RetrievalOptions['mode'] } : {}),
      ...(body.limit !== undefined ? { limit: body.limit as number } : {}),
      filters: validateFilters(body.filters), public_data_acknowledged: body.public_data_acknowledged === true,
      signal: request.signal,
    };
    return apiData(await retrieve(owner, options));
  } catch (error) { return apiError(error); }
}
