import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminMedia } from '@birthday/types';
import { formatBytes } from '@/lib/utils';
import { AdminDialog } from '../overlays';
import { AButton, DetailList } from '../ui';
import { MediaPreview } from '../media';
import { DateCell, ModerationBadge } from '../misc';
import { dimensions, sourceLabel } from './actions';
import { mediaName } from './MediaCard';

/** Metadata list for one media item. */
export function MediaMeta({ media, className }: { media: AdminMedia; className?: string }) {
  return (
    <DetailList
      className={className}
      items={[
        { label: 'File name', value: <span className="break-all">{media.originalFilename}</span> },
        { label: 'Status', value: <ModerationBadge status={media.status} /> },
        { label: 'Kind', value: media.kind === 'VIDEO' ? 'Video' : 'Photo' },
        { label: 'Size', value: `${formatBytes(media.sizeBytes)}${media.storedBytes !== media.sizeBytes ? ` (${formatBytes(media.storedBytes)} stored)` : ''}` },
        { label: 'Dimensions', value: dimensions(media) ?? '—' },
        { label: 'Source', value: sourceLabel[media.source] },
        {
          label: 'Uploader',
          value: media.uploadedByName ?? media.uploaderName ?? (media.source === 'GUEST_UPLOAD' ? 'Anonymous guest' : '—'),
        },
        ...(media.uploaderMessage
          ? [{ label: 'Message', value: <span className="whitespace-pre-line italic">“{media.uploaderMessage}”</span> }]
          : []),
        { label: 'Album', value: media.albumTitle ?? 'No album' },
        { label: 'Caption', value: media.caption ?? '—' },
        { label: 'Alt text', value: media.altText ?? '—' },
        { label: 'Uploaded', value: <DateCell iso={media.createdAt} /> },
        ...(media.reviewedAt ? [{ label: 'Reviewed', value: <DateCell iso={media.reviewedAt} /> }] : []),
      ]}
    />
  );
}

export interface LightboxKey {
  /** KeyboardEvent.key, compared case-insensitively (e.g. "a", "Delete"). */
  key: string;
  /** Shown in the hint row, e.g. "A". */
  hint: string;
  label: string;
  run: (media: AdminMedia) => void;
  /** Hide the hint and ignore the key for this item (e.g. Approve on an approved item). */
  disabled?: (media: AdminMedia) => boolean;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(target.tagName);
}

/**
 * Keyboard-friendly preview of one item in a list: ArrowLeft/ArrowRight move through `items`,
 * extra `keys` run actions on the current item. Keys are ignored while `keysPaused` (e.g. a
 * confirm dialog is open on top) and while typing in a field.
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  actions,
  keys = [],
  keysPaused = false,
  aside,
}: {
  items: AdminMedia[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Buttons for the current item (footer). */
  actions?: (media: AdminMedia) => ReactNode;
  keys?: LightboxKey[];
  keysPaused?: boolean;
  /** Replaces the metadata panel. */
  aside?: (media: AdminMedia) => ReactNode;
}) {
  const open = index !== null && items.length > 0;
  const safeIndex = index === null ? 0 : Math.min(Math.max(index, 0), Math.max(items.length - 1, 0));
  const media = open ? items[safeIndex] : undefined;

  const state = useRef({ items, safeIndex, keys, keysPaused, onIndexChange });
  state.current = { items, safeIndex, keys, keysPaused, onIndexChange };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const s = state.current;
      if (s.keysPaused || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      const current = s.items[s.safeIndex];
      if (!current) return;
      if (event.key === 'ArrowLeft') {
        if (s.safeIndex > 0) s.onIndexChange(s.safeIndex - 1);
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowRight') {
        if (s.safeIndex < s.items.length - 1) s.onIndexChange(s.safeIndex + 1);
        event.preventDefault();
        return;
      }
      const match = s.keys.find((k) => k.key.toLowerCase() === event.key.toLowerCase());
      if (match && !match.disabled?.(current)) {
        event.preventDefault();
        match.run(current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const activeKeys = media ? keys.filter((k) => !k.disabled?.(media)) : [];

  return (
    <AdminDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="xl"
      title={media ? mediaName(media) : 'Preview'}
      description={media ? `Item ${safeIndex + 1} of ${items.length}` : undefined}
      footer={
        media && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <AButton size="sm" variant="ghost" disabled={safeIndex === 0} onClick={() => onIndexChange(safeIndex - 1)} aria-label="Previous item">
              <ChevronLeft aria-hidden /> <span className="hidden sm:inline">Previous</span>
            </AButton>
            <AButton
              size="sm"
              variant="ghost"
              disabled={safeIndex >= items.length - 1}
              onClick={() => onIndexChange(safeIndex + 1)}
              aria-label="Next item"
            >
              <span className="hidden sm:inline">Next</span> <ChevronRight aria-hidden />
            </AButton>
            <div className="ml-auto flex flex-wrap items-center gap-2">{actions?.(media)}</div>
          </div>
        )
      }
    >
      {media && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-48 items-center justify-center rounded-lg bg-navy/[0.04]">
            <MediaPreview media={media} />
          </div>
          <div className="min-w-0 space-y-4">
            {aside ? aside(media) : <MediaMeta media={media} />}
            <p className="hidden text-xs text-muted md:block" aria-label="Keyboard shortcuts">
              <Kbd>←</Kbd> <Kbd>→</Kbd> previous / next
              {activeKeys.map((k) => (
                <span key={k.key}>
                  {' · '}
                  <Kbd>{k.hint}</Kbd> {k.label.toLowerCase()}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}
    </AdminDialog>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-navy/15 bg-cream px-1 py-px font-sans text-[11px] text-navy">{children}</kbd>;
}
