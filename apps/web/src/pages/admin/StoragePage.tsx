import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, Eye, Settings, Trash2 } from 'lucide-react';
import type { AdminMedia, StorageDetail } from '@birthday/types';
import { storageQuery } from '@/lib/admin-queries';
import { useAuth } from '@/lib/auth';
import { cn, formatBytes } from '@/lib/utils';
import { ErrorState } from '@/components/ui/states';
import { AButton, IconButton, PageHeader, Panel } from '@/components/admin/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { Confirm } from '@/components/admin/overlays';
import { MediaThumb } from '@/components/admin/media';
import { DateCell, Meter, ModerationBadge } from '@/components/admin/misc';
import { formatSize, sourceLabel, useDeleteMedia } from '@/components/admin/media/actions';
import { MediaLightbox } from '@/components/admin/media/MediaLightbox';
import { ActionGuide } from '@/components/admin/action-guide';
import { STORAGE_ACTIONS } from '@/components/admin/action-guide-content';

const STATUS_LABEL = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' } as const;

function LevelBanner({ level, percent }: { level: StorageDetail['level']; percent: number }) {
  if (level === 'OK') return null;
  const full = level === 'FULL';
  const critical = level === 'CRITICAL' || full;
  const Icon = critical ? AlertOctagon : AlertTriangle;
  const message = full
    ? 'Storage is full. Guest and admin uploads are blocked until you free space or raise the quota.'
    : critical
      ? `Storage is ${Math.round(percent)}% full. Uploads will be blocked soon: delete large or rejected files, or raise the quota.`
      : `Storage is ${Math.round(percent)}% full. Consider deleting rejected uploads or large videos, or raising the quota.`;
  return (
    <div
      role={critical ? 'alert' : 'status'}
      className={cn(
        'mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]',
        critical ? 'border-error/30 bg-error/[0.06] text-error' : 'border-warning/40 bg-warning/10 text-[#8a5c12]',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">{full ? 'Full: ' : critical ? 'Critical: ' : 'Warning: '}</span>
        {message}
      </p>
    </div>
  );
}

function SmallTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-navy/10 text-xs text-muted">
          {head.map((h, i) => (
            <th key={h} scope="col" className={cn('py-1.5 font-medium', i > 0 && 'text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="py-3 text-center text-muted">
              Nothing stored yet
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={String(row[0])} className="border-b border-navy/[0.06] last:border-0">
              {row.map((cell, i) => (
                <td key={i} className={cn('py-1.5', i > 0 && 'text-right tabular-nums')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default function StoragePage() {
  const { can } = useAuth();
  const storage = useQuery(storageQuery);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<AdminMedia | null>(null);
  const remove = useDeleteMedia({
    onSuccess: () => {
      setDeleting(null);
      setPreviewIndex(null);
    },
  });

  const d = storage.data;
  const settingsLink = can('settings:manage') ? (
    <AButton asChild size="sm">
      <Link to="/admin/settings">
        <Settings aria-hidden /> Change quota in Settings
      </Link>
    </AButton>
  ) : null;

  const pageHeader = <PageHeader title="Storage" description="How much of the storage quota photos and videos use, and which files take the most space." actions={settingsLink} />;
  const header = (
    <>
      {pageHeader}
      <ActionGuide page="storage" rows={STORAGE_ACTIONS} />
    </>
  );

  if (storage.error) {
    return (
      <>
        {header}
        <ErrorState error={storage.error} onRetry={() => void storage.refetch()} />
      </>
    );
  }

  if (!d) {
    return (
      <>
        {header}
        <div className="space-y-4" aria-busy>
          <div className="h-36 animate-pulse rounded-xl bg-navy/[0.06]" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-40 animate-pulse rounded-xl bg-navy/[0.06]" />
            <div className="h-40 animate-pulse rounded-xl bg-navy/[0.06]" />
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-navy/[0.06]" />
        </div>
      </>
    );
  }

  const percent = d.percentUsed;
  const breakdown = [
    { key: 'photos', label: 'Photos', bytes: d.photoBytes, count: d.photoCount, color: 'bg-navy' },
    { key: 'videos', label: 'Videos', bytes: d.videoBytes, count: d.videoCount, color: 'bg-gold-rich' },
    { key: 'other', label: 'Other (thumbnails and previews)', bytes: d.otherBytes, count: null, color: 'bg-emerald' },
  ];
  const share = (bytes: number) => (d.quotaBytes > 0 ? Math.min(100, (bytes / d.quotaBytes) * 100) : 0);

  const columns: Column<AdminMedia>[] = [
    {
      id: 'thumb',
      header: <span className="sr-only">Preview</span>,
      cell: (m) => <MediaThumb media={m} className="size-10 rounded-md" />,
      className: 'w-14',
    },
    {
      id: 'name',
      header: 'File',
      cell: (m) => (
        <span className="block max-w-[16rem] truncate font-medium text-navy" title={m.originalFilename}>
          {m.originalFilename}
        </span>
      ),
    },
    { id: 'kind', header: 'Kind', cell: (m) => (m.kind === 'VIDEO' ? 'Video' : 'Photo'), hideBelow: 'sm' },
    { id: 'size', header: 'Size', cell: (m) => <span className="tabular-nums">{formatBytes(m.storedBytes || m.sizeBytes)}</span> },
    { id: 'source', header: 'Source', cell: (m) => sourceLabel[m.source], hideBelow: 'lg' },
    { id: 'status', header: 'Status', cell: (m) => <ModerationBadge status={m.status} />, hideBelow: 'md' },
    { id: 'created', header: 'Uploaded', cell: (m) => <DateCell iso={m.createdAt} />, hideBelow: 'xl' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'text-right',
      cell: (m) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Preview ${m.originalFilename}`} onClick={() => setPreviewIndex(d.largestFiles.indexOf(m))}>
            <Eye aria-hidden />
          </IconButton>
          <IconButton label={`Delete ${m.originalFilename}`} variant="danger-ghost" onClick={() => setDeleting(m)}>
            <Trash2 aria-hidden />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      {header}
      <LevelBanner level={d.level} percent={percent} />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted">Used</p>
            <p className="text-2xl font-semibold tabular-nums text-navy">
              {formatSize(d.usedBytes)} <span className="text-base font-normal text-muted">/ {formatSize(d.quotaBytes)}</span>
            </p>
          </div>
          <div className="text-right text-[13px]">
            <p className="font-semibold tabular-nums text-navy">{Math.round(percent)}% Used</p>
            <p className="text-muted">{formatSize(d.remainingBytes)} remaining</p>
          </div>
        </div>
        <Meter value={d.usedBytes} max={d.quotaBytes} level={d.level} label="Storage used" className="mt-3 h-3" />

        <h2 className="mb-2 mt-5 text-sm font-semibold text-navy">What uses the space</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-navy/[0.08]" role="img" aria-label="Storage used by type, as a share of the quota">
          {breakdown.map((b) => (
            <div key={b.key} className={cn('h-full', b.color)} style={{ width: `${share(b.bytes)}%` }} />
          ))}
        </div>
        <ul className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
          {breakdown.map((b) => (
            <li key={b.key} className="flex items-start gap-2">
              <span className={cn('mt-1 size-2.5 shrink-0 rounded-sm', b.color)} aria-hidden />
              <span>
                <span className="font-medium text-navy">{b.label}</span>
                <span className="block tabular-nums text-muted">
                  {formatBytes(b.bytes)}
                  {b.count !== null ? ` · ${b.count.toLocaleString()} file${b.count === 1 ? '' : 's'}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By source">
          <SmallTable
            caption="Storage by source"
            head={['Source', 'Files', 'Size']}
            rows={d.bySource.map((r) => [sourceLabel[r.source], r.count.toLocaleString(), formatBytes(r.bytes)])}
          />
        </Panel>
        <Panel title="By status">
          <SmallTable
            caption="Storage by moderation status"
            head={['Status', 'Files', 'Size']}
            rows={d.byStatus.map((r) => [STATUS_LABEL[r.status], r.count.toLocaleString(), formatBytes(r.bytes)])}
          />
        </Panel>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-navy">Largest files</h2>
      <DataTable
        caption="Largest files"
        columns={columns}
        rows={d.largestFiles}
        getRowId={(m) => m.id}
        emptyTitle="No files yet"
        mobileCard={(m) => (
          <div className="flex gap-3">
            <MediaThumb media={m} className="size-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-navy">{m.originalFilename}</p>
              <p className="text-xs text-muted">
                {formatBytes(m.storedBytes || m.sizeBytes)} · {m.kind === 'VIDEO' ? 'Video' : 'Photo'} · {sourceLabel[m.source]}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <ModerationBadge status={m.status} />
                <div className="flex gap-0.5">
                  <IconButton label={`Preview ${m.originalFilename}`} onClick={() => setPreviewIndex(d.largestFiles.indexOf(m))}>
                    <Eye aria-hidden />
                  </IconButton>
                  <IconButton label={`Delete ${m.originalFilename}`} variant="danger-ghost" onClick={() => setDeleting(m)}>
                    <Trash2 aria-hidden />
                  </IconButton>
                </div>
              </div>
            </div>
          </div>
        )}
      />

      <MediaLightbox
        items={d.largestFiles}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
        keysPaused={deleting !== null}
        actions={(m) => (
          <AButton size="sm" variant="danger-ghost" onClick={() => setDeleting(m)}>
            <Trash2 aria-hidden /> Delete
          </AButton>
        )}
      />

      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this file?"
        description={
          deleting && (
            <>
              <p>
                <span className="font-medium">{deleting.originalFilename}</span> ({formatBytes(deleting.storedBytes || deleting.sizeBytes)}) is removed from storage permanently.
              </p>
              <p className="mt-2">It disappears from any album, page or testimonial that uses it. This cannot be undone.</p>
            </>
          )
        }
        confirmLabel="Delete file"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
