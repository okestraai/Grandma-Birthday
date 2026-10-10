import { lazy, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Database,
  HardDrive,
  ImagePlus,
  Mail,
  MessageSquareQuote,
  ScanLine,
  UserCheck,
  Users,
} from 'lucide-react';
import type { StorageSummary } from '@birthday/types';
import { dashboardQuery } from '@/lib/admin-queries';
import { useAuth } from '@/lib/auth';
import { cn, formatBytes, formatDateTime, formatRelative } from '@/lib/utils';
import { PageHeader, Panel, StatCard } from '@/components/admin/ui';
import { Meter } from '@/components/admin/misc';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { auditTarget, humaniseAction, humaniseEntity } from '@/components/admin/audit/format';

const Charts = lazy(() => import('@/components/admin/dashboard/Charts'));

const n = (value: number | undefined) => (value ?? 0).toLocaleString();

function storagePercent(storage: StorageSummary): number {
  if (storage.quotaBytes <= 0) return 0;
  return Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100));
}

const storageTone = { OK: 'navy', WARNING: 'warning', CRITICAL: 'error', FULL: 'error' } as const;

/** A StatCard that links somewhere. */
function LinkedCard({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="block rounded-xl transition-shadow hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich"
    >
      {children}
    </Link>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading charts">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-navy/10 bg-white p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-56 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { can } = useAuth();
  const query = useQuery({ ...dashboardQuery, refetchInterval: 20_000 });
  const stats = query.data;
  const loading = query.isPending;

  if (query.isError && !stats) {
    return (
      <>
        <PageHeader title="Dashboard" description="An overview of guests, uploads and activity." />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const pct = stats ? storagePercent(stats.storage) : 0;
  const capacityPct = stats && stats.capacity > 0 ? Math.round((stats.confirmedPeople / stats.capacity) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="An overview of guests, uploads and activity. Updates every 20 seconds."
        actions={
          stats && query.dataUpdatedAt ? (
            <p className="text-xs text-muted" aria-live="polite">
              Updated {formatRelative(new Date(query.dataUpdatedAt).toISOString())}
            </p>
          ) : undefined
        }
      />

      <h2 className="sr-only">Key figures</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total invitations"
          icon={<Mail />}
          loading={loading}
          value={stats ? n(stats.totalInvitations) : null}
          hint={stats ? `${n(stats.activeInvitations)} active` : undefined}
        />
        <StatCard label="Registered guests" icon={<Users />} loading={loading} value={stats ? n(stats.registeredGuests) : null} />
        <StatCard
          label="Confirmed guests"
          icon={<UserCheck />}
          tone="emerald"
          loading={loading}
          value={stats ? n(stats.confirmedGuests) : null}
          hint={stats ? `${n(stats.confirmedPeople)} people · ${n(stats.declinedGuests)} declined` : undefined}
        />
        <StatCard
          label="Checked in"
          icon={<ScanLine />}
          tone="gold"
          loading={loading}
          value={stats ? n(stats.checkedInGuests) : null}
          hint={stats ? `${n(stats.checkedInPeople)} people` : undefined}
        />
        <LinkedCard to="/admin/testimonials?filter=pending" label={`Pending testimonials: ${stats?.pendingTestimonials ?? 0}. Review testimonials`}>
          <StatCard
            label="Pending testimonials"
            icon={<MessageSquareQuote />}
            tone={stats && stats.pendingTestimonials > 0 ? 'warning' : 'navy'}
            loading={loading}
            value={stats ? n(stats.pendingTestimonials) : null}
            hint="Review testimonials →"
          />
        </LinkedCard>
        <LinkedCard to="/admin/guest-photos" label={`Pending photos: ${stats?.pendingPhotos ?? 0}. Review guest photos`}>
          <StatCard
            label="Pending photos"
            icon={<ImagePlus />}
            tone={stats && stats.pendingPhotos > 0 ? 'warning' : 'navy'}
            loading={loading}
            value={stats ? n(stats.pendingPhotos) : null}
            hint="Review guest photos →"
          />
        </LinkedCard>
        <StatCard
          label="Storage used"
          icon={<HardDrive />}
          tone={stats ? storageTone[stats.storage.level] : 'navy'}
          loading={loading}
          value={stats ? formatBytes(stats.storage.usedBytes) : null}
          hint={stats ? `${pct}% of ${formatBytes(stats.storage.quotaBytes, 0)}` : undefined}
        />
        <StatCard
          label="Storage remaining"
          icon={<Database />}
          tone={stats ? storageTone[stats.storage.level] : 'navy'}
          loading={loading}
          value={stats ? formatBytes(stats.storage.remainingBytes) : null}
          hint={stats ? `${n(stats.storage.photoCount)} photos · ${n(stats.storage.videoCount)} videos` : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel id="capacity" title="Event capacity" description="Confirmed people (guests plus companions) against the venue capacity">
          {!stats ? (
            <div aria-hidden>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-3 h-2 w-full" />
              <Skeleton className="mt-2 h-4 w-48" />
            </div>
          ) : (
            <>
              <p className="text-[13px] text-charcoal">
                <span className="text-xl font-semibold tabular-nums text-navy">{n(stats.confirmedPeople)}</span>
                <span className="text-muted"> of {n(stats.capacity)} places</span>
                <span className="ml-2 text-xs text-muted">({capacityPct}%)</span>
              </p>
              <Meter className="mt-3" value={stats.confirmedPeople} max={stats.capacity} label="Event capacity used" />
              {stats.capacityRemaining > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {n(stats.capacityRemaining)} {stats.capacityRemaining === 1 ? 'place' : 'places'} remaining
                </p>
              ) : (
                <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-error/10 px-3 py-2 text-[13px] text-error">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {stats.capacityRemaining < 0
                      ? `Capacity exceeded by ${n(Math.abs(stats.capacityRemaining))} ${Math.abs(stats.capacityRemaining) === 1 ? 'person' : 'people'}.`
                      : 'The event is at full capacity.'}{' '}
                    New RSVPs may be refused. {can('event:manage') && <Link to="/admin/event" className="font-medium underline">Review event settings</Link>}
                  </span>
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          id="guest-photos"
          title="Guest photo moderation"
          description="Photos and videos guests uploaded with the QR code"
          actions={
            <Link to="/admin/guest-photos" className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald hover:underline">
              Review <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          {!stats ? (
            <div className="grid grid-cols-3 gap-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <dl className="grid grid-cols-3 gap-3">
              {(
                [
                  ['Pending', stats.guestPhotoCounts.pending, 'bg-warning/10 text-[#8a5c12]'],
                  ['Approved', stats.guestPhotoCounts.approved, 'bg-success/10 text-success'],
                  ['Rejected', stats.guestPhotoCounts.rejected, 'bg-error/10 text-error'],
                ] as const
              ).map(([label, count, tone]) => (
                <div key={label} className={cn('rounded-lg px-3 py-2.5', tone)}>
                  <dt className="text-xs font-medium">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{n(count)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        {stats ? (
          <Suspense fallback={<ChartsSkeleton />}>
            <Charts rsvpsByDay={stats.rsvpsByDay} guestsByCategory={stats.guestsByCategory} />
          </Suspense>
        ) : (
          <ChartsSkeleton />
        )}
      </div>

      <Panel
        id="recent-activity"
        className="mt-4"
        title="Recent activity"
        actions={
          can('audit:read') ? (
            <Link to="/admin/audit-logs" className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald hover:underline">
              View audit log <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : undefined
        }
        bodyClassName="p-0"
      >
        {!stats ? (
          <ul className="divide-y divide-navy/[0.06]" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="px-4 py-3">
                <Skeleton className="h-4 w-2/3" />
              </li>
            ))}
          </ul>
        ) : stats.recentActivity.length === 0 ? (
          <EmptyState title="No activity yet" description="Changes made by admins will be listed here." className="m-4 py-8" />
        ) : (
          <ul className="divide-y divide-navy/[0.06]">
            {stats.recentActivity.map((entry) => {
              const target = auditTarget(entry, can);
              const body = (
                <>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 translate-y-0.5 text-emerald" aria-hidden />
                    <span className="min-w-0">
                      <span className={cn('font-medium text-navy', target && 'group-hover:underline')}>{humaniseAction(entry.action)}</span>
                      <span className="text-muted">
                        {' '}
                        · {humaniseEntity(entry.entityType)} · by {entry.actorEmail ?? 'System'}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 pl-5 text-xs text-muted">
                    <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                      {formatRelative(entry.createdAt)}
                    </time>
                    {target && <ChevronRight className="size-3.5 text-muted/70 group-hover:text-navy" aria-hidden />}
                  </span>
                </>
              );
              const rowClass = 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13px]';
              return (
                <li key={entry.id}>
                  {target ? (
                    <Link
                      to={target.to}
                      title={target.label}
                      className={cn(
                        rowClass,
                        'group transition-colors hover:bg-cream/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-rich',
                      )}
                    >
                      {body}
                      <span className="sr-only"> ({target.label})</span>
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
