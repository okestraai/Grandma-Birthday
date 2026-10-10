import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import type { AdminFamilyMember } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, useAdminMutation } from '@/lib/admin-api';
import { familyQuery } from '@/lib/admin-queries';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { AButton, IconButton, PageHeader, Panel } from '@/components/admin/ui';
import { MediaThumb } from '@/components/admin/media';
import { Confirm } from '@/components/admin/overlays';
import { FamilyMemberDialog } from '@/components/admin/family/FamilyMemberDialog';
import { RelationshipsPanel } from '@/components/admin/family/RelationshipsPanel';
import { buildFamilyOutline, generationName, lifeYears, unitLabel, type OutlineNode } from '@/components/admin/family/family-utils';

type DialogState = { member: AdminFamilyMember | null; parentIds?: string[]; withSpouse?: boolean } | null;

export default function FamilyAdminPage() {
  const query = useQuery(familyQuery);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<AdminFamilyMember | null>(null);

  const members = query.data?.members;
  const relationships = query.data?.relationships ?? [];
  const outline = useMemo(() => (members ? buildFamilyOutline(members) : { roots: [], unlinked: [] }), [members]);
  const celebrant = members?.find((m) => m.isCelebrant);
  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  const linkCount = (id: string) => relationships.filter((r) => r.fromId === id || r.toId === id).length;
  const deletingSpouse = deleting?.spouseId ? byId.get(deleting.spouseId) : undefined;

  const remove = useAdminMutation<void, AdminFamilyMember>({
    mutationFn: (m) => api.delete(`/admin/family/${m.id}`),
    invalidate: [adminKeys.family],
    success: (_d, m) => `${m.fullName} was removed from the family tree.`,
    onSuccess: () => setDeleting(null),
  });

  const addButton = (
    <AButton variant="emerald" onClick={() => setDialog({ member: null })}>
      <Plus aria-hidden /> Add person
    </AButton>
  );

  const person = (m: AdminFamilyMember) => (
    <div className="flex min-w-0 items-center gap-2">
      <MediaThumb media={m.photo} className="size-9 shrink-0 rounded-full" alt={m.photo ? m.fullName : ''} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1 text-[13px] font-medium text-navy">
          {m.fullName}
          {m.marriedIn && <span className="rounded-full bg-navy/[0.06] px-1.5 text-[10px] font-normal text-muted">married in</span>}
          {m.isCelebrant && <Badge tone="gold">Celebrant</Badge>}
          {!m.isPublished && <Badge>Hidden</Badge>}
        </p>
        <p className="truncate text-xs text-muted">
          {m.relationshipLabel}
          {lifeYears(m) && <span className="tabular-nums"> · {lifeYears(m)}</span>}
        </p>
      </div>
    </div>
  );

  const row = (node: OutlineNode): ReactNode => {
    const [primary, partner] = node.unit.members;
    const label = unitLabel(node.unit);
    if (node.repeat) {
      return (
        <li key={`${node.unit.key}-repeat`} className="py-1 text-[13px] text-muted">
          {label} <span className="text-xs">(shown above)</span>
        </li>
      );
    }
    return (
      <li key={node.unit.key}>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy/[0.08] bg-white p-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            {person(primary)}
            {partner && (
              <>
                <span className="text-xs text-muted" aria-hidden>
                  &amp;
                </span>
                {person(partner)}
              </>
            )}
            <span className="text-[11px] text-muted">{generationName(primary.generation)}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-0.5">
            <IconButton label={`Edit ${primary.fullName}`} onClick={() => setDialog({ member: primary })}>
              <Pencil aria-hidden />
            </IconButton>
            {partner && !partner.marriedIn && (
              <IconButton label={`Edit ${partner.fullName}`} onClick={() => setDialog({ member: partner })}>
                <Pencil aria-hidden />
              </IconButton>
            )}
            <AButton size="xs" variant="ghost" aria-label={`Add child of ${label}`} onClick={() => setDialog({ member: null, parentIds: node.unit.members.map((m) => m.id) })}>
              <UserPlus aria-hidden /> Add child
            </AButton>
            {!partner && (
              <AButton size="xs" variant="ghost" aria-label={`Add spouse for ${primary.fullName}`} onClick={() => setDialog({ member: primary, withSpouse: true })}>
                <Heart aria-hidden /> Add spouse
              </AButton>
            )}
            <IconButton label={`Delete ${primary.fullName}`} variant="danger-ghost" onClick={() => setDeleting(primary)}>
              <Trash2 aria-hidden />
            </IconButton>
            {partner && !partner.marriedIn && (
              <IconButton label={`Delete ${partner.fullName}`} variant="danger-ghost" onClick={() => setDeleting(partner)}>
                <Trash2 aria-hidden />
              </IconButton>
            )}
          </div>
        </div>
        {node.children.length > 0 && (
          <ul className="ml-3 mt-1.5 space-y-1.5 border-l border-gold/60 pl-3" aria-label={`Children of ${label}`}>
            {node.children.map(row)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Family tree"
        description="Start with the celebrant’s parents, then add children under each family. A spouse is added from the person they married."
        actions={addButton}
      />

      {query.isPending ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-96" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : members!.length === 0 ? (
        <EmptyState
          className="bg-white"
          icon={<Users className="size-7" />}
          title="No family members yet"
          description="Start with the celebrant’s parents (or the celebrant), then add children under them."
          action={addButton}
        />
      ) : (
        <div className="space-y-4">
          <Panel title="Family" id="family-outline" description="Each row is a person and their spouse. Children are listed under their parents." bodyClassName="p-2 sm:p-3">
            {!celebrant && <p className="mb-2 text-xs text-warning">No one is marked as the celebrant yet.</p>}
            {outline.roots.length > 0 ? (
              <ul className="space-y-1.5">{outline.roots.map(row)}</ul>
            ) : (
              <p className="text-[13px] text-muted">No one is linked yet. Use “Add child” or “Add spouse” to connect people.</p>
            )}
            {outline.unlinked.length > 0 && (
              <div className="mt-4 border-t border-navy/[0.08] pt-3">
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Not linked yet ({outline.unlinked.length})</h3>
                <ul className="space-y-1.5">{outline.unlinked.map((m) => row({ unit: { key: m.id, members: [m] }, children: [] }))}</ul>
              </div>
            )}
          </Panel>

          <details className="group rounded-xl border border-navy/10 bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-navy">Advanced: edit links directly</summary>
            <div className="border-t border-navy/[0.08] p-2">
              <RelationshipsPanel members={members!} relationships={relationships} />
            </div>
          </details>
        </div>
      )}

      {dialog && members && (
        <FamilyMemberDialog
          member={dialog.member}
          members={members}
          existingCelebrant={celebrant}
          initialParentIds={dialog.parentIds}
          startWithSpouse={dialog.withSpouse}
          onClose={() => setDialog(null)}
        />
      )}

      <Confirm
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.fullName ?? 'this person'}?`}
        description={
          deleting && (
            <>
              <p>
                <strong>{deleting.fullName}</strong> will be removed from the family tree.
              </p>
              {deletingSpouse?.marriedIn && (
                <p className="mt-2">
                  Their spouse <strong>{deletingSpouse.fullName}</strong>, who joined the family by marriage, will be removed too. Their children
                  stay in the tree.
                </p>
              )}
              <p className="mt-2">
                {linkCount(deleting.id) > 0
                  ? `Their ${linkCount(deleting.id) === 1 ? 'link' : `${linkCount(deleting.id)} links`} to other people (parent, child or spouse) will be removed too.`
                  : 'They have no links to other people.'}{' '}
                Their photo stays in the media library.
              </p>
            </>
          )
        }
        confirmLabel="Delete member"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
