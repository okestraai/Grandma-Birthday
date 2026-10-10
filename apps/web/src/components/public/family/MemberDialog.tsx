import { useEffect, useMemo, useRef } from 'react';
import type { FamilyMember, FamilyTree } from '@birthday/types';
import { Dialog } from '@/components/ui/dialog';
import { MediaImage } from '@/components/public/media';
import { cn, initials, paragraphs } from '@/lib/utils';
import { formatYears, isDeceased, relationsOf } from './layout';
import { MemberAvatar } from './MemberNode';

function RelationList({ title, people, onSelect }: { title: string; people: FamilyMember[]; onSelect: (id: string) => void }) {
  if (people.length === 0) return null;
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold-rich">{title}</h3>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-gold/20 bg-white/60 px-3 py-2 text-left transition-colors duration-300 hover:border-gold/50 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <MemberAvatar member={p} className="size-9 ring-1 ring-gold/30" textClassName="text-xs" />
              <span className="min-w-0">
                <span className="block truncate font-display text-sm text-navy">{p.fullName}</span>
                {p.relationshipLabel && <span className="block truncate text-xs text-muted">{p.relationshipLabel}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Detail view for one family member. Relations are buttons that switch the dialog
 * to that person; focus then moves to the new person's details.
 */
export function MemberDialog({
  tree,
  memberId,
  onSelect,
  onClose,
}: {
  tree: FamilyTree;
  memberId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  // Keep the last person while the dialog closes, so it never flashes empty.
  const lastId = useRef<string | null>(null);
  if (memberId) lastId.current = memberId;
  const shownId = memberId ?? lastId.current;
  const member = useMemo(() => tree.members.find((m) => m.id === shownId) ?? null, [tree, shownId]);
  const relations = useMemo(() => (shownId ? relationsOf(tree, shownId) : null), [tree, shownId]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (memberId && previous.current && previous.current !== memberId && bodyRef.current) {
      bodyRef.current.parentElement?.scrollTo?.({ top: 0 });
      bodyRef.current.focus();
    }
    previous.current = memberId;
  }, [memberId]);

  const years = member ? formatYears(member) : null;
  const deceased = member ? isDeceased(member) : false;
  const bio = paragraphs(member?.bio);

  return (
    <Dialog
      open={Boolean(memberId && member)}
      onOpenChange={(open) => !open && onClose()}
      title={member?.fullName ?? ''}
      description={member?.relationshipLabel || undefined}
      className="max-w-xl"
    >
      {member && relations && (
        <div ref={bodyRef} tabIndex={-1} className="space-y-6 focus:outline-none" aria-label={`About ${member.fullName}`}>
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            {member.photo ? (
              <span className={cn('relative shrink-0 overflow-hidden rounded-full ring-offset-4 ring-offset-ivory', member.isCelebrant ? 'ring-2 ring-gold' : 'ring-1 ring-gold/40')}>
                <MediaImage
                  media={member.photo}
                  variant="medium"
                  sizes="160px"
                  fallbackLabel={initials(member.fullName)}
                  alt={member.photo.altText ?? `Portrait of ${member.fullName}`}
                  className={cn('size-36 object-cover sm:size-40', deceased && 'grayscale-[40%]')}
                />
              </span>
            ) : (
              <MemberAvatar member={member} className="size-36 ring-1 ring-gold/40 ring-offset-4 ring-offset-ivory sm:size-40" textClassName="text-4xl" />
            )}
            <div className="space-y-2">
              {member.isCelebrant && (
                <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">The celebrant</p>
              )}
              {years && <p className="font-display text-xl text-navy">{years}</p>}
              {deceased && <p className="text-sm italic text-muted">In loving memory</p>}
            </div>
          </div>

          {bio.length > 0 && (
            <div className="space-y-3 text-[15px] leading-relaxed text-charcoal">
              {bio.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

          {(relations.spouses.length > 0 || relations.parents.length > 0 || relations.children.length > 0) && (
            <div className="space-y-5 border-t border-gold/25 pt-5">
              <RelationList title={relations.spouses.length > 1 ? 'Spouses' : 'Spouse'} people={relations.spouses} onSelect={onSelect} />
              <RelationList title="Parents" people={relations.parents} onSelect={onSelect} />
              <RelationList title="Children" people={relations.children} onSelect={onSelect} />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
