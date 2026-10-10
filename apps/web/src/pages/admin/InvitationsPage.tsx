import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, ExternalLink, Info, MailPlus, RotateCcw, Send, UserRound } from 'lucide-react';
import type { AdminGuestDetail, AdminGuestListItem, InvitationStatus, SendInvitationsRequest, SendInvitationsResult } from '@birthday/types';
import { api, errorMessage } from '@/lib/api';
import { adminKeys, affects, useAdminMutation } from '@/lib/admin-api';
import { DEFAULT_INVITATION_PARAMS, invitationListQuery } from '@/lib/admin-queries';
import { StatusBadge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/utils';
import { AButton, BulkBar, FilterBar, FilterTabs, IconButton, PageHeader, SearchInput, adminButton } from '@/components/admin/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { Confirm, ReasonDialog } from '@/components/admin/overlays';
import { DateCell, useScrollToHash } from '@/components/admin/misc';
import { RsvpBadge } from '@/components/admin/guests/shared';
import { CheckInLog } from '@/components/admin/guests/CheckInLog';
import { ActionGuide } from '@/components/admin/action-guide';
import { INVITATION_ACTIONS } from '@/components/admin/action-guide-content';

type StatusFilter = 'ALL' | InvitationStatus;
type Action = 'resend' | 'revoke' | 'reinstate';

const SUCCESS: Record<Action, string> = {
  resend: 'Invitation sent',
  revoke: 'Invitation revoked',
  reinstate: 'Invitation reinstated',
};

const sentDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Not sent yet", or "Sent 20 Sep 2026" with how long ago underneath. */
function SendStatus({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="whitespace-nowrap font-medium text-[#8a5c12]">Not sent yet</span>;
  return (
    <span className="flex flex-col">
      <time dateTime={iso} title={new Date(iso).toLocaleString()} className="whitespace-nowrap text-charcoal">
        Sent {sentDate.format(new Date(iso))}
      </time>
      <span className="whitespace-nowrap text-xs text-muted">{formatRelative(iso)}</span>
    </span>
  );
}

type BulkSend = { kind: 'selected'; guestIds: string[] } | { kind: 'unsent' };

function sendSummary(r: SendInvitationsResult): string {
  const parts = [`${r.sent} sent`];
  if (r.skipped) parts.push(`${r.skipped} skipped (declined or revoked)`);
  if (r.failed) parts.push(`${r.failed} failed`);
  return parts.join(' · ');
}

function InvitationsExplainer() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-navy/10 bg-white px-4 py-3 text-[13px] leading-relaxed text-charcoal">
      <Info className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
      <div>
        <p className="font-medium text-navy">How invitations are sent</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            When a guest RSVPs as attending on the website, their invitation and QR code are created and emailed to them automatically.
          </li>
          <li>
            When you add a guest yourself, the invitation is created straight away and emailed only if you tick &ldquo;Send invitation now&rdquo;.
          </li>
          <li>You can send or re-send an invitation at any time, here or from the guest&rsquo;s details.</li>
          <li>Every invitation has its own personal link and QR code, which is scanned at the door.</li>
        </ul>
      </div>
    </div>
  );
}

export default function InvitationsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [q, setQ] = useState(DEFAULT_INVITATION_PARAMS.q);
  const [page, setPage] = useState(DEFAULT_INVITATION_PARAMS.page);
  const [pageSize, setPageSize] = useState(DEFAULT_INVITATION_PARAMS.pageSize);
  const [revoking, setRevoking] = useState<AdminGuestListItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkSend | null>(null);

  const params = { status: status === 'ALL' ? undefined : status, q, page, pageSize };
  const list = useQuery({ ...invitationListQuery(params), placeholderData: keepPreviousData });

  useScrollToHash(list.isSuccess);

  const act = useAdminMutation<AdminGuestDetail, { guest: AdminGuestListItem; action: Action; reason?: string }>({
    mutationFn: ({ guest, action, reason }) =>
      api.post<AdminGuestDetail>(`/admin/guests/${guest.id}/invitation/${action}`, action === 'revoke' ? (reason ? { reason } : {}) : undefined),
    invalidate: affects.guests,
    success: (_d, { action, guest }) => `${SUCCESS[action]} · ${guest.fullName}`,
    onSuccess: (detail) => {
      queryClient.setQueryData(adminKeys.guest(detail.id), detail);
      setRevoking(null);
    },
  });
  const sendMany = useAdminMutation<SendInvitationsResult, SendInvitationsRequest>({
    mutationFn: (body) => api.post<SendInvitationsResult>('/admin/invitations/send', body),
    invalidate: [adminKeys.invitations, adminKeys.guests, adminKeys.dashboard],
    success: false,
    onSuccess: (result) => {
      setBulk(null);
      setSelected(new Set());
      if (!result.emailEnabled) {
        toast.warning(`${sendSummary(result)}. Email is not set up on the server, so nothing was actually emailed.`);
      } else if (result.failed > 0) {
        toast.error(`${sendSummary(result)}. Some emails could not be sent; try those guests again later.`);
      } else if (result.sent === 0) {
        toast.success(`Nothing to send · ${sendSummary(result)}`);
      } else {
        toast.success(`${result.sent === 1 ? 'Invitation' : 'Invitations'} emailed · ${sendSummary(result)}`);
      }
    },
  });

  const pendingFor = (id: string, action: Action) => act.isPending && act.variables?.guest.id === id && act.variables.action === action;

  /** Opens the guest's invitation page. The tab opens synchronously so popup blockers allow it. */
  const openInvitation = async (guest: AdminGuestListItem) => {
    const win = window.open('', '_blank');
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: adminKeys.guest(guest.id),
        queryFn: ({ signal }) => api.get<AdminGuestDetail>(`/admin/guests/${guest.id}`, undefined, signal),
        staleTime: 30_000,
      });
      const token = detail.invitationDetail?.token;
      if (!token) {
        win?.close();
        toast.error(`${guest.fullName} has no invitation link.`);
        return;
      }
      const url = `/invitation/${encodeURIComponent(token)}`;
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (error) {
      win?.close();
      toast.error(errorMessage(error));
    }
  };

  const changeFilter = (next: Partial<{ status: StatusFilter; q: string }>) => {
    if (next.status !== undefined) setStatus(next.status);
    if (next.q !== undefined) setQ(next.q);
    setPage(1);
  };

  const actions = (g: AdminGuestListItem, labelled = false) => {
    const inv = g.invitation;
    const size = labelled ? 'sm' : undefined;
    return (
      <div className={labelled ? 'flex flex-wrap gap-2' : 'flex items-center justify-end gap-0.5'}>
        {inv?.status === 'ACTIVE' && (
          <>
            {labelled ? (
              <AButton size={size} variant="emerald" loading={pendingFor(g.id, 'resend')} onClick={() => act.mutate({ guest: g, action: 'resend' })}>
                <Send aria-hidden /> {inv.lastSentAt ? 'Resend' : 'Send'}
              </AButton>
            ) : (
              <IconButton
                label={`${inv.lastSentAt ? 'Resend' : 'Send'} invitation to ${g.fullName}`}
                loading={pendingFor(g.id, 'resend')}
                onClick={() => act.mutate({ guest: g, action: 'resend' })}
              >
                <Send aria-hidden />
              </IconButton>
            )}
            {labelled ? (
              <AButton size={size} variant="danger-ghost" onClick={() => setRevoking(g)}>
                <Ban aria-hidden /> Revoke
              </AButton>
            ) : (
              <IconButton label={`Revoke invitation for ${g.fullName}`} variant="danger-ghost" onClick={() => setRevoking(g)}>
                <Ban aria-hidden />
              </IconButton>
            )}
          </>
        )}
        {inv?.status === 'REVOKED' &&
          (labelled ? (
            <AButton size={size} variant="emerald" loading={pendingFor(g.id, 'reinstate')} onClick={() => act.mutate({ guest: g, action: 'reinstate' })}>
              <RotateCcw aria-hidden /> Reinstate
            </AButton>
          ) : (
            <IconButton
              label={`Reinstate invitation for ${g.fullName}`}
              loading={pendingFor(g.id, 'reinstate')}
              onClick={() => act.mutate({ guest: g, action: 'reinstate' })}
            >
              <RotateCcw aria-hidden />
            </IconButton>
          ))}
        {labelled ? (
          <AButton size={size} onClick={() => openInvitation(g)}>
            <ExternalLink aria-hidden /> Open invitation
          </AButton>
        ) : (
          <IconButton label={`Open ${g.fullName}’s invitation in a new tab`} onClick={() => openInvitation(g)}>
            <ExternalLink aria-hidden />
          </IconButton>
        )}
        <Link
          to={`/admin/guests?guest=${encodeURIComponent(g.id)}`}
          className={adminButton({ variant: 'ghost', size: labelled ? 'sm' : 'icon' })}
          aria-label={labelled ? undefined : `View guest ${g.fullName}`}
          title={labelled ? undefined : 'View guest'}
        >
          <UserRound aria-hidden />
          {labelled && 'View guest'}
        </Link>
      </div>
    );
  };

  const columns: Column<AdminGuestListItem>[] = [
    { id: 'guest', header: 'Guest', cell: (g) => <span className="font-medium text-navy">{g.fullName}</span> },
    { id: 'email', header: 'Email', hideBelow: 'lg', cell: (g) => <span className="break-all">{g.email}</span> },
    { id: 'code', header: 'Code', cell: (g) => <span className="font-mono text-xs tracking-wide">{g.invitation?.code ?? '—'}</span> },
    { id: 'status', header: 'Status', cell: (g) => (g.invitation ? <StatusBadge status={g.invitation.status} /> : '—') },
    { id: 'sent', header: 'Sent', cell: (g) => (g.invitation ? <SendStatus iso={g.invitation.lastSentAt} /> : '—') },
    { id: 'rsvp', header: 'RSVP', hideBelow: 'lg', cell: (g) => <RsvpBadge response={g.rsvpResponse} /> },
    {
      id: 'checkedIn',
      header: 'Checked in',
      hideBelow: 'xl',
      cell: (g) => (g.checkedInAt ? <DateCell iso={g.checkedInAt} /> : <span className="text-muted">—</span>),
    },
    { id: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (g) => actions(g) },
  ];

  return (
    <>
      <PageHeader
        title="Invitations"
        description="Personal invitation links and QR passes, and the log of arrivals at the door."
        actions={
          <AButton variant="emerald" onClick={() => setBulk({ kind: 'unsent' })}>
            <MailPlus aria-hidden /> Send to everyone not yet sent
          </AButton>
        }
      />
      <ActionGuide page="invitations" rows={INVITATION_ACTIONS} />
      <InvitationsExplainer />

      <section aria-labelledby="invitations-heading" className="mb-8">
        <h2 id="invitations-heading" className="sr-only">
          Invitations
        </h2>
        <FilterBar className="justify-between">
          <FilterTabs<StatusFilter>
            label="Invitation status"
            value={status}
            onChange={(value) => changeFilter({ status: value })}
            tabs={[
              { value: 'ALL', label: 'All' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'REVOKED', label: 'Revoked' },
            ]}
          />
          <SearchInput value={q} onChange={(value) => changeFilter({ q: value })} placeholder="Name, email or code" label="Search invitations" />
        </FilterBar>

        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <AButton size="sm" variant="emerald" onClick={() => setBulk({ kind: 'selected', guestIds: [...selected] })}>
            <Send aria-hidden /> Send to selected
          </AButton>
        </BulkBar>

        <DataTable
          caption="Invitations"
          columns={columns}
          rows={list.data?.items}
          getRowId={(g) => g.id}
          selected={selected}
          onSelectedChange={setSelected}
          rowLabel={(g) => g.fullName}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          emptyTitle={q || status !== 'ALL' ? 'No invitations match' : 'No invitations yet'}
          emptyDescription={q || status !== 'ALL' ? undefined : 'Invitations are created when you add a guest or a guest registers.'}
          rowClassName={(g) => (g.invitation?.status === 'REVOKED' ? 'bg-error/[0.02]' : undefined)}
          mobileCard={(g) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-navy">{g.fullName}</p>
                  <p className="truncate text-xs text-muted">{g.email}</p>
                </div>
                {g.invitation && <StatusBadge status={g.invitation.status} />}
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="font-mono text-charcoal">{g.invitation?.code}</span>
                <span>{g.invitation?.lastSentAt ? `Sent ${sentDate.format(new Date(g.invitation.lastSentAt))}` : 'Not sent yet'}</span>
                <RsvpBadge response={g.rsvpResponse} />
              </p>
              {actions(g, true)}
            </div>
          )}
        />
        {list.data && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </section>

      <CheckInLog />

      <Confirm
        open={bulk !== null}
        onOpenChange={(open) => !open && setBulk(null)}
        tone="primary"
        title={
          bulk?.kind === 'selected'
            ? `Email ${bulk.guestIds.length} ${bulk.guestIds.length === 1 ? 'invitation' : 'invitations'}?`
            : 'Email every invitation not sent yet?'
        }
        description={
          bulk?.kind === 'selected' ? (
            <>
              Each selected guest gets an email with their personal link and QR code. Guests who have already been sent one get it again. Guests who
              declined, and revoked invitations, are skipped.
            </>
          ) : (
            <>
              Every active invitation that has never been emailed is sent now (up to 500 at a time). Guests who declined, and revoked invitations, are
              skipped.
            </>
          )
        }
        confirmLabel="Send emails"
        loading={sendMany.isPending}
        onConfirm={() => bulk && sendMany.mutate(bulk.kind === 'selected' ? { guestIds: bulk.guestIds } : { onlyUnsent: true })}
      />

      <ReasonDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.fullName ?? 'this guest'}’s invitation?`}
        description="Their link and QR code stop working at the door until you reinstate it."
        label="Reason (optional)"
        maxLength={300}
        placeholder="e.g. Invitation sent to the wrong person"
        confirmLabel="Revoke"
        loading={act.isPending && act.variables?.action === 'revoke'}
        onConfirm={(reason) => revoking && act.mutate({ guest: revoking, action: 'revoke', reason: reason || undefined })}
      />
    </>
  );
}
