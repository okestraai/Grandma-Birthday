import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Check, Copy, ExternalLink, Pencil, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react';
import type { AdminEvent, AdminGuestDetail, RevokeInvitationRequest, UpdateGuestRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, affects, useAdminMutation } from '@/lib/admin-api';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { QRCodeCard } from '@/components/ui/qr-code-card';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { AButton, ACheckbox, DetailList } from '../ui';
import { Confirm, Drawer, ReasonDialog } from '../overlays';
import { CategoryLabel, RsvpBadge, coveredByCategory, useEvents, useGuestCategories } from './shared';
import { GuestFormDialog } from './GuestFormDialog';

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-t border-navy/[0.08] pt-4 first:border-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** POST /admin/guests/:id/invitation/<action>; the response replaces the cached detail. */
function useInvitationAction(guestId: string | null, action: 'resend' | 'revoke' | 'reinstate' | 'regenerate', success: string, onDone: () => void) {
  const queryClient = useQueryClient();
  return useAdminMutation<AdminGuestDetail, RevokeInvitationRequest | void>({
    mutationFn: (body) => api.post<AdminGuestDetail>(`/admin/guests/${guestId}/invitation/${action}`, body ?? undefined),
    invalidate: affects.guests,
    success,
    onSuccess: (data) => {
      queryClient.setQueryData(adminKeys.guest(data.id), data);
      onDone();
    },
  });
}

/**
 * Events the guest is invited to by category, and the others an admin may add them to
 * (PUT /admin/guests/:id { extraEventIds }, which replaces the list).
 */
function ExtraEvents({ guest, events }: { guest: AdminGuestDetail; events: AdminEvent[] }) {
  const queryClient = useQueryClient();
  const [extra, setExtra] = useState<string[]>(guest.extraEventIds);

  const byCategory = events.filter((e) => coveredByCategory(e, guest.categoryId));
  const others = events.filter((e) => !coveredByCategory(e, guest.categoryId));
  const dirty = extra.length !== guest.extraEventIds.length || extra.some((id) => !guest.extraEventIds.includes(id));

  const save = useAdminMutation<AdminGuestDetail, UpdateGuestRequest>({
    mutationFn: (body) => api.put<AdminGuestDetail>(`/admin/guests/${guest.id}`, body),
    invalidate: affects.guests,
    success: 'Invited events saved',
    onSuccess: (data) => queryClient.setQueryData(adminKeys.guest(data.id), data),
  });

  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-charcoal">
        <span className="text-muted">By category: </span>
        {byCategory.length ? byCategory.map((e) => e.name).join(', ') : 'none'}
      </p>
      {others.length > 0 && (
        <fieldset>
          <legend className="mb-1 font-medium text-navy">Also invited to</legend>
          <ul className="space-y-0.5">
            {others.map((e) => {
              const id = `extra-${e.id}`;
              return (
                <li key={e.id} className="flex min-h-10 items-center gap-2.5 md:min-h-8">
                  <ACheckbox
                    id={id}
                    checked={extra.includes(e.id)}
                    onCheckedChange={(on) => setExtra((list) => (on ? [...list, e.id] : list.filter((x) => x !== e.id)))}
                  />
                  <label htmlFor={id} className="text-charcoal">
                    {e.name}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AButton size="sm" variant="emerald" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ extraEventIds: extra })}>
              Save invited events
            </AButton>
            {dirty && (
              <AButton size="sm" variant="ghost" onClick={() => setExtra(guest.extraEventIds)}>
                Undo
              </AButton>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Ticked events are offered to this guest on their RSVP, even though their category is not invited.</p>
        </fieldset>
      )}
    </div>
  );
}

type Dialog = 'edit' | 'revoke' | 'regenerate' | 'delete' | null;

export function GuestDetailDrawer({ guestId, onClose }: { guestId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const categories = useGuestCategories();
  const events = useEvents();
  const multiple = (events.data?.length ?? 0) > 1;
  const eventName = (id: string) => events.data?.find((e) => e.id === id)?.name ?? 'Event';
  const [dialog, setDialog] = useState<Dialog>(null);

  const query = useQuery({
    queryKey: adminKeys.guest(guestId ?? ''),
    queryFn: ({ signal }) => api.get<AdminGuestDetail>(`/admin/guests/${guestId}`, undefined, signal),
    enabled: !!guestId,
  });
  const guest = query.data;

  const done = () => setDialog(null);
  const resend = useInvitationAction(guestId, 'resend', 'Invitation sent', done);
  const revoke = useInvitationAction(guestId, 'revoke', 'Invitation revoked', done);
  const reinstate = useInvitationAction(guestId, 'reinstate', 'Invitation reinstated', done);
  const regenerate = useInvitationAction(guestId, 'regenerate', 'New link created. The old link and QR code no longer work.', done);

  const remove = useAdminMutation<void, string>({
    mutationFn: (id) => api.delete(`/admin/guests/${id}`),
    invalidate: affects.guests,
    success: 'Guest deleted',
    onSuccess: (_d, id) => {
      setDialog(null);
      queryClient.removeQueries({ queryKey: adminKeys.guest(id) });
      onClose();
    },
  });

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Invitation link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };

  const category = guest?.categoryId ? categories.data?.find((c) => c.id === guest.categoryId) : undefined;
  const inv = guest?.invitationDetail ?? null;
  const token = inv?.token;

  return (
    <>
      <Drawer
        open={!!guestId}
        onOpenChange={(open) => !open && onClose()}
        title={guest?.fullName ?? 'Guest'}
        description={guest ? guest.email : undefined}
        width="max-w-2xl"
        footer={
          guest && (
            <>
              <AButton variant="danger-ghost" className="mr-auto" onClick={() => setDialog('delete')}>
                <Trash2 aria-hidden /> Delete guest
              </AButton>
              <AButton onClick={() => setDialog('edit')}>
                <Pencil aria-hidden /> Edit
              </AButton>
            </>
          )
        }
      >
        {query.isLoading && (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-navy/[0.06]" />
            ))}
          </div>
        )}
        {query.error && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {guest && (
          <div className="space-y-5">
            <Section title="Contact">
              <DetailList
                items={[
                  { label: 'Email', value: <a className="underline underline-offset-2" href={`mailto:${guest.email}`}>{guest.email}</a> },
                  { label: 'Phone', value: guest.phone ? <a className="underline underline-offset-2" href={`tel:${guest.phone}`}>{guest.phone}</a> : null },
                  { label: 'Category', value: <CategoryLabel name={guest.categoryName} color={category?.color} /> },
                  { label: 'Companions allowed', value: guest.allowedCompanions },
                  { label: 'Source', value: guest.source === 'ADMIN_INVITED' ? 'Invited by an admin' : 'Registered on the website' },
                  { label: 'Registered', value: formatDateTime(guest.createdAt) },
                  { label: 'Notes', value: guest.notes ? <span className="whitespace-pre-line">{guest.notes}</span> : null },
                ]}
              />
            </Section>

            <Section title="RSVP">
              {guest.rsvp ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <RsvpBadge response={guest.rsvp.response} />
                    {guest.rsvp.response === 'ATTENDING' && (
                      <span className="text-muted">
                        Party of {guest.partySize} ({guest.companionCount} companion{guest.companionCount === 1 ? '' : 's'})
                      </span>
                    )}
                  </div>
                  <DetailList
                    items={[
                      ...(multiple && guest.rsvp.response === 'ATTENDING'
                        ? [
                            {
                              label: 'Events',
                              value: guest.events.length ? (
                                <ul className="space-y-0.5">
                                  {guest.events.map((e) => (
                                    <li key={e.eventId}>
                                      {eventName(e.eventId)}
                                      <span className="text-muted">
                                        {' '}
                                        · party of {1 + e.companionCount}
                                        {e.companionCount > 0 && ` (${e.companionCount} companion${e.companionCount === 1 ? '' : 's'})`}
                                      </span>
                                      {e.checkedIn && (
                                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-success">
                                          <Check className="size-3" aria-hidden /> checked in
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                'None chosen'
                              ),
                            },
                          ]
                        : []),
                      {
                        label: 'Companions',
                        value: guest.rsvp.companions.length ? (
                          <ul className="space-y-0.5">
                            {guest.rsvp.companions.map((c) => (
                              <li key={c.id}>
                                {c.fullName}
                                {c.dietary && <span className="text-muted"> · {c.dietary}</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          'None'
                        ),
                      },
                      { label: 'Dietary', value: guest.rsvp.dietary },
                      { label: 'Accessibility', value: guest.rsvp.accessibility },
                      { label: 'Message', value: guest.rsvp.message ? <span className="whitespace-pre-line">{guest.rsvp.message}</span> : null },
                      ...guest.rsvp.answers.map((a) => ({
                        label: a.label,
                        value: typeof a.value === 'boolean' ? (a.value ? 'Yes' : 'No') : a.value || null,
                      })),
                      { label: 'Submitted', value: formatDateTime(guest.rsvp.submittedAt) },
                      ...(guest.rsvp.updatedAt !== guest.rsvp.submittedAt ? [{ label: 'Updated', value: formatDateTime(guest.rsvp.updatedAt) }] : []),
                    ]}
                  />
                </div>
              ) : (
                <p className="text-muted">No reply yet.</p>
              )}
            </Section>

            {multiple && events.data && (
              <Section title="Invited events">
                {/* Keyed on the saved list so a save (or another admin's) starts from the new list. */}
                <ExtraEvents key={`${guest.id}:${guest.extraEventIds.join(',')}`} guest={guest} events={events.data} />
              </Section>
            )}

            <Section
              title="Invitation"
              actions={
                inv && (
                  <div className="flex flex-wrap gap-1.5">
                    {inv.status === 'ACTIVE' ? (
                      <>
                        <AButton size="sm" variant="emerald" loading={resend.isPending} onClick={() => resend.mutate()}>
                          <Send aria-hidden /> {inv.sendCount > 0 ? 'Resend' : 'Send'}
                        </AButton>
                        <AButton size="sm" onClick={() => setDialog('regenerate')}>
                          <RefreshCw aria-hidden /> Regenerate link
                        </AButton>
                        <AButton size="sm" variant="danger-ghost" onClick={() => setDialog('revoke')}>
                          <Ban aria-hidden /> Revoke
                        </AButton>
                      </>
                    ) : (
                      <AButton size="sm" variant="emerald" loading={reinstate.isPending} onClick={() => reinstate.mutate()}>
                        <RotateCcw aria-hidden /> Reinstate
                      </AButton>
                    )}
                  </div>
                )
              }
            >
              {inv ? (
                <div className="space-y-4">
                  <DetailList
                    items={[
                      { label: 'Code', value: <span className="font-mono tracking-wide">{inv.code}</span> },
                      { label: 'Status', value: <StatusBadge status={inv.status} /> },
                      {
                        label: 'Link',
                        value: (
                          <div className="space-y-1.5">
                            <p className="break-all font-mono text-xs">{inv.url}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <AButton size="xs" onClick={() => copyLink(inv.url)}>
                                <Copy aria-hidden /> Copy
                              </AButton>
                              <AButton size="xs" asChild>
                                <a href={`/invitation/${inv.token}`} target="_blank" rel="noopener">
                                  <ExternalLink aria-hidden /> Open invitation
                                </a>
                              </AButton>
                            </div>
                          </div>
                        ),
                      },
                      {
                        label: 'Sent',
                        value: inv.lastSentAt
                          ? `${inv.sendCount} time${inv.sendCount === 1 ? '' : 's'}, last ${formatRelative(inv.lastSentAt)}`
                          : 'Never sent',
                      },
                      ...(inv.status === 'REVOKED'
                        ? [
                            {
                              label: 'Revoked',
                              value: `${inv.revokedAt ? formatDateTime(inv.revokedAt) : ''}${inv.revokedReason ? ` · ${inv.revokedReason}` : ''}` || 'Yes',
                            },
                          ]
                        : []),
                    ]}
                  />
                  {token && (
                    <div className="flex justify-center">
                      <QRCodeCard
                        svgUrl={`/api/invitations/${token}/qr.svg`}
                        pngUrl={`/api/invitations/${token}/qr.png`}
                        pdfUrl={`/api/invitations/${token}/pass.pdf`}
                        caption={inv.code}
                        alt={`Invitation QR code for ${guest.fullName}`}
                        size={160}
                      />
                    </div>
                  )}
                  {inv.status === 'REVOKED' && <p className="text-center text-xs text-error">This QR code will not be accepted at the door while revoked.</p>}
                </div>
              ) : (
                <p className="text-muted">This guest has no invitation yet.</p>
              )}
            </Section>

            <Section title="Check-in history">
              {guest.checkIns.length === 0 ? (
                <p className="text-muted">Not checked in.</p>
              ) : (
                <ul className="space-y-2">
                  {guest.checkIns.map((c) => (
                    <li key={c.id} className="rounded-lg border border-navy/10 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={c.reversedAt ? 'text-muted line-through' : 'font-medium text-navy'}>
                          {multiple && `${c.eventName} · `}
                          {formatDateTime(c.checkedInAt)} · party of {c.partySize}
                        </span>
                        {c.reversedAt ? <Badge tone="danger">Reversed</Badge> : <Badge tone="success">Checked in</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">By {c.checkedInByName ?? 'unknown'}</p>
                      {c.reversedAt && (
                        <p className="mt-0.5 text-xs text-muted">
                          Reversed {formatDateTime(c.reversedAt)}
                          {c.reversedByName && ` by ${c.reversedByName}`}
                          {c.reverseReason && `: ${c.reverseReason}`}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </Drawer>

      <GuestFormDialog open={dialog === 'edit'} onOpenChange={(open) => !open && setDialog(null)} guest={guest} />

      <ReasonDialog
        open={dialog === 'revoke'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Revoke invitation?"
        description="The guest’s link and QR code stop working until you reinstate the invitation."
        confirmLabel="Revoke"
        label="Reason (optional)"
        maxLength={300}
        placeholder="e.g. Invitation sent to the wrong person"
        loading={revoke.isPending}
        onConfirm={(reason) => revoke.mutate(reason ? { reason } : {})}
      />

      <Confirm
        open={dialog === 'regenerate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Regenerate the invitation link?"
        description="The old link and QR code will stop working immediately. Send the invitation again so the guest has the new one."
        confirmLabel="Regenerate"
        loading={regenerate.isPending}
        onConfirm={() => regenerate.mutate()}
      />

      <Confirm
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Delete this guest?"
        description={
          <>
            <strong>{guest?.fullName}</strong>, their RSVP, invitation and check-in history will be removed. Their QR code will stop working.
          </>
        }
        confirmLabel="Delete guest"
        loading={remove.isPending}
        onConfirm={() => guest && remove.mutate(guest.id)}
      />
    </>
  );
}
