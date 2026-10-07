import { assertSameOrigin, requireOwner } from '@/lib/auth';
import type { Note } from '@/lib/contracts';
import { all, db, newId, now, ownedProject, parseJson } from '@/lib/db';
import { ApiError, apiData, apiError, readJson, requiredString } from '@/lib/http';
import { validateCitations } from '@/lib/retrieval/citations';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireOwner(request);
    const projectId = new URL(request.url).searchParams.get('project_id');
    if (projectId) await ownedProject(owner, projectId);
    const rows = await all<Note>(`SELECT n.* FROM notes n JOIN projects p ON p.id=n.project_id WHERE n.owner_id=? AND p.owner_id=?${projectId ? ' AND n.project_id=?' : ''} ORDER BY n.updated_at DESC`, owner, owner, ...(projectId ? [projectId] : []));
    return apiData(rows.map(note => ({ ...note, citations: parseJson(note.citations_json, []) })));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const owner = await requireOwner(request);
    const body = await readJson<Record<string, unknown>>(request);
    const projectId = requiredString(body.project_id, 'Project ID', 200);
    await ownedProject(owner, projectId);
    const title = requiredString(body.title, 'Note title', 200);
    if (body.content !== undefined && (typeof body.content !== 'string' || body.content.length > 100000)) throw new ApiError(400, 'INVALID_INPUT', 'Note content must be text of up to 100000 characters.');
    const content = typeof body.content === 'string' ? body.content : '';
    const citations = await validateCitations(owner, projectId, body.citations);
    const timestamp = now();
    const note: Note = { id: newId(), owner_id: owner, project_id: projectId, title, content, citations_json: JSON.stringify(citations), citations, created_at: timestamp, updated_at: timestamp };
    await db().prepare('INSERT INTO notes (id,owner_id,project_id,title,content,citations_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(note.id, owner, projectId, title, content, note.citations_json!, timestamp, timestamp).run();
    return apiData(note, 201);
  } catch (error) { return apiError(error); }
}
