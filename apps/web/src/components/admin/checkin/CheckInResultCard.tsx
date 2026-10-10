import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  ScanLine,
  UserX,
  Users,
  Utensils,
  Accessibility,
  XCircle,
} from 'lucide-react';
import type { CheckInRecord, CheckInVerifyResult, CheckInVerifyStatus } from '@birthday/types';
import { cn } from '@/lib/utils';

export type CheckInView =
  | { kind: 'verifying'; value: string }
  | { kind: 'result'; result: CheckInVerifyResult }
  | { kind: 'done'; record: CheckInRecord }
  | { kind: 'error'; message: string };

export function formatTimeOfDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

export function guestsLabel(n: number): string {
  return `${n} ${n === 1 ? 'Guest' : 'Guests'}`;
}

type Tone = 'valid' | 'warning' | 'danger' | 'neutral';

const toneClass: Record<Tone, { card: string; icon: string; heading: string }> = {
  valid: { card: 'border-success bg-success/[0.07]', icon: 'bg-success text-white', heading: 'text-success' },
  warning: { card: 'border-warning bg-warning/[0.09]', icon: 'bg-warning text-white', heading: 'text-[#8a5c12]' },
  danger: { card: 'border-error bg-error/[0.07]', icon: 'bg-error text-white', heading: 'text-error' },
  neutral: { card: 'border-navy/15 bg-white', icon: 'bg-navy/10 text-navy', heading: 'text-navy' },
};

/** Headline, explanation and tone for every verify status. Text always carries the meaning (not colour alone). */
export const STATUS_COPY: Record<CheckInVerifyStatus, { title: string; tone: Tone; icon: ReactNode; help: string }> = {
  VALID: { title: 'Valid Invitation', tone: 'valid', icon: <CheckCircle2 />, help: 'This guest may be admitted.' },
  ALREADY_CHECKED_IN: {
    title: 'Already Checked In',
    tone: 'warning',
    icon: <AlertTriangle />,
    help: 'This invitation has already been used. Check with the host desk before admitting again.',
  },
  REVOKED: { title: 'Invitation Revoked', tone: 'danger', icon: <Ban />, help: 'Do not admit. This invitation was cancelled — refer the guest to the host desk.' },
  EXPIRED: { title: 'Invitation Expired', tone: 'warning', icon: <Clock />, help: 'This invitation is no longer valid. Refer the guest to the host desk.' },
  NOT_ATTENDING: {
    title: 'Not Attending',
    tone: 'warning',
    icon: <UserX />,
    help: 'This guest declined the invitation. Refer them to the host desk if their plans changed.',
  },
  INVALID: { title: 'Invalid Code', tone: 'danger', icon: <XCircle />, help: 'This code is not a recognised invitation. Try again or search by name.' },
};

/** Guests arriving now: 1…party size. */
export function PartyStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-navy/10 bg-white px-3 py-2">
      <div>
        <p id="party-stepper-label" className="text-[13px] font-medium text-navy">
          Guests arriving now
        </p>
        <p className="text-xs text-muted">{value < max ? `Admitting ${value} of ${max}` : 'Full party'}</p>
      </div>
      <div className="flex items-center gap-2" role="group" aria-labelledby="party-stepper-label">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          className="flex size-11 items-center justify-center rounded-full border border-navy/15 text-navy disabled:opacity-40"
          aria-label="Fewer guests"
        >
          <Minus className="size-5" aria-hidden />
        </button>
        <output className="w-8 text-center text-xl font-semibold tabular-nums text-navy" aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-11 items-center justify-center rounded-full border border-navy/15 text-navy disabled:opacity-40"
          aria-label="More guests"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Shell({ tone, icon, title, children, headingRef }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode; headingRef: Ref<HTMLHeadingElement> }) {
  const t = toneClass[tone];
  return (
    <section aria-labelledby="checkin-result-title" className={cn('rounded-2xl border-2 p-4 sm:p-5', t.card)}>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-full [&_svg]:size-7', t.icon)} aria-hidden>
          {icon}
        </span>
        <h2 id="checkin-result-title" ref={headingRef} tabIndex={-1} className={cn('text-xl font-bold uppercase tracking-wide focus:outline-none', t.heading)}>
          {title}
        </h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const bigButton = 'flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors disabled:opacity-60 [&_svg]:size-5';

/**
 * The result of scanning or typing an invitation code, sized for a phone held at the door.
 * Pure presentation: the page owns the API calls.
 */
export function CheckInResultCard({
  view,
  onCheckIn,
  checkingIn,
  onReset,
  onRetry,
}: {
  view: CheckInView;
  onCheckIn: (partySize: number) => void;
  checkingIn?: boolean;
  onReset: () => void;
  onRetry?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const partySize = view.kind === 'result' ? (view.result.guest?.partySize ?? 1) : 1;
  const [admit, setAdmit] = useState(partySize);

  useEffect(() => setAdmit(partySize), [partySize, view]);
  // Move focus to the result so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (view.kind !== 'verifying') headingRef.current?.focus();
  }, [view]);

  const nextButton = (
    <button type="button" onClick={onReset} className={cn(bigButton, 'mt-4 bg-navy text-white hover:bg-[#0d2a44]')}>
      <ScanLine aria-hidden /> Scan next guest
    </button>
  );

  if (view.kind === 'verifying') {
    return (
      <section aria-busy="true" className="flex flex-col items-center gap-3 rounded-2xl border-2 border-navy/15 bg-white px-4 py-10 text-center">
        <Loader2 className="size-9 animate-spin text-navy" aria-hidden />
        <p className="text-lg font-semibold text-navy">Checking invitation…</p>
        <p className="max-w-full truncate font-mono text-xs text-muted">{view.value}</p>
      </section>
    );
  }

  if (view.kind === 'error') {
    return (
      <Shell tone="danger" icon={<XCircle />} title="Could Not Verify" headingRef={headingRef}>
        <p className="text-sm text-charcoal">{view.message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className={cn(bigButton, 'mt-4 border border-navy/20 bg-white text-navy')}>
            <RotateCcw aria-hidden /> Try again
          </button>
        )}
        {nextButton}
      </Shell>
    );
  }

  if (view.kind === 'done') {
    const r = view.record;
    return (
      <Shell tone="valid" icon={<CheckCircle2 />} title="Check-In Complete" headingRef={headingRef}>
        <p className="text-2xl font-semibold leading-tight text-navy">{r.guestName}</p>
        <p className="mt-1 text-sm text-charcoal">
          {guestsLabel(r.partySize)} admitted at {formatTimeOfDay(r.checkedInAt)}
          {r.categoryName ? ` · ${r.categoryName}` : ''}
        </p>
        {nextButton}
      </Shell>
    );
  }

  const { result } = view;
  const copy = STATUS_COPY[result.status];
  const guest = result.guest;

  return (
    <Shell tone={copy.tone} icon={copy.icon} title={copy.title} headingRef={headingRef}>
      {guest ? (
        <>
          <p className="text-2xl font-semibold leading-tight text-navy">{guest.guestName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-charcoal">
            {guest.categoryName && <span className="rounded-full bg-navy/[0.07] px-2 py-0.5 text-xs font-medium text-navy">{guest.categoryName}</span>}
            <span className="inline-flex items-center gap-1 font-semibold">
              <Users className="size-4" aria-hidden /> {guestsLabel(guest.partySize)}
            </span>
            <span className="font-mono text-xs text-muted">{guest.code}</span>
          </div>
          {guest.companions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Companions</p>
              <ul className="mt-1 list-inside list-disc text-sm text-charcoal">
                {guest.companions.map((name, i) => (
                  <li key={`${name}-${i}`}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          {(guest.dietary || guest.accessibility) && (
            <div className="mt-3 space-y-1.5 rounded-lg bg-white/80 p-2.5 text-sm">
              {guest.dietary && (
                <p className="flex gap-2">
                  <Utensils className="mt-0.5 size-4 shrink-0 text-gold-rich" aria-hidden />
                  <span>
                    <span className="font-medium">Dietary:</span> {guest.dietary}
                  </span>
                </p>
              )}
              {guest.accessibility && (
                <p className="flex gap-2">
                  <Accessibility className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
                  <span>
                    <span className="font-medium">Accessibility:</span> {guest.accessibility}
                  </span>
                </p>
              )}
            </div>
          )}
        </>
      ) : null}

      {result.status === 'ALREADY_CHECKED_IN' && result.checkIn && (
        <p className="mt-3 rounded-lg bg-white/80 p-2.5 text-sm font-medium text-charcoal">
          Checked in at {formatTimeOfDay(result.checkIn.checkedInAt)}
          {result.checkIn.checkedInByName ? ` by ${result.checkIn.checkedInByName}` : ''} · {guestsLabel(result.checkIn.partySize)}
        </p>
      )}

      <p className={cn('mt-3 text-sm', result.status === 'VALID' ? 'text-muted' : 'font-medium text-charcoal')}>{copy.help}</p>

      {result.status === 'VALID' && guest ? (
        <>
          {guest.partySize > 1 && (
            <div className="mt-4">
              <PartyStepper value={admit} max={guest.partySize} onChange={setAdmit} />
            </div>
          )}
          <button
            type="button"
            onClick={() => onCheckIn(admit)}
            disabled={checkingIn}
            aria-busy={checkingIn || undefined}
            className={cn(bigButton, 'mt-4 h-16 bg-emerald text-lg uppercase tracking-wider text-white hover:bg-emerald-deep')}
          >
            {checkingIn ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
            {checkingIn ? 'Checking in…' : `Check in${admit > 1 ? ` ${admit}` : ''}`}
          </button>
          <button type="button" onClick={onReset} className="mt-2 flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-navy hover:bg-navy/5">
            Cancel
          </button>
        </>
      ) : (
        nextButton
      )}
    </Shell>
  );
}

/** Text read out by the aria-live region for each view. */
export function announcementFor(view: CheckInView | null): string {
  if (!view) return '';
  switch (view.kind) {
    case 'verifying':
      return 'Checking invitation';
    case 'error':
      return `Could not verify. ${view.message}`;
    case 'done':
      return `Check-in complete. ${view.record.guestName}, ${guestsLabel(view.record.partySize)}.`;
    case 'result': {
      const copy = STATUS_COPY[view.result.status];
      const name = view.result.guest?.guestName;
      return `${copy.title}.${name ? ` ${name}.` : ''}${view.result.guest ? ` ${guestsLabel(view.result.guest.partySize)}.` : ''}`;
    }
  }
}
