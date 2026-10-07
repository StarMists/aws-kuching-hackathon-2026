'use client';

import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { FileText, FolderPlus, Loader2, Plus, UploadCloud, X } from 'lucide-react';
import type { Document, Project, RuntimeConfig } from '@/lib/contracts';
import { errorText, request } from './api';
import { Badge, Button, ErrorNotice, IconButton, Modal } from './ui';

export function ProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || busy) return; setBusy(true); setError('');
    try { const project = await request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim() }) }); onCreated(project); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Modal title="A place for the whole picture." description="Collect documents, conversations, and findings around one investigation." onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} className="dialog-form"><label>Project name <input required maxLength={160} placeholder="e.g. Procurement policy review" value={name} onChange={e => setName(e.target.value)} /></label><label>What are you investigating? <textarea rows={3} maxLength={2000} placeholder="An optional description to keep the team’s context close." value={description} onChange={e => setDescription(e.target.value)} /></label>{error && <ErrorNotice message={error} compact />}<div className="form-footer"><span><FolderPlus size={15} /> Private to your account</span><Button type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}Create project</Button></div></form></Modal>;
}

export function UploadDialog({ onClose, onUploaded, projects, documents, projectId, config }: { onClose: () => void; onUploaded: (message: string) => void; projects: Project[]; documents: Document[]; projectId?: string; config: RuntimeConfig | null }) {
  const [mode, setMode] = useState<'file' | 'text'>('file'); const [file, setFile] = useState<File | null>(null); const [text, setText] = useState(''); const [title, setTitle] = useState(''); const [type, setType] = useState('Document'); const [date, setDate] = useState(''); const [version, setVersion] = useState(''); const [project, setProject] = useState(projectId || ''); const [previous, setPrevious] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [dragging, setDragging] = useState(false); const fileInput = useRef<HTMLInputElement>(null);
  const maxBytes = config?.max_upload_bytes || 20 * 1024 * 1024;
  function chooseFile(chosen?: File) { if (!chosen) return; setError(''); if (chosen.size > maxBytes) { setError(`This file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit.`); return; } setFile(chosen); if (!title) setTitle(chosen.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')); }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !title.trim() || (mode === 'file' ? !file : !text.trim())) return;
    setBusy(true); setError('');
    const oldDoc = documents.find(d => d.id === previous);
    const metadata: Record<string, string> = { title: title.trim(), document_type: type, version: version.trim(), ...(date ? { source_date: date } : {}), ...(project ? { project_id: project } : {}), ...(previous ? { previous_document_id: previous, family_id: oldDoc?.family_id || previous } : {}) };
    try {
      if (mode === 'text') {
        await request('/api/documents', { method: 'POST', body: JSON.stringify({ ...metadata, text: text.trim(), filename: `${title.trim().replace(/[^a-zA-Z0-9 _-]/g, '') || 'document'}.txt` }) });
      } else {
        // Server extraction works for native-text PDFs and images. The ingestion worker
        // supplies a bounded browser helper for scan-page rendering when available.
        let form: FormData;
        const helper = await import('@/lib/ingest/browser').catch(() => null);
        if (helper?.prepareDocumentUpload) { form = await helper.prepareDocumentUpload(file!, metadata); }
        else { form = new FormData(); form.append('file', file!); Object.entries(metadata).forEach(([key, value]) => form.append(key, value)); }
        await request('/api/documents', { method: 'POST', body: form });
      }
      onUploaded(`“${title.trim()}” was added to your library.`);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Modal title="Bring the evidence in." description="Keep the original source, searchable text, and page references together." onClose={() => { if (!busy) onClose(); }} wide><form onSubmit={submit} className="dialog-form"><div className="segmented"><button type="button" className={mode === 'file' ? 'selected' : ''} onClick={() => setMode('file')}><UploadCloud size={15} /> Upload file</button><button type="button" className={mode === 'text' ? 'selected' : ''} onClick={() => setMode('text')}><FileText size={15} /> Paste text</button></div>{mode === 'file' ? <div className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}><input ref={fileInput} type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={e => chooseFile(e.target.files?.[0])} className="sr-only" aria-label="Choose a document file" />{file ? <><div className="file-upload-icon"><FileText size={26} strokeWidth={1.25} /></div><div><strong>{file.name}</strong><p>{(file.size / 1024).toFixed(0)} KB · Original file preserved</p></div><IconButton label="Remove selected file" onClick={() => setFile(null)}><X size={15} /></IconButton></> : <><UploadCloud size={27} strokeWidth={1.25} /><strong>Drop a source document here</strong><p>PDF, TXT, Markdown, or image · up to {Math.round(maxBytes / 1024 / 1024)} MB</p><Button variant="secondary" onClick={() => fileInput.current?.click()}>Choose file</Button></>}</div> : <label>Source text <textarea rows={7} required value={text} onChange={e => setText(e.target.value)} placeholder="Paste the source material you want to search and cite…" /></label>}<div className="form-grid"><label className="span-two">Document title <input required value={title} maxLength={300} onChange={e => setTitle(e.target.value)} placeholder="A clear, searchable title" /></label><label>Type <select value={type} onChange={e => setType(e.target.value)}>{['Document', 'Policy', 'Procedure', 'Notice', 'Report', 'Meeting record', 'Correspondence', 'Case record', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label><label>Source date <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Project <select value={project} onChange={e => setProject(e.target.value)}><option value="">Library only</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Version <input value={version} maxLength={80} onChange={e => setVersion(e.target.value)} placeholder="e.g. v2.0" /></label><label className="span-two">Revises an existing document <select value={previous} onChange={e => setPrevious(e.target.value)}><option value="">New document, no previous version</option>{documents.map(d => <option key={d.id} value={d.id}>{d.title}{d.version ? ` · ${d.version}` : ''}</option>)}</select></label></div>{error && <ErrorNotice message={error} compact />}<div className="upload-note"><Badge>Source preserved</Badge><p>Images and scanned pages use OCR when a compatible model is configured. Extracted text remains linked to its original page.</p></div><div className="form-footer"><span>{busy ? 'Extracting and indexing your source…' : 'Stored in your private workspace'}</span><Button type="submit" disabled={busy || !title.trim() || (mode === 'file' ? !file : !text.trim())}>{busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}{busy ? 'Adding document' : 'Add to library'}</Button></div></form></Modal>;
}
