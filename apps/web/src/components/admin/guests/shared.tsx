import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { AdminGuestListItem, RsvpResponse } from '@birthday/types';
import { categoriesQuery } from '@/lib/admin-queries';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/utils';
import { ACheckbox } from '../ui';

export function useGuestCategories() {
  return useQuery(categoriesQuery);
}

/** Category name with its colour dot (the name always carries the meaning). */
export function CategoryLabel({ name, color }: { name: string | null; color?: string | null }) {
  if (!name) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {color && <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} aria-hidden />}
      {name}
    </span>
  );
}

export function RsvpBadge({ response }: { response: RsvpResponse | null }) {
  if (!response) return <Badge tone="neutral" className="text-muted">No reply</Badge>;
  return <StatusBadge status={response} />;
}

export function InvitationCell({ invitation }: { invitation: AdminGuestListItem['invitation'] }) {
  if (!invitation) return <span className="text-muted">No invitation</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StatusBadge status={invitation.status} />
      <span className="whitespace-nowrap text-xs text-muted">
        {invitation.lastSentAt ? `sent ${formatRelative(invitation.lastSentAt)}` : 'Never sent'}
      </span>
    </span>
  );
}

/** Inline warning shown when the API answers EVENT_CAPACITY_REACHED or CATEGORY_CAPACITY_REACHED, with the audited override. */
export function CapacityOverride({
  message,
  checked,
  onCheckedChange,
}: {
  message: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px]">
      <p className="flex items-start gap-2 font-medium text-[#8a5c12]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {message}
      </p>
      <div className="mt-2 flex items-start gap-2 pl-6">
        <ACheckbox id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
        <label htmlFor={id} className="text-charcoal">
          Override capacity (this will be recorded in the audit log)
        </label>
      </div>
    </div>
  );
}
