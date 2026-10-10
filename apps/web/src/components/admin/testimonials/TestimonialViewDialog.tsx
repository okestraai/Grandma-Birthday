import type { AdminTestimonial, UpdateTestimonialRequest } from '@birthday/types';
import { formatDateTime, paragraphs } from '@/lib/utils';
import { DetailList } from '../ui';
import { AdminDialog } from '../overlays';
import { MediaPreview } from '../media';
import { PublicSwitch } from './PublicSwitch';
import { TestimonialActions } from './TestimonialActions';
import { TestimonialStatus } from './TestimonialStatus';

export function TestimonialViewDialog({
  testimonial: t,
  open,
  onOpenChange,
  onPatch,
  onEdit,
  onDelete,
}: {
  testimonial: AdminTestimonial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatch: (patch: UpdateTestimonialRequest) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <AdminDialog
      open={open && !!t}
      onOpenChange={onOpenChange}
      size="lg"
      title={t ? `Testimonial from ${t.authorName}` : 'Testimonial'}
      description={t?.relationship ?? undefined}
      footer={t && <TestimonialActions testimonial={t} layout="buttons" onPatch={onPatch} onEdit={onEdit} onDelete={onDelete} />}
    >
      {t && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cream/60 px-3 py-2.5">
            <TestimonialStatus testimonial={t} />
            <PublicSwitch testimonial={t} showLabel onChange={(isPublic) => onPatch({ isPublic })} />
          </div>
          {t.status === 'APPROVED' && !t.isPublic && (
            <p className="text-xs text-muted">Approved but hidden. Switch on “Show on public website” to publish it.</p>
          )}

          <blockquote className="space-y-3 border-l-2 border-gold pl-4 text-sm leading-relaxed text-charcoal">
            {paragraphs(t.message).map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </blockquote>

          {(t.photo || t.video) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {t.photo && (
                <figure>
                  <MediaPreview media={t.photo} className="max-h-72" />
                  <figcaption className="mt-1 text-xs text-muted">Photo</figcaption>
                </figure>
              )}
              {t.video && (
                <figure>
                  <MediaPreview media={t.video} className="max-h-72" />
                  <figcaption className="mt-1 text-xs text-muted">Video</figcaption>
                </figure>
              )}
            </div>
          )}

          <DetailList
            items={[
              { label: 'Name', value: t.authorName },
              { label: 'Relationship', value: t.relationship },
              {
                label: 'Email',
                value: t.email ? (
                  <a className="text-navy underline underline-offset-2" href={`mailto:${t.email}`}>
                    {t.email}
                  </a>
                ) : null,
              },
              { label: 'Submitted', value: formatDateTime(t.createdAt) },
              {
                label: 'Reviewed',
                value: t.reviewedAt ? `${formatDateTime(t.reviewedAt)}${t.reviewedByName ? ` by ${t.reviewedByName}` : ''}` : 'Not yet reviewed',
              },
              { label: 'Edited', value: t.editedAt ? formatDateTime(t.editedAt) : 'Never' },
            ]}
          />
        </div>
      )}
    </AdminDialog>
  );
}
