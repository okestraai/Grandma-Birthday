import { useState, type FormEvent } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import type { AdminFamilyMember, CreateFamilyRelationshipRequest, FamilyRelationType, FamilyRelationship } from '@birthday/types';
import { api, isApiError } from '@/lib/api';
import { adminKeys, useAdminMutation } from '@/lib/admin-api';
import { Confirm } from '../overlays';
import { AButton, ASelect, IconButton, Panel } from '../ui';
import { RELATION_VERB, findDuplicate, generationName, groupByGeneration, sortMembers, wouldCreateCycle } from './family-utils';

/** Add PARENT_OF / SPOUSE_OF links between members, and list existing links as sentences. */
export function RelationshipsPanel({ members, relationships }: { members: AdminFamilyMember[]; relationships: FamilyRelationship[] }) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [type, setType] = useState<FamilyRelationType>('PARENT_OF');
  const [deleting, setDeleting] = useState<FamilyRelationship | null>(null);

  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.fullName ?? 'Unknown person';
  const sorted = sortMembers(members);

  const problem = !fromId || !toId
    ? null
    : fromId === toId
      ? 'Choose two different people.'
      : findDuplicate(relationships, fromId, toId, type)
        ? 'This link already exists.'
        : type === 'PARENT_OF' && findDuplicate(relationships, toId, fromId, 'PARENT_OF')
          ? `${name(toId)} is already recorded as the parent of ${name(fromId)}.`
          : type === 'PARENT_OF' && wouldCreateCycle(relationships, fromId, toId)
            ? `${name(toId)} is already an ancestor of ${name(fromId)}.`
            : null;

  const create = useAdminMutation<FamilyRelationship, CreateFamilyRelationshipRequest>({
    mutationFn: (body) => api.post<FamilyRelationship>('/admin/family/relationships', body),
    invalidate: [adminKeys.family],
    success: (_d, v) => `Linked: ${name(v.fromId)} ${RELATION_VERB[v.type]} ${name(v.toId)}.`,
    onSuccess: () => {
      setFromId('');
      setToId('');
    },
  });

  const remove = useAdminMutation<void, FamilyRelationship>({
    mutationFn: (r) => api.delete(`/admin/family/relationships/${r.id}`),
    invalidate: [adminKeys.family],
    success: 'Link removed.',
    onSuccess: () => setDeleting(null),
    onError: (error) => {
      if (isApiError(error, 'NOT_FOUND')) setDeleting(null);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!fromId || !toId || problem) return;
    create.mutate({ fromId, toId, type });
  };

  const options = (exclude: string) =>
    groupByGeneration(sorted).map(([generation, group]) => (
      <optgroup key={generation} label={generationName(generation)}>
        {group.map((m) => (
          <option key={m.id} value={m.id} disabled={m.id === exclude}>
            {m.fullName}
          </option>
        ))}
      </optgroup>
    ));

  const sentences = [...relationships].sort(
    (a, b) => a.type.localeCompare(b.type) || name(a.fromId).localeCompare(name(b.fromId)) || name(a.toId).localeCompare(name(b.toId)),
  );

  return (
    <Panel title="Relationships" description="Links draw the lines of the family tree." id="family-relationships">
      {members.length < 2 ? (
        <p className="text-[13px] text-muted">Add at least two family members to link them.</p>
      ) : (
        <form onSubmit={submit} className="space-y-2" aria-describedby={problem ? 'rel-problem' : undefined}>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <ASelect aria-label="First person" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Choose a person…</option>
              {options(toId)}
            </ASelect>
            <ASelect aria-label="Relationship" value={type} onChange={(e) => setType(e.target.value as FamilyRelationType)} className="sm:w-40">
              <option value="PARENT_OF">is parent of</option>
              <option value="SPOUSE_OF">is spouse of</option>
            </ASelect>
            <ASelect aria-label="Second person" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Choose a person…</option>
              {options(fromId)}
            </ASelect>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="rel-problem" className={problem ? 'text-xs text-error' : 'text-xs text-muted'} role={problem ? 'alert' : undefined}>
              {problem ??
                (fromId && toId ? `${name(fromId)} ${RELATION_VERB[type]} ${name(toId)}.` : 'Example: “Grace is parent of Tunde”.')}
            </p>
            <AButton type="submit" variant="emerald" size="sm" disabled={!fromId || !toId || !!problem} loading={create.isPending}>
              <Link2 aria-hidden /> Add link
            </AButton>
          </div>
        </form>
      )}

      <div className="mt-4 border-t border-navy/[0.08] pt-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Existing links ({relationships.length})</h3>
        {sentences.length === 0 ? (
          <p className="text-[13px] text-muted">No links yet.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-navy/[0.06] overflow-y-auto">
            {sentences.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 text-[13px] text-charcoal">
                  <strong className="font-medium text-navy">{name(r.fromId)}</strong> {RELATION_VERB[r.type]}{' '}
                  <strong className="font-medium text-navy">{name(r.toId)}</strong>
                </span>
                <IconButton
                  label={`Remove link: ${name(r.fromId)} ${RELATION_VERB[r.type]} ${name(r.toId)}`}
                  tooltip={false}
                  variant="danger-ghost"
                  onClick={() => setDeleting(r)}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Confirm
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this link?"
        description={deleting ? `“${name(deleting.fromId)} ${RELATION_VERB[deleting.type]} ${name(deleting.toId)}” will be removed from the tree. Both people stay.` : ''}
        confirmLabel="Remove link"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Panel>
  );
}
