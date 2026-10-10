import type { FamilyMember } from '@birthday/types';
import { motion, type Variants } from 'motion/react';
import { Flower2 } from 'lucide-react';
import { MediaImage } from '@/components/public/media';
import { EASE } from '@/components/public/reveal';
import { cn, initials } from '@/lib/utils';
import { formatYears, isDeceased } from './layout';

/** Circular portrait, or a navy monogram when there is no photo. Decorative: the name sits beside it. */
export function MemberAvatar({
  member,
  className,
  variant = 'thumb',
  textClassName,
}: {
  member: FamilyMember;
  className?: string;
  variant?: 'thumb' | 'medium';
  textClassName?: string;
}) {
  const deceased = isDeceased(member);
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-full', className)}>
      {member.photo ? (
        <MediaImage
          media={member.photo}
          variant={variant}
          sizes="160px"
          fallbackLabel={initials(member.fullName)}
          alt=""
          className={cn('size-full object-cover', deceased && 'grayscale-[40%]')}
        />
      ) : (
        <span
          className={cn(
            'flex size-full items-center justify-center bg-luxury font-display tracking-wide text-champagne',
            textClassName ?? 'text-lg',
          )}
        >
          {initials(member.fullName)}
        </span>
      )}
    </span>
  );
}

/** "1932 – 2010" in the display face, with a small flower and screen-reader text for those remembered. */
export function MemberYears({ member, className }: { member: FamilyMember; className?: string }) {
  const years = formatYears(member);
  const deceased = isDeceased(member);
  if (!years && !deceased) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-display text-xs text-muted', className)}>
      {deceased && <Flower2 aria-hidden className="size-3 shrink-0 text-gold-rich" strokeWidth={1.5} />}
      {years}
      {deceased && <span className="sr-only">(in loving memory)</span>}
    </span>
  );
}

/** The small navy "70" coin that marks the celebrant. */
export function SeventyBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute flex items-center justify-center rounded-full bg-navy font-display text-gold ring-2 ring-ivory',
        className,
      )}
    >
      70
    </span>
  );
}

export const nodeVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.9, ease: EASE } },
};
const textVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } },
};

/**
 * Desktop tree node. The photo slot has a fixed height per unit (`slotClassName`) so
 * spouses' portraits line up; `data-anchor-id` is what the connector lines aim at.
 * Only opacity animates on the measured parts, so connector maths stay exact.
 */
export function MemberNode({
  member,
  slotClassName,
  onSelect,
}: {
  member: FamilyMember;
  slotClassName: string;
  onSelect: (id: string) => void;
}) {
  const celebrant = member.isCelebrant;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onSelect(member.id)}
      className={cn(
        'group flex flex-col items-center rounded-2xl px-2 pb-2 pt-1 text-center transition-colors duration-500 ease-luxe hover:bg-cream/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ivory',
        celebrant ? 'w-44' : 'w-36',
      )}
    >
      <span className={cn('flex items-center justify-center', slotClassName)}>
        <span
          data-anchor-id={member.id}
          className={cn(
            'relative rounded-full ring-offset-ivory transition-shadow duration-500 ease-luxe',
            celebrant
              ? 'size-28 ring-2 ring-gold ring-offset-4 shadow-gold'
              : 'size-20 ring-1 ring-gold/40 ring-offset-[3px] shadow-soft group-hover:ring-gold/80',
          )}
        >
          <MemberAvatar member={member} className="size-full" textClassName={celebrant ? 'text-3xl' : 'text-xl'} />
          {celebrant && <SeventyBadge className="-bottom-1 -right-1 size-9 text-[13px]" />}
        </span>
      </span>
      <motion.span variants={textVariants} className="mt-3 flex flex-col items-center gap-1">
        <span className={cn('font-display leading-snug text-navy', celebrant ? 'text-lg' : 'text-[15px]')}>
          {member.fullName}
        </span>
        {member.relationshipLabel && (
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-gold-rich">{member.relationshipLabel}</span>
        )}
        <MemberYears member={member} />
      </motion.span>
    </button>
  );
}

/** Mobile list row: avatar left, text right, full-width tap target. */
export function MemberRow({
  member,
  onSelect,
  tone = 'light',
}: {
  member: FamilyMember;
  onSelect: (id: string) => void;
  tone?: 'light' | 'dark';
}) {
  const celebrant = member.isCelebrant;
  const dark = tone === 'dark';
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onSelect(member.id)}
      className={cn(
        'flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-colors duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset',
        dark ? 'hover:bg-white/5' : 'hover:bg-cream/70',
      )}
    >
      <span
        className={cn(
          'relative rounded-full ring-offset-2',
          celebrant ? 'size-16 ring-2 ring-gold' : 'size-14 ring-1 ring-gold/40',
          dark ? 'ring-offset-navy' : 'ring-offset-ivory',
        )}
      >
        <MemberAvatar member={member} className="size-full" textClassName={celebrant ? 'text-xl' : 'text-base'} />
        {celebrant && <SeventyBadge className="-bottom-1 -right-1.5 size-7 text-[11px] ring-navy" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('font-display text-base leading-snug', dark ? 'text-ivory' : 'text-navy')}>{member.fullName}</span>
        {member.relationshipLabel && (
          <span className={cn('text-[11px] font-medium uppercase tracking-[0.16em]', dark ? 'text-gold' : 'text-gold-rich')}>
            {member.relationshipLabel}
          </span>
        )}
        <MemberYears member={member} className={dark ? 'text-ivory/70 [&_svg]:text-gold' : undefined} />
      </span>
    </button>
  );
}
