import { Check, Eye, Pencil, Star, StarOff, Trash2, X } from 'lucide-react';
import type { AdminTestimonial, UpdateTestimonialRequest } from '@birthday/types';
import { AButton, IconButton } from '../ui';

export interface TestimonialActionHandlers {
  onPatch: (patch: UpdateTestimonialRequest) => void;
  onEdit: () => void;
  onDelete: () => void;
  onView?: () => void;
}

/** Row actions. `icons` for table rows, `buttons` (labelled) for the detail dialog and mobile cards. */
export function TestimonialActions({
  testimonial: t,
  layout = 'icons',
  onPatch,
  onEdit,
  onDelete,
  onView,
}: TestimonialActionHandlers & { testimonial: AdminTestimonial; layout?: 'icons' | 'buttons' }) {
  const name = t.authorName;
  const approved = t.status === 'APPROVED';

  if (layout === 'buttons') {
    return (
      <div className="flex flex-wrap gap-2">
        {onView && (
          <AButton size="sm" onClick={onView}>
            <Eye aria-hidden /> View
          </AButton>
        )}
        {!approved && (
          <AButton size="sm" variant="emerald" onClick={() => onPatch({ status: 'APPROVED' })}>
            <Check aria-hidden /> Approve
          </AButton>
        )}
        {t.status !== 'REJECTED' && (
          <AButton size="sm" variant="danger-ghost" onClick={() => onPatch({ status: 'REJECTED' })}>
            <X aria-hidden /> Reject
          </AButton>
        )}
        {approved && (
          <AButton size="sm" onClick={() => onPatch({ isFeatured: !t.isFeatured })}>
            {t.isFeatured ? <StarOff aria-hidden /> : <Star aria-hidden />} {t.isFeatured ? 'Unfeature' : 'Feature'}
          </AButton>
        )}
        <AButton size="sm" onClick={onEdit}>
          <Pencil aria-hidden /> Edit
        </AButton>
        <AButton size="sm" variant="danger-ghost" onClick={onDelete}>
          <Trash2 aria-hidden /> Delete
        </AButton>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {onView && (
        <IconButton label={`View testimonial from ${name}`} onClick={onView}>
          <Eye aria-hidden />
        </IconButton>
      )}
      {!approved && (
        <IconButton label={`Approve testimonial from ${name}`} className="text-emerald hover:bg-emerald/10" onClick={() => onPatch({ status: 'APPROVED' })}>
          <Check aria-hidden />
        </IconButton>
      )}
      {t.status !== 'REJECTED' && (
        <IconButton label={`Reject testimonial from ${name}`} variant="danger-ghost" onClick={() => onPatch({ status: 'REJECTED' })}>
          <X aria-hidden />
        </IconButton>
      )}
      {approved && (
        <IconButton
          label={t.isFeatured ? `Unfeature testimonial from ${name}` : `Feature testimonial from ${name}`}
          className={t.isFeatured ? 'text-gold-rich' : undefined}
          onClick={() => onPatch({ isFeatured: !t.isFeatured })}
        >
          {t.isFeatured ? <Star aria-hidden fill="currentColor" /> : <Star aria-hidden />}
        </IconButton>
      )}
      <IconButton label={`Edit testimonial from ${name}`} onClick={onEdit}>
        <Pencil aria-hidden />
      </IconButton>
      <IconButton label={`Delete testimonial from ${name}`} variant="danger-ghost" onClick={onDelete}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );
}
