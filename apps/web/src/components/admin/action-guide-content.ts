import type { ActionGuideRow } from './action-guide';

/**
 * Plain-English explanations of each admin page's buttons, for <ActionGuide>.
 * Action names must match the button labels in the UI exactly.
 */

export const TESTIMONIAL_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Approve',
    does: 'Marks the message as read and fine. It is not shown on the website yet.',
    sees: 'Only admins.',
  },
  {
    action: 'Reject',
    does: 'Hides the message everywhere. If it was on the website, it is taken off.',
    sees: 'Only admins.',
  },
  {
    action: 'Show on public website',
    does: 'The switch in the Public column (Publish / Unpublish when several are selected). Only approved messages can be shown.',
    sees: 'Everyone: the message appears on the Tributes page and the home page.',
  },
  {
    action: 'Feature / Unfeature',
    does: 'Featuring shows the message first, as a large quote at the top of Tributes and ahead of others on the home page. Featuring also makes it public. Unpublishing removes the feature.',
    sees: 'Everyone.',
  },
  {
    action: 'Edit',
    does: 'Fix typos or the author’s name. The date of the edit is recorded.',
    sees: 'Everyone, if the message is public.',
  },
  {
    action: 'Delete',
    does: 'Removes the message for good, with any photo or video attached to it. This cannot be undone.',
    sees: 'Nobody afterwards.',
  },
  {
    action: 'via RSVP',
    does: 'Not a button: this tag means the guest wrote the message in the RSVP form.',
    sees: 'Only admins.',
  },
];

export const GUEST_PHOTO_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Approve',
    does: 'Accepts the upload. It goes into the album you choose, or the guest upload album set in Settings.',
    sees: 'Everyone, in the public gallery (unless the album is private).',
  },
  {
    action: 'Reject',
    does: 'Hides the upload. The file still uses storage until you delete it.',
    sees: 'Only admins.',
  },
  {
    action: 'Add to album',
    does: 'Puts the upload in an album. On the Pending tab this also approves it.',
    sees: 'Everyone, once approved and if the album is public.',
  },
  {
    action: 'Delete',
    does: 'Removes the file for good and frees its storage. This cannot be undone.',
    sees: 'Nobody afterwards.',
  },
];

export const MEDIA_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Approve',
    does: 'Allows the photo or video to be shown on the site.',
    sees: 'Everyone, where it is used (gallery, timeline, family tree), unless its album is private.',
  },
  {
    action: 'Reject',
    does: 'Hides it from every public page. The file is kept and still uses storage.',
    sees: 'Only admins.',
  },
  {
    action: 'Move to album',
    does: 'Moves it into another album, or to “No album”. Its approval does not change.',
    sees: 'Everyone, if approved and the new album is public.',
  },
  {
    action: 'Set as cover',
    does: 'Uses this photo as the album’s cover in the gallery.',
    sees: 'Everyone, if the album is public.',
  },
  {
    action: 'Edit',
    does: 'Change the caption and alt text. Alt text describes the photo and is read aloud by screen readers.',
    sees: 'Everyone who can see the photo.',
  },
  {
    action: 'Delete',
    does: 'Removes the file for good and frees its storage. This cannot be undone.',
    sees: 'Nobody afterwards.',
  },
];

export const INVITATION_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Send / Resend',
    does: 'Emails the guest their invitation. Resend sends the same link and QR code again.',
    sees: 'The guest, by email.',
  },
  {
    action: 'Send to selected',
    does: 'Emails the invitations of the guests you ticked. Guests who declined are skipped.',
    sees: 'Those guests, by email.',
  },
  {
    action: 'Send to everyone not yet sent',
    does: 'Emails every active invitation that has never been sent.',
    sees: 'Those guests, by email.',
  },
  {
    action: 'Revoke',
    does: 'Stops the link and QR code working at the door. The guest sees the invitation as revoked.',
    sees: 'The guest, if they open the link; door staff when scanning.',
  },
  {
    action: 'Reinstate',
    does: 'Undoes Revoke. The same link and QR code work again.',
    sees: 'The guest and door staff.',
  },
  {
    action: 'Regenerate link',
    does: 'Makes a new link and QR code. The old one stops working, including any printed pass. Send the invitation again afterwards.',
    sees: 'The guest, once you send the new one.',
  },
  {
    action: 'Reverse check-in',
    does: 'Marks the guest as not checked in, so they can be checked in again. A reason is recorded. Only some admins can do this.',
    sees: 'Admins and door staff.',
  },
  {
    action: 'Override capacity',
    does: 'Appears when the event or the guest’s category is full. Ticking it lets you add the guest anyway; this is recorded in the audit log.',
    sees: 'Only admins.',
  },
];

export const ALBUM_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Public / Private',
    does: 'Public albums are shown in the gallery. Private albums are hidden from guests, and their photos also stay off public pages such as the timeline and family tree.',
    sees: 'Public: everyone. Private: only admins.',
  },
  {
    action: 'Set as cover',
    does: 'In the Gallery, uses a photo as the album’s cover. Without one, the first photo is used.',
    sees: 'Everyone, if the album is public.',
  },
  {
    action: 'Move up / Move down',
    does: 'The arrow buttons change the order albums appear in the gallery.',
    sees: 'Everyone.',
  },
  {
    action: 'Delete',
    does: 'Removes the album. Its photos and videos are kept and moved to “No album”.',
    sees: 'Everyone: the album disappears from the gallery.',
  },
];

export const USER_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Unlock',
    does: 'Lets a user sign in again after too many wrong passwords.',
    sees: 'That user.',
  },
  {
    action: 'Edit → Disabled',
    does: 'Stops the user signing in and signs them out on every device. Their history is kept.',
    sees: 'That user.',
  },
  {
    action: 'Set new password',
    does: 'Replaces their password and signs them out everywhere. Give them the new password yourself.',
    sees: 'That user.',
  },
  {
    action: 'Role',
    does: 'Super admin: everything, including users. Admin: everything except users. Check-in staff: only the check-in screen. Changing a role signs the user out.',
    sees: 'That user.',
  },
  {
    action: 'Delete',
    does: 'Removes the account for good. To block access for a while, disable it instead.',
    sees: 'That user.',
  },
];

export const STORAGE_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Delete',
    does: 'Removes the file for good and frees its storage. This cannot be undone.',
    sees: 'Nobody afterwards; it disappears from the site.',
  },
  {
    action: 'Change quota in Settings',
    does: 'Opens Settings, where you set how much storage uploads may use.',
    sees: 'Only admins.',
  },
  {
    action: 'Regenerate QR code',
    does: 'In Settings → Guest upload QR code. Makes a new upload link; printed posters with the old QR code stop working.',
    sees: 'Guests: the old QR code shows “no longer active”.',
  },
];

export const SETTINGS_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Save',
    does: 'Each section saves on its own. Discard puts back the saved values.',
    sees: 'Everyone, for settings that change the public site.',
  },
  {
    action: 'Regenerate QR code',
    does: 'Makes a new guest upload link and QR code. Printed posters with the old QR code stop working.',
    sees: 'Guests: the old QR code shows “no longer active”.',
  },
  {
    action: 'Reset to default',
    does: 'Fills in the original navy and gold colours. Save to apply them.',
    sees: 'Everyone, after you save.',
  },
];

export const EVENT_ACTIONS: ActionGuideRow[] = [
  {
    action: 'Add event',
    does: 'Adds a gathering to the celebration, such as a church service, a dinner or a brunch, with its own date, venue and dress code.',
    sees: 'Everyone, on the website and the RSVP form, unless the event is hidden.',
  },
  {
    action: 'Edit',
    does: 'Changes an event’s name, time, venue, guest information, capacity or who is invited. Guests who already replied keep their answer.',
    sees: 'Everyone who can see the event, and invited guests on their pass.',
  },
  {
    action: 'Delete',
    does: 'Removes the event and its programme. Not possible for the last event, or once guests have replied to it or been checked in: hide it and turn off its replies instead.',
    sees: 'Nobody afterwards.',
  },
  {
    action: 'Move up / Move down',
    does: 'The arrow buttons change the order events are listed in.',
    sees: 'Everyone: the website, the RSVP form and invitations use this order.',
  },
  {
    action: 'Invited categories',
    does: 'Only guests in the ticked categories may reply to the event. None ticked means everyone is invited. You can also add one guest to an event from their details on the Guests page.',
    sees: 'Guests: the RSVP form only offers the events they are invited to.',
  },
  {
    action: 'Capacity (per event)',
    does: 'The most people at this event. When it is full, guests can no longer choose it. Blank means only the celebration capacity applies.',
    sees: 'Guests: a full event is marked as full on the RSVP form.',
  },
  {
    action: 'Info only',
    does: 'Shown when “Guests reply to this event” is off. Guests do not choose the event; it is shown for information, for example a service open to all.',
    sees: 'Everyone who can see the event.',
  },
  {
    action: 'Hidden',
    does: 'Shown when “Show on the public website” is off. The event is left off the website and the open RSVP form.',
    sees: 'Only invited guests, on their personal invitation, and admins.',
  },
  {
    action: 'How guests reply to the events',
    does: '“Event by event”: guests tick the events they will come to. “Once for everything”: one yes covers every event they are invited to, with all their companions; a full event then refuses the whole reply. Replies already made stay as they are.',
    sees: 'Guests: the RSVP form either asks which events, or lists the events their reply covers.',
  },
  {
    action: 'Check-in at the door',
    does: '“At each event”: staff choose the event and check a guest in once per event. “Once for the celebration”: no event to choose, and one check-in counts for every event.',
    sees: 'Check-in staff: the event buttons appear only for “At each event”.',
  },
];
