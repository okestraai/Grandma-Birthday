import type { AuditLogEntry, Permission } from '@birthday/types';
import { auditTarget } from './format';

function entry(entityType: string, action = 'ADMIN_UPDATED', entityId: string | null = 'id-1'): Pick<AuditLogEntry, 'action' | 'entityType' | 'entityId'> {
  return { entityType, action, entityId };
}

const all = () => true;

describe('auditTarget', () => {
  it.each([
    [entry('Guest', 'ADMIN_UPDATED_GUEST', 'g1'), '/admin/guests?guest=g1'],
    [entry('Guest', 'GUEST_SUBMITTED_RSVP', 'g 2'), '/admin/guests?guest=g%202'],
    [entry('Guest', 'ADMIN_DELETED_GUEST', 'g1'), '/admin/guests'],
    [entry('Invitation', 'ADMIN_SENT_INVITATION'), '/admin/invitations'],
    [entry('CheckIn', 'ADMIN_REVERSED_CHECK_IN'), '/admin/invitations#checkin-log'],
    [entry('Testimonial', 'GUEST_SUBMITTED_TESTIMONIAL'), '/admin/testimonials?filter=pending'],
    [entry('Testimonial', 'ADMIN_APPROVED_TESTIMONIAL'), '/admin/testimonials?filter=approved'],
    [entry('Testimonial', 'ADMIN_REJECTED_TESTIMONIAL'), '/admin/testimonials?filter=rejected'],
    [entry('Testimonial', 'ADMIN_DELETED_TESTIMONIAL'), '/admin/testimonials'],
    [entry('Media', 'ADMIN_APPROVED_MEDIA'), '/admin/guest-photos'],
    [entry('Media', 'ADMIN_REJECTED_MEDIA'), '/admin/guest-photos'],
    [entry('Media', 'GUEST_UPLOADED_MEDIA'), '/admin/guest-photos'],
    [entry('Media', 'ADMIN_DELETED_MEDIA'), '/admin/media'],
    [entry('Media', 'ADMIN_MOVED_MEDIA'), '/admin/media'],
    [entry('UploadSession', 'GUEST_UPLOADED_MEDIA'), '/admin/guest-photos'],
    [entry('Album', 'ADMIN_CHANGED_ALBUM'), '/admin/albums'],
    [entry('Event', 'ADMIN_CHANGED_EVENT_SETTINGS', '1'), '/admin/event'],
    [entry('Event', 'ADMIN_CHANGED_EVENT', '7d3c2b1a-0000-4000-8000-000000000001'), '/admin/event'],
    [entry('Celebration', 'ADMIN_CHANGED_EVENT_SETTINGS', '1'), '/admin/event'],
    [entry('Settings', 'ADMIN_ROTATED_UPLOAD_TOKEN'), '/admin/settings'],
    [entry('Celebrant', 'ADMIN_UPDATED_CELEBRANT'), '/admin/celebrant'],
    [entry('TimelineEntry', 'ADMIN_CHANGED_TIMELINE'), '/admin/timeline'],
    [entry('FamilyMember', 'ADMIN_CHANGED_FAMILY'), '/admin/family'],
    [entry('FamilyRelationship', 'ADMIN_CHANGED_FAMILY'), '/admin/family'],
    [entry('ProgrammeItem', 'ADMIN_CHANGED_PROGRAMME'), '/admin/programme'],
    [entry('GuestCategory', 'ADMIN_CHANGED_GUEST_CATEGORY'), '/admin/guest-categories'],
    [entry('RsvpQuestion', 'ADMIN_CHANGED_RSVP_QUESTION'), '/admin/guest-categories?tab=questions'],
    [entry('User', 'ADMIN_CREATED_USER'), '/admin/users'],
  ])('%o → %s', (e, to) => {
    expect(auditTarget(e, all)?.to).toBe(to);
  });

  it('returns null for unknown entities', () => {
    expect(auditTarget(entry('Something'), all)).toBeNull();
  });

  it('links to Users only for admins who can manage users', () => {
    const noUsers = (p: Permission) => p !== 'users:manage';
    expect(auditTarget(entry('User', 'ADMIN_LOGGED_IN'), noUsers)).toBeNull();
    expect(auditTarget(entry('User', 'ADMIN_LOGGED_IN'))).toBeNull();
    expect(auditTarget(entry('User', 'ADMIN_LOGGED_IN'), all)).toEqual({ to: '/admin/users', label: 'Open users' });
  });

  it('hides links to pages the admin cannot open', () => {
    const onlyGuests = (p: Permission) => p === 'guests:manage';
    expect(auditTarget(entry('Media', 'ADMIN_DELETED_MEDIA'), onlyGuests)).toBeNull();
    expect(auditTarget(entry('Invitation'), onlyGuests)?.to).toBe('/admin/invitations');
  });
});
