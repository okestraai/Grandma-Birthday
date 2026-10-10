import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import type { AuditLogEntry } from '@birthday/types';
import { cn } from '@/lib/utils';
import { DateCell } from '@/components/admin/misc';
import { useAuth } from '@/lib/auth';
import { auditTarget, humaniseEntity } from './format';

function hasMetadata(entry: AuditLogEntry): boolean {
  return !!entry.metadata && Object.keys(entry.metadata).length > 0;
}

function MetadataBlock({ entry, id }: { entry: AuditLogEntry; id: string }) {
  return (
    <pre id={id} className="max-h-80 overflow-auto rounded-lg bg-navy/[0.04] p-3 font-mono text-xs leading-relaxed text-charcoal">
      {JSON.stringify(entry.metadata, null, 2)}
    </pre>
  );
}

function ActorButton({ entry, onFilterActor }: { entry: AuditLogEntry; onFilterActor: (actorId: string, label: string) => void }) {
  const label = entry.actorEmail ?? 'System';
  if (!entry.actorId) return <span className={cn(!entry.actorEmail && 'text-muted')}>{label}</span>;
  return (
    <button
      type="button"
      onClick={() => onFilterActor(entry.actorId!, label)}
      className="break-all rounded text-left hover:text-emerald hover:underline focus-visible:outline-2 focus-visible:outline-gold-rich"
      title={`Show only actions by ${label}`}
    >
      {label}
    </button>
  );
}

/** Link to the page where the action happened, or nothing when there is none. */
function TargetLink({ entry }: { entry: AuditLogEntry }) {
  const { can } = useAuth();
  const target = auditTarget(entry, can);
  if (!target) return null;
  return (
    <Link
      to={target.to}
      className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald hover:bg-emerald/10 hover:underline md:h-7"
    >
      {target.label}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function DetailsToggle({ expanded, onToggle, controls }: { expanded: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      onClick={onToggle}
      className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-navy hover:bg-navy/[0.06] md:h-7"
    >
      {expanded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
      Details
    </button>
  );
}

export function AuditTable({
  rows,
  loading,
  onFilterActor,
}: {
  rows: AuditLogEntry[] | undefined;
  loading: boolean;
  onFilterActor: (actorId: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading || !rows) {
    return (
      <div className="space-y-2 rounded-xl border border-navy/10 bg-white p-3" aria-busy="true" aria-label="Loading audit log">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-navy/[0.06]" aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Phones: one card per entry. */}
      <ul className="space-y-2 md:hidden" aria-label="Audit log entries">
        {rows.map((entry) => {
          const detailsId = `audit-m-${entry.id}`;
          const open = expanded.has(entry.id);
          return (
            <li key={entry.id} className="rounded-xl border border-navy/10 bg-white p-3 text-[13px]">
              <div className="flex items-start justify-between gap-2">
                <code className="break-all font-mono text-xs font-medium text-navy">{entry.action}</code>
                <DateCell iso={entry.createdAt} className="shrink-0 text-xs" />
              </div>
              <p className="mt-1 text-muted">
                {humaniseEntity(entry.entityType)}
                {entry.entityId && (
                  <>
                    {' · '}
                    <span className="font-mono text-xs" title={entry.entityId}>
                      {entry.entityId.length > 12 ? `${entry.entityId.slice(0, 8)}…` : entry.entityId}
                    </span>
                  </>
                )}
              </p>
              <p className="mt-1">
                <ActorButton entry={entry} onFilterActor={onFilterActor} />
                {entry.ip && <span className="text-xs text-muted"> · {entry.ip}</span>}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <TargetLink entry={entry} />
                {hasMetadata(entry) && <DetailsToggle expanded={open} onToggle={() => toggle(entry.id)} controls={detailsId} />}
              </div>
              {hasMetadata(entry) && open && <MetadataBlock entry={entry} id={detailsId} />}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-navy/10 bg-white md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Audit log</caption>
          <thead>
            <tr className="border-b border-navy/10 bg-cream/50 text-xs font-medium text-muted">
              <th scope="col" className="px-3 py-2.5 font-medium">Time</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Actor</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Action</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Entity</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Entity ID</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">IP</th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                <span className="sr-only">Links and details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const detailsId = `audit-d-${entry.id}`;
              const open = expanded.has(entry.id);
              return (
                <Fragment key={entry.id}>
                  <tr className={cn('border-b border-navy/[0.06] align-middle hover:bg-cream/40', open && 'bg-cream/30')}>
                    <td className="px-3 py-2">
                      <DateCell iso={entry.createdAt} />
                    </td>
                    <td className="max-w-56 px-3 py-2">
                      <ActorButton entry={entry} onFilterActor={onFilterActor} />
                    </td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-xs text-navy">{entry.action}</code>
                    </td>
                    <td className="px-3 py-2">{humaniseEntity(entry.entityType)}</td>
                    <td className="max-w-40 px-3 py-2">
                      {entry.entityId ? (
                        <span className="block truncate font-mono text-xs" title={entry.entityId}>
                          {entry.entityId}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 font-mono text-xs lg:table-cell">{entry.ip ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <TargetLink entry={entry} />
                        {hasMetadata(entry) && <DetailsToggle expanded={open} onToggle={() => toggle(entry.id)} controls={detailsId} />}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-navy/[0.06] bg-cream/20">
                      <td colSpan={7} className="px-3 pb-3 pt-1">
                        <MetadataBlock entry={entry} id={detailsId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
