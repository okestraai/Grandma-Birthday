import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { ModerationStatus } from '@birthday/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AButton, AInput, IconButton } from './ui';

/** Up/down buttons: the keyboard-friendly way to reorder lists. */
export function ReorderButtons({
  index,
  count,
  onMove,
  label,
  disabled,
}: {
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  /** Item name, for the accessible labels. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={`Move ${label} up`} tooltip={false} disabled={disabled || index === 0} onClick={() => onMove(-1)}>
        <ArrowUp aria-hidden />
      </IconButton>
      <IconButton label={`Move ${label} down`} tooltip={false} disabled={disabled || index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown aria-hidden />
      </IconButton>
    </div>
  );
}

/** Editable list of short strings (achievements, values, select options). */
export function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  addLabel = 'Add',
  max = 50,
  maxLength = 200,
  hint,
  error,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  max?: number;
  maxLength?: number;
  hint?: ReactNode;
  /** Validation message from the form (e.g. an item over the API limit). */
  error?: string;
}) {
  const id = useId();
  const full = values.length >= max;
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value || values.length >= max) return;
    onChange([...values, value]);
    setDraft('');
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return;
    const next = values.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-navy">{label}</legend>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      {values.length > 0 && (
        <ol className="mb-2 space-y-1.5">
          {values.map((value, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{index + 1}.</span>
              <AInput
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                aria-label={`${label} item ${index + 1}`}
                onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
              />
              <ReorderButtons index={index} count={values.length} onMove={(d) => move(index, d)} label={`item ${index + 1}`} />
              <IconButton label={`Remove item ${index + 1}`} tooltip={false} variant="danger-ghost" onClick={() => onChange(values.filter((_, i) => i !== index))}>
                <X aria-hidden />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <AInput
          id={id}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={`New ${label.toLowerCase()} item`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <AButton onClick={add} disabled={!draft.trim() || full}>
          <Plus aria-hidden /> {addLabel}
        </AButton>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-error">
          {error}
        </p>
      ) : (
        full && <p className="mt-1 text-xs text-muted">You can add up to {max} items. Remove one to add another.</p>
      )}
    </fieldset>
  );
}

const moderationTone = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' } as const;
const moderationLabel = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' } as const;

export function ModerationBadge({ status }: { status: ModerationStatus }) {
  return <Badge tone={moderationTone[status]}>{moderationLabel[status]}</Badge>;
}

/** Small numeric pill (sidebar pending counts). */
export function CountPill({ count, className, label }: { count: number; className?: string; label?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn('ml-auto min-w-5 rounded-full bg-gold px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums text-navy', className)}
      aria-label={label}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Usage bar for storage/capacity. Colour and text both carry the level. */
export function Meter({
  value,
  max,
  label,
  level,
  className,
}: {
  value: number;
  max: number;
  label: string;
  level?: 'OK' | 'WARNING' | 'CRITICAL' | 'FULL';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const computed = level ?? (pct >= 100 ? 'FULL' : pct >= 95 ? 'CRITICAL' : pct >= 80 ? 'WARNING' : 'OK');
  const color = { OK: 'bg-emerald', WARNING: 'bg-warning', CRITICAL: 'bg-error', FULL: 'bg-error' }[computed];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${Math.round(pct)}%`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-navy/[0.08]', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Formats an ISO date for table cells: "12 Sep 2026, 7:42 pm". */
export function DateCell({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return <span className="text-muted">—</span>;
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={date.toLocaleString()} className={cn('whitespace-nowrap tabular-nums', className)}>
      {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}
      <span className="text-muted">, {new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)}</span>
    </time>
  );
}

/** Scrolls to the element named by the URL hash (e.g. "#checkin-log") once `ready` is true. The router does not do this itself. */
export function useScrollToHash(ready = true) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    el?.scrollIntoView({ block: 'start' });
  }, [hash, ready]);
}
