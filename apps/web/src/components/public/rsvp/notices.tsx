import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Mail, Phone } from 'lucide-react';
import type { PublicEvent, RsvpAvailability } from '@birthday/types';
import { Button } from '@/components/ui/button';
import { rsvpClosedMessage } from '../event/event-helpers';
import { GoldRule } from '../section';
import { RsvpCard, StepHeading } from './parts';

type Contact = Pick<PublicEvent, 'contactName' | 'contactEmail' | 'contactPhone'>;

/** "Questions? Contact …" block, only when the event has a contact. */
export function EventContact({ event }: { event?: Contact | null }) {
  if (!event || (!event.contactEmail && !event.contactPhone)) return null;
  return (
    <div className="mt-8 rounded-2xl border border-gold/25 bg-cream/70 px-5 py-4 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-gold-rich">Need help?</p>
      <p className="mt-1 text-sm text-navy">
        Please contact {event.contactName ?? 'the family'}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
        {event.contactEmail && (
          <a href={`mailto:${event.contactEmail}`} className="inline-flex items-center gap-1.5 text-emerald underline-offset-4 hover:underline">
            <Mail className="size-4" aria-hidden />
            {event.contactEmail}
          </a>
        )}
        {event.contactPhone && (
          <a href={`tel:${event.contactPhone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-emerald underline-offset-4 hover:underline">
            <Phone className="size-4" aria-hidden />
            {event.contactPhone}
          </a>
        )}
      </div>
    </div>
  );
}

export function RsvpNotice({
  eyebrow,
  title,
  children,
  event,
  actions,
  focusOnMount = false,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  event?: Contact | null;
  actions?: ReactNode;
  focusOnMount?: boolean;
}) {
  return (
    <RsvpCard>
      <div>
        <StepHeading focusOnMount={focusOnMount} eyebrow={eyebrow} title={title} />
        <GoldRule className="mt-5" />
        <div className="mx-auto mt-5 max-w-md space-y-3 text-center text-[15px] leading-relaxed text-charcoal/85 sm:text-base">{children}</div>
        {actions && <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div>}
        <EventContact event={event} />
      </div>
    </RsvpCard>
  );
}

const CLOSED_TITLES: Record<NonNullable<RsvpAvailability['closedReason']>, string> = {
  CLOSED_BY_ADMIN: 'Replies are paused',
  DEADLINE_PASSED: 'The reply date has passed',
  CAPACITY_REACHED: 'Every seat is now taken',
  EVENT_ENDED: 'The celebration has taken place',
};

export function ClosedNotice({
  availability,
  event,
  timezone,
  focusOnMount,
}: {
  availability: Pick<RsvpAvailability, 'closedReason' | 'deadline'>;
  event?: Contact | null;
  timezone?: string;
  focusOnMount?: boolean;
}) {
  const reason = availability.closedReason;
  return (
    <RsvpNotice
      eyebrow="RSVP"
      title={reason ? CLOSED_TITLES[reason] : 'Replies are closed'}
      event={reason === 'EVENT_ENDED' ? null : event}
      focusOnMount={focusOnMount}
      actions={
        reason === 'EVENT_ENDED' ? (
          <Button asChild variant="primary">
            <Link to="/testimonials">Leave a birthday message</Link>
          </Button>
        ) : undefined
      }
    >
      <p>{rsvpClosedMessage({ mode: 'OPEN', open: false, closedReason: reason, deadline: availability.deadline }, timezone)}</p>
      {reason !== 'EVENT_ENDED' && <p className="text-muted">If you have a question about your place, the family will be glad to help.</p>}
    </RsvpNotice>
  );
}

export function InviteOnlyNotice({ event, focusOnMount }: { event?: Contact | null; focusOnMount?: boolean }) {
  return (
    <RsvpNotice eyebrow="By invitation" title="Replies are by personal invitation" event={event} focusOnMount={focusOnMount}>
      <p>This celebration is by personal invitation. Your invitation email contains a private link to reply.</p>
      <p className="text-muted">Please open that email and follow the link. If you cannot find it, the family can send it again.</p>
    </RsvpNotice>
  );
}

export function InvalidInviteNotice({ code, allowOpen, event }: { code: string; allowOpen: boolean; event?: Contact | null }) {
  const message =
    code === 'INVITATION_REVOKED'
      ? 'This invitation link has been withdrawn.'
      : code === 'INVITATION_EXPIRED'
        ? 'This invitation link has expired.'
        : 'We could not find an invitation for this link.';
  return (
    <RsvpNotice
      eyebrow="Your invitation"
      title="This link is no longer valid"
      event={event}
      actions={
        allowOpen ? (
          <Button asChild variant="primary">
            <Link to="/rsvp">Reply without the link</Link>
          </Button>
        ) : undefined
      }
    >
      <p>{message}</p>
      <p className="text-muted">
        Please check you opened the most recent email from the family{allowOpen ? ', or reply here without the link' : ''}.
      </p>
    </RsvpNotice>
  );
}
