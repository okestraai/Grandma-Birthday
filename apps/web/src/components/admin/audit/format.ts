import type { AuditLogEntry, Permission } from '@birthday/types';

/** "testimonial.approve" → "Testimonial approve"; "guest.rsvp_update" → "Guest rsvp update". */
export function humaniseAction(action: string): string {
  const words = action.replace(/[._-]+/g, ' ').trim();
  if (!words) return action;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** "GuestCategory" / "guest_category" → "Guest category". */
export function humaniseEntity(entityType: string): string {
  const words = entityType
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim();
  if (!words) return entityType;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export interface AuditTarget {
  /** In-app path, e.g. "/admin/guests?guest=<id>". */
  to: string;
  /** Short name of the destination, e.g. "Open guest". Used as the link's accessible description. */
  label: string;
}

type Can = (permission: Permission) => boolean;

const TESTIMONIAL_FILTER: Record<string, string> = {
  GUEST_SUBMITTED_TESTIMONIAL: 'pending',
  ADMIN_APPROVED_TESTIMONIAL: 'approved',
  ADMIN_REJECTED_TESTIMONIAL: 'rejected',
  ADMIN_PUBLISHED_TESTIMONIAL: 'public',
};

const GUEST_PHOTO_ACTIONS = new Set(['ADMIN_APPROVED_MEDIA', 'ADMIN_REJECTED_MEDIA', 'GUEST_UPLOADED_MEDIA']);

/**
 * Where an audit entry's action happened in the dashboard, for linking activity items.
 * Returns null for unknown entities and for pages the current admin cannot open
 * (pass `can` from useAuth; without it every page is assumed allowed except Users).
 */
export function auditTarget(entry: Pick<AuditLogEntry, 'action' | 'entityType' | 'entityId'>, can?: Can): AuditTarget | null {
  const target = rawTarget(entry);
  if (!target) return null;
  const allowed = can ?? ((permission: Permission) => permission !== 'users:manage');
  return allowed(target.permission) ? { to: target.to, label: target.label } : null;
}

function rawTarget({ action, entityType, entityId }: Pick<AuditLogEntry, 'action' | 'entityType' | 'entityId'>): (AuditTarget & { permission: Permission }) | null {
  switch (entityType) {
    case 'Guest':
      // A deleted guest has no detail to open.
      return entityId && action !== 'ADMIN_DELETED_GUEST'
        ? { to: `/admin/guests?guest=${encodeURIComponent(entityId)}`, label: 'Open guest', permission: 'guests:manage' }
        : { to: '/admin/guests', label: 'Open guests', permission: 'guests:manage' };
    case 'Invitation':
      return { to: '/admin/invitations', label: 'Open invitations', permission: 'guests:manage' };
    case 'CheckIn':
      return { to: '/admin/invitations#checkin-log', label: 'Open check-in log', permission: 'guests:manage' };
    case 'Testimonial': {
      const filter = TESTIMONIAL_FILTER[action];
      return { to: filter ? `/admin/testimonials?filter=${filter}` : '/admin/testimonials', label: 'Open testimonials', permission: 'testimonials:manage' };
    }
    case 'Media':
      return GUEST_PHOTO_ACTIONS.has(action)
        ? { to: '/admin/guest-photos', label: 'Open guest photos', permission: 'media:manage' }
        : { to: '/admin/media', label: 'Open media library', permission: 'media:manage' };
    case 'UploadSession':
      return { to: '/admin/guest-photos', label: 'Open guest photos', permission: 'media:manage' };
    case 'Album':
      return { to: '/admin/albums', label: 'Open albums', permission: 'media:manage' };
    // Old celebration-settings rows have entityType 'Event' and entityId '1'.
    case 'Event':
    case 'Celebration':
      return { to: '/admin/event', label: 'Open events', permission: 'event:manage' };
    case 'Settings':
      return { to: '/admin/settings', label: 'Open settings', permission: 'settings:manage' };
    case 'Celebrant':
      return { to: '/admin/celebrant', label: 'Open celebrant', permission: 'content:manage' };
    case 'TimelineEntry':
      return { to: '/admin/timeline', label: 'Open timeline', permission: 'content:manage' };
    case 'FamilyMember':
    case 'FamilyRelationship':
      return { to: '/admin/family', label: 'Open family tree', permission: 'content:manage' };
    case 'ProgrammeItem':
      return { to: '/admin/programme', label: 'Open programme', permission: 'event:manage' };
    case 'User':
      return { to: '/admin/users', label: 'Open users', permission: 'users:manage' };
    case 'GuestCategory':
      return { to: '/admin/guest-categories', label: 'Open guest categories', permission: 'guests:manage' };
    case 'RsvpQuestion':
      return { to: '/admin/guest-categories?tab=questions', label: 'Open RSVP questions', permission: 'guests:manage' };
    default:
      return null;
  }
}
