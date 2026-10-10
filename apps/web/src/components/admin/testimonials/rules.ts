import type { AdminTestimonial, BulkTestimonialRequest, UpdateTestimonialRequest } from '@birthday/types';

/**
 * Applies a PATCH to a testimonial with the same rules the server enforces, so optimistic
 * updates look exactly like the eventual response:
 * - approving does not publish;
 * - leaving APPROVED (reject / back to pending) clears isPublic and isFeatured;
 * - featuring also makes it public; unpublishing also unfeatures it.
 */
export function applyTestimonialPatch(item: AdminTestimonial, patch: UpdateTestimonialRequest): AdminTestimonial {
  const now = new Date().toISOString();
  const next: AdminTestimonial = { ...item, updatedAt: now };
  if (patch.authorName !== undefined) next.authorName = patch.authorName;
  if (patch.relationship !== undefined) next.relationship = patch.relationship;
  if (patch.message !== undefined) next.message = patch.message;
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  if (patch.authorName !== undefined || patch.relationship !== undefined || patch.message !== undefined) next.editedAt = now;

  if (patch.status !== undefined && patch.status !== item.status) {
    next.status = patch.status;
    next.reviewedAt = now;
  }
  const approved = next.status === 'APPROVED';
  if (patch.isPublic !== undefined) next.isPublic = approved && patch.isPublic;
  if (patch.isFeatured !== undefined) {
    next.isFeatured = approved && patch.isFeatured;
    if (next.isFeatured) next.isPublic = true;
  }
  if (!next.isPublic) next.isFeatured = false;
  if (!approved) {
    next.isPublic = false;
    next.isFeatured = false;
  }
  return next;
}

/** The single-item patch equivalent of a bulk action (used for optimistic bulk updates). */
export function bulkActionPatch(action: BulkTestimonialRequest['action']): UpdateTestimonialRequest | null {
  switch (action) {
    case 'APPROVE':
      return { status: 'APPROVED' };
    case 'REJECT':
      return { status: 'REJECTED' };
    case 'PUBLISH':
      return { isPublic: true };
    case 'UNPUBLISH':
      return { isPublic: false };
    default:
      return null;
  }
}

export const NOT_APPROVED_HINT = 'Approve this testimonial before showing it on the public website.';
