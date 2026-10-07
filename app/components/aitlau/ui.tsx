'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, FileText, Loader2, Plus, X } from 'lucide-react';

export function IconButton({ children, label, onClick, disabled, className = '' }: { children: ReactNode; label: string; onClick?: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" title={label} aria-label={label} className={`icon-button ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Button({ children, onClick, variant = 'primary', disabled, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet'; disabled?: boolean; type?: 'button' | 'submit'; className?: string }) {
  return <button type={type} className={`button button-${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const busy = ['pending', 'processing', 'queued'].includes(status);
  return <Badge tone={status === 'ready' || status === 'completed' ? 'positive' : status === 'failed' ? 'danger' : busy ? 'warning' : 'neutral'}>
    {busy ? <Loader2 size={11} className="spin" /> : status === 'ready' || status === 'completed' ? <Check size={11} /> : null}{status}
  </Badge>;
}

export function ErrorNotice({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return <div className={`error-notice ${compact ? 'compact' : ''}`} role="alert"><AlertCircle size={17} /><div><strong>Couldn’t finish that request</strong><p>{message}</p></div>{onRetry && <button type="button" onClick={onRetry}>Try again <ArrowUpRight size={13} /></button>}</div>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, description, action, small = false, children }: { title: string; description: string; action?: ReactNode; small?: boolean; children?: ReactNode }) {
  return <div className={`empty-state ${small ? 'empty-small' : ''}`}>
    {children || <div className="empty-construction" aria-hidden="true"><div className="construction-line horizontal" /><div className="construction-line vertical" /><div className="construction-sheet back"><span /></div><div className="construction-sheet front"><FileText size={24} strokeWidth={1.25} /><i /><i /><i /></div><span className="construction-marker">01 / SOURCE</span><Plus className="construction-cross" size={13} strokeWidth={1} /></div>}
    <h3>{title}</h3><p>{description}</p>{action && <div className="empty-actions">{action}</div>}
  </div>;
}

export function LoadingState({ label = 'Loading your workspace…', rows = 3 }: { label?: string; rows?: number }) {
  return <div className="loading-state" role="status"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><div className="skeleton-icon" /><div><span style={{ width: `${52 + i * 11}%` }} /><span style={{ width: `${36 + i * 7}%` }} /></div></div>)}</div>;
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]') || []);
        const start = controls[0]; const end = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end?.focus(); }
        if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start?.focus(); }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = bodyOverflow; old?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${wide ? 'modal-wide' : ''}`}><header><div><p className="eyebrow">AITLAU / WORKSPACE</p><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></header>{children}</div></div>;
}

export function InlineMarkdown({ text }: { text: string }) {
  return <div className="markdown-content">{text.split(/\n\s*\n/).map((block, index) => {
    const heading = block.match(/^(#{1,4})\s+(.+)$/);
    if (heading) return heading[1].length < 3 ? <h3 key={index}>{heading[2]}</h3> : <h4 key={index}>{heading[2]}</h4>;
    const lines = block.split('\n');
    if (lines.every(line => /^\s*[-*]\s/.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{formatText(line.replace(/^\s*[-*]\s/, ''))}</li>)}</ul>;
    if (lines.every(line => /^\s*\d+[.)]\s/.test(line))) return <ol key={index}>{lines.map((line, i) => <li key={i}>{formatText(line.replace(/^\s*\d+[.)]\s/, ''))}</li>)}</ol>;
    if (lines.length > 1 && lines[0].includes('|') && /\|?\s*:?-{3}/.test(lines[1])) {
      const cells = (line: string) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(v => v.trim());
      return <div className="markdown-table" key={index}><table><thead><tr>{cells(lines[0]).map((cell, i) => <th key={i}>{formatText(cell)}</th>)}</tr></thead><tbody>{lines.slice(2).map((line, i) => <tr key={i}>{cells(line).map((cell, j) => <td key={j}>{formatText(cell)}</td>)}</tr>)}</tbody></table></div>;
    }
    return <p key={index}>{formatText(block)}</p>;
  })}</div>;
}

function formatText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
