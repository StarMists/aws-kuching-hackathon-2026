import { assertSameOrigin, requireOwner } from '@/lib/auth';
import type { Note } from '@/lib/contracts';
import { db, first, now, ownedProject, parseJson } from '@/lib/db';
import { ApiError, apiData, apiError, readJson, requiredString } from '@/lib/http';
import { validateCitations } from '@/lib/retrieval/citations';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

async function ownedNote(owner: string, id: string): Promise<Note> {
  const note = await first<Note>('SELECT * FROM notes WHERE id=? AND owner_id=?', id, owner);
  if (!note) throw new ApiError(404, 'NOTE_NOT_FOUND', 'This note was not found in your workspace.');
  await ownedProject(owner, note.project_id);
  return { ...note, citations: parseJson(note.citations_json, []) };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try { return apiData(await ownedNote(await requireOwner(request), (await context.params).id)); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    assertSameOrigin(request);
    const owner = await requireOwner(request);
    const note = await ownedNote(owner, (await context.params).id);
    const body = await readJson<Record<string, unknown>>(request);
    if (body.project_id !== undefined && body.project_id !== note.project_id) throw new ApiError(400, 'INVALID_SCOPE', 'A saved note stays in its original project.');
    if (body.expected_updated_at !== undefined && body.expected_updated_at !== note.updated_at) throw new ApiError(409, 'NOTE_CHANGED', 'This note changed since you opened it. Reload before saving your edits.');
    const title = body.title === undefined ? note.title : requiredString(body.title, 'Note title', 200);
    if (body.content !== undefined && (typeof body.content !== 'string' || body.content.length > 100000)) throw new ApiError(400, 'INVALID_INPUT', 'Note content must be text of up to 100000 characters.');
    const content = typeof body.content === 'string' ? body.content : note.content;
    const citations = body.citations === undefined ? note.citations ?? [] : await validateCitations(owner, note.project_id, body.citations);
    const currentTime = now();
    const timestamp = currentTime > note.updated_at ? currentTime : new Date(Date.parse(note.updated_at) + 1).toISOString();
    const update = await db().prepare('UPDATE notes SET title=?,content=?,citations_json=?,updated_at=? WHERE id=? AND owner_id=? AND project_id=? AND updated_at=?').bind(title, content, JSON.stringify(citations), timestamp, note.id, owner, note.project_id, note.updated_at).run();
    if (update.meta.changes !== 1) throw new ApiError(409, 'NOTE_CHANGED', 'This note changed while your edits were saving. Reload before trying again.');
    return apiData({ ...note, title, content, citations_json: JSON.stringify(citations), citations, updated_at: timestamp });
  } catch (error) { return apiError(error); }
}
