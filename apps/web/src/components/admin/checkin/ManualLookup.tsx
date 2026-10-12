import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import type { CheckInSearchResult } from '@birthday/types';
import { api, errorMessage } from '@/lib/api';
import { adminKeys } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const bigInput =
  'h-12 w-full rounded-xl border border-navy/20 bg-white px-4 text-base text-charcoal placeholder:text-muted/70 focus:border-gold-rich focus:outline-none focus:ring-2 focus:ring-gold/30';

/** Type an invitation code. */
export function CodeEntry({ onVerify, disabled }: { onVerify: (value: string) => void; disabled?: boolean }) {
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (value) onVerify(value);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="checkin-code" className="block text-[13px] font-medium text-navy">
        Invitation code
      </label>
      <input
        id="checkin-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="e.g. BP70-7K3Q9D"
        className={cn(bigInput, 'font-mono tracking-widest')}
        aria-describedby="checkin-code-hint"
      />
      <p id="checkin-code-hint" className="text-xs text-muted">
        The code is printed under the QR code on the guest&apos;s invitation.
      </p>
      <button
        type="submit"
        disabled={disabled || !code.trim()}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-navy text-base font-semibold text-white disabled:opacity-50"
      >
        Verify code
      </button>
    </form>
  );
}

/**
 * Search invitations by guest name (GET /checkin/search?q=&eventId=). `showEventStatus` marks
 * guests who are not on the list for the chosen event (when the celebration has several).
 */
export function NameSearch({
  onVerify,
  disabled,
  eventId,
  showEventStatus = false,
}: {
  onVerify: (value: string) => void;
  disabled?: boolean;
  eventId?: string;
  showEventStatus?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQ(draft.trim()), 300);
    return () => window.clearTimeout(t);
  }, [draft]);

  const results = useQuery({
    queryKey: [...adminKeys.checkinOverview, 'search', eventId ?? null, q],
    queryFn: ({ signal }) => api.get<CheckInSearchResult[]>('/checkin/search', eventId ? { q, eventId } : { q }, signal),
    enabled: q.length >= 2,
    staleTime: 10_000,
  });

  return (
    <div>
      <label htmlFor="checkin-search" className="block text-[13px] font-medium text-navy">
        Guest name
      </label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="checkin-search"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          placeholder="Type at least 2 letters"
          className={cn(bigInput, 'pl-11')}
        />
      </div>
      <div aria-live="polite" className="mt-3">
        {q.length < 2 ? null : results.isLoading ? (
          <p className="text-sm text-muted">Searching…</p>
        ) : results.error ? (
          <p role="alert" className="text-sm text-error">
            {errorMessage(results.error)}
          </p>
        ) : results.data && results.data.length === 0 ? (
          <p className="text-sm text-muted">No invitations match “{q}”.</p>
        ) : (
          <ul className="space-y-2" aria-label="Matching invitations">
            {results.data?.map((r) => (
              <li key={r.invitationId}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onVerify(r.code)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-navy/10 bg-white px-3 py-2 text-left hover:border-gold disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-navy">{r.guestName}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span className="font-mono">{r.code}</span>
                      {r.categoryName && <span>{r.categoryName}</span>}
                      <span className="inline-flex items-center gap-0.5">
                        <Users className="size-3" aria-hidden /> {r.partySize}
                      </span>
                    </span>
                  </span>
                  {r.status === 'REVOKED' ? (
                    <Badge tone="danger">Revoked</Badge>
                  ) : showEventStatus && !r.forThisEvent ? (
                    <Badge tone="neutral">Not on this list</Badge>
                  ) : r.checkedIn ? (
                    <Badge tone="warning">Checked in</Badge>
                  ) : (
                    <span className="text-[13px] font-medium text-emerald">Verify</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
