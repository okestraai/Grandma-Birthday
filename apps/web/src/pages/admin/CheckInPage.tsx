import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard, QrCode, Search, Users } from 'lucide-react';
import type { CheckInOverview, CheckInRecord, CheckInRequest, CheckInVerifyResult } from '@birthday/types';
import { api, errorMessage, isApiError } from '@/lib/api';
import { affects } from '@/lib/admin-api';
import { checkinOverviewQuery } from '@/lib/admin-queries';
import { cn, formatRelative } from '@/lib/utils';
import { PageHeader } from '@/components/admin/ui';
import { Meter } from '@/components/admin/misc';
import { QrScannerView } from '@/components/admin/checkin/QrScannerView';
import { CodeEntry, NameSearch } from '@/components/admin/checkin/ManualLookup';
import { CheckInResultCard, announcementFor, formatTimeOfDay, guestsLabel, type CheckInView } from '@/components/admin/checkin/CheckInResultCard';

type Mode = 'scan' | 'code' | 'search';

/** The same code scanned again within this window is ignored (the camera sees it many times a second). */
const REPEAT_WINDOW_MS = 5000;

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iOS Safari) — the visual and spoken result is enough.
  }
}

function OverviewBar({ overview, loading }: { overview: CheckInOverview | undefined; loading: boolean }) {
  const people = overview?.checkedInPeople ?? 0;
  const expected = overview?.expectedPeople ?? 0;
  return (
    <div className="rounded-xl border border-navy/10 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-navy">Checked in</p>
        {loading ? (
          <span className="h-5 w-20 animate-pulse rounded bg-navy/[0.07]" aria-hidden />
        ) : (
          <p className="text-[13px] tabular-nums text-muted" aria-live="polite">
            <span className="text-lg font-semibold text-navy">{people.toLocaleString()}</span> / {expected.toLocaleString()} people
            <span className="ml-2 hidden sm:inline">· {overview?.checkedInGuests ?? 0} {overview?.checkedInGuests === 1 ? 'invitation' : 'invitations'}</span>
          </p>
        )}
      </div>
      <Meter value={people} max={Math.max(expected, 1)} label="People checked in" level="OK" className="mt-2" />
    </div>
  );
}

function RecentList({ records }: { records: CheckInRecord[] }) {
  if (records.length === 0) return <p className="text-[13px] text-muted">No check-ins yet.</p>;
  return (
    <ul className="divide-y divide-navy/[0.06]">
      {records.map((r) => (
        <li key={r.id} className={cn('flex items-center gap-3 py-2', r.reversedAt && 'opacity-60')}>
          <div className="min-w-0 flex-1">
            <p className={cn('truncate text-[13px] font-medium text-navy', r.reversedAt && 'line-through')}>{r.guestName}</p>
            <p className="truncate text-xs text-muted">
              {guestsLabel(r.partySize)}
              {r.categoryName ? ` · ${r.categoryName}` : ''}
              {r.checkedInByName ? ` · by ${r.checkedInByName}` : ''}
              {r.reversedAt ? ' · reversed' : ''}
            </p>
          </div>
          <time dateTime={r.checkedInAt} title={formatRelative(r.checkedInAt)} className="shrink-0 text-xs tabular-nums text-muted">
            {formatTimeOfDay(r.checkedInAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

export default function CheckInPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('scan');
  const [view, setView] = useState<CheckInView | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const lastScan = useRef<{ value: string; at: number } | null>(null);
  const lastValue = useRef<string>('');
  const busy = useRef(false);

  const overview = useQuery({
    ...checkinOverviewQuery,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const refreshCounts = useCallback(() => {
    void Promise.all(affects.checkins.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  }, [queryClient]);

  const verify = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value || busy.current) return;
    busy.current = true;
    lastValue.current = value;
    setView({ kind: 'verifying', value });
    try {
      const result = await api.post<CheckInVerifyResult>('/checkin/verify', { value });
      setView({ kind: 'result', result });
      vibrate(result.status === 'VALID' ? 80 : [120, 80, 120]);
    } catch (error) {
      setView({ kind: 'error', message: errorMessage(error) });
      vibrate([120, 80, 120]);
    } finally {
      busy.current = false;
    }
  }, []);

  const onScan = useCallback(
    (value: string) => {
      const now = Date.now();
      const previous = lastScan.current;
      if (previous && previous.value === value && now - previous.at < REPEAT_WINDOW_MS) return;
      lastScan.current = { value, at: now };
      void verify(value);
    },
    [verify],
  );

  const checkIn = async (partySize: number) => {
    if (view?.kind !== 'result' || !view.result.guest) return;
    const guest = view.result.guest;
    setCheckingIn(true);
    try {
      const body: CheckInRequest = { invitationId: guest.invitationId, partySize, deviceInfo: navigator.userAgent.slice(0, 200) };
      const record = await api.post<CheckInRecord>('/checkin', body);
      setView({ kind: 'done', record });
      vibrate([60, 40, 60]);
      refreshCounts();
    } catch (error) {
      if (isApiError(error, 'ALREADY_CHECKED_IN')) {
        // Someone else admitted them a moment ago: show who and when.
        await verify(guest.code);
        refreshCounts();
      } else {
        setView({ kind: 'error', message: errorMessage(error) });
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const reset = () => {
    setView(null);
    // Allow the same code to be scanned again deliberately after "Scan next guest".
    lastScan.current = lastScan.current ? { ...lastScan.current, at: Date.now() - REPEAT_WINDOW_MS + 1500 } : null;
  };

  const tabs: { value: Mode; label: string; icon: typeof QrCode }[] = [
    { value: 'scan', label: 'Scan QR', icon: QrCode },
    { value: 'code', label: 'Enter code', icon: Keyboard },
    { value: 'search', label: 'Find by name', icon: Search },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Check-In" description="Scan invitation QR codes at the door. Use the code or name search if a QR will not scan." />
      <p className="sr-only" aria-live="assertive" role="status">
        {announcementFor(view)}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <div className="lg:hidden">
            <OverviewBar overview={overview.data} loading={overview.isLoading} />
          </div>

          {view && (
            <CheckInResultCard
              view={view}
              onCheckIn={(n) => void checkIn(n)}
              checkingIn={checkingIn}
              onReset={reset}
              onRetry={view.kind === 'error' ? () => void verify(lastValue.current) : undefined}
            />
          )}
          {/* Kept mounted while a result shows so the camera only pauses instead of restarting. */}
          <div className={cn('space-y-3', view && 'hidden')}>
              <div role="tablist" aria-label="How to find the invitation" className="grid grid-cols-3 gap-1 rounded-xl bg-navy/[0.06] p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    id={`checkin-tab-${tab.value}`}
                    aria-selected={mode === tab.value}
                    aria-controls="checkin-panel"
                    onClick={() => setMode(tab.value)}
                    className={cn(
                      'flex h-11 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors',
                      mode === tab.value ? 'bg-white text-navy shadow-sm' : 'text-muted hover:text-navy',
                    )}
                  >
                    <tab.icon className="size-4" aria-hidden />
                    {tab.label}
                  </button>
                ))}
              </div>
              <div id="checkin-panel" role="tabpanel" aria-labelledby={`checkin-tab-${mode}`}>
                {mode === 'scan' ? (
                  <QrScannerView active={mode === 'scan' && !view} onScan={onScan} />
                ) : (
                  <div className="rounded-2xl border border-navy/10 bg-white p-4">
                    {mode === 'code' ? <CodeEntry onVerify={(v) => void verify(v)} /> : <NameSearch onVerify={(v) => void verify(v)} />}
                  </div>
                )}
              </div>
          </div>
        </div>

        <aside className="space-y-3" aria-label="Check-in progress">
          <div className="hidden lg:block">
            <OverviewBar overview={overview.data} loading={overview.isLoading} />
          </div>
          <section className="rounded-xl border border-navy/10 bg-white p-3" aria-labelledby="recent-checkins">
            <h2 id="recent-checkins" className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-navy">
              <Users className="size-4" aria-hidden /> Recent check-ins
            </h2>
            {overview.isLoading ? (
              <div className="space-y-2 py-1" aria-hidden>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-navy/[0.06]" />
                ))}
              </div>
            ) : overview.error ? (
              <p role="alert" className="text-[13px] text-error">
                {errorMessage(overview.error)}
              </p>
            ) : (
              <RecentList records={overview.data?.recent ?? []} />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
