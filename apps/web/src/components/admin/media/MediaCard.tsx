import type { ComponentType, ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { MoreHorizontal } from 'lucide-react';
import type { AdminMedia } from '@birthday/types';
import { cn, formatBytes } from '@/lib/utils';
import { ACheckbox, AButton } from '../ui';
import { MediaThumb } from '../media';
import { ModerationBadge } from '../misc';

export interface MenuAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** "More actions" dropdown for a media item. */
export function ActionsMenu({ label, actions, className }: { label: string; actions: MenuAction[]; className?: string }) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <AButton size="icon" variant="ghost" aria-label={label} className={className}>
          <MoreHorizontal aria-hidden />
        </AButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-navy/10 bg-white p-1 text-[13px] shadow-lift"
        >
          {visible.map((action) => {
            const Icon = action.icon;
            return (
              <DropdownMenu.Item
                key={action.label}
                onSelect={action.onSelect}
                className={cn(
                  'flex h-10 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 outline-none md:h-8',
                  action.danger ? 'text-error data-[highlighted]:bg-error/10' : 'text-navy data-[highlighted]:bg-navy/[0.06]',
                )}
              >
                {Icon && <Icon className="size-4 shrink-0" />}
                {action.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function mediaName(media: Pick<AdminMedia, 'caption' | 'originalFilename'>): string {
  return media.caption?.trim() || media.originalFilename;
}

/**
 * Grid card: thumbnail (opens preview), selection checkbox, status badge for items that are not
 * approved, caption and file size, an actions menu and an optional footer (e.g. reorder buttons).
 */
export function MediaCard({
  media,
  selected,
  onSelectedChange,
  onOpen,
  actions,
  footer,
  badge,
  showStatus = true,
}: {
  media: AdminMedia;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onOpen?: () => void;
  actions?: MenuAction[];
  footer?: ReactNode;
  /** Extra badge in the top-right corner (e.g. "Cover"). */
  badge?: ReactNode;
  /** Show the status badge for pending/rejected items. */
  showStatus?: boolean;
}) {
  const name = mediaName(media);
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow',
        selected ? 'border-gold-rich ring-2 ring-gold/40' : 'border-navy/10 hover:shadow-sm',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-rich"
        aria-label={`Preview ${name}`}
      >
        <MediaThumb media={media} className="aspect-square w-full" />
      </button>
      {onSelectedChange && (
        <div className="absolute left-2 top-2 rounded bg-white/90 p-1 shadow-sm">
          <ACheckbox checked={!!selected} onCheckedChange={onSelectedChange} aria-label={`Select ${name}`} />
        </div>
      )}
      <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
        {badge}
        {showStatus && media.status !== 'APPROVED' && <ModerationBadge status={media.status} />}
      </div>
      <div className="flex items-start gap-1 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-navy" title={name}>
            {name}
          </p>
          <p className="truncate text-[11px] text-muted">
            {media.kind === 'VIDEO' ? 'Video' : 'Photo'} · {formatBytes(media.sizeBytes)}
            {media.albumTitle ? ` · ${media.albumTitle}` : ''}
          </p>
        </div>
        {actions && <ActionsMenu label={`Actions for ${name}`} actions={actions} className="-mr-1 shrink-0" />}
      </div>
      {footer && <div className="flex items-center justify-between gap-1 border-t border-navy/[0.08] px-1.5 py-1">{footer}</div>}
    </div>
  );
}

/** Grid layout for MediaCards, with skeletons while loading. */
export function MediaGrid({ children, loading, label, skeletons = 12 }: { children?: ReactNode; loading?: boolean; label: string; skeletons?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-label={label} aria-busy={loading || undefined}>
      {loading
        ? Array.from({ length: skeletons }, (_, i) => (
            <li key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-navy/[0.06]" aria-hidden />
          ))
        : children}
    </ul>
  );
}
