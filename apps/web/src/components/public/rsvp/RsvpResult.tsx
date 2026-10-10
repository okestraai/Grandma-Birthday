import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Download, MailCheck, MailWarning } from 'lucide-react';
import type { SubmitRsvpResult } from '@birthday/types';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api';
import { GoldRule } from '../section';
import { EventContact } from './notices';
import { RsvpCard, StepHeading } from './parts';
import { EASE } from '../reveal';
import { ConfettiBurst, DrawCheck } from '../motion';

type Contact = Parameters<typeof EventContact>[0]['event'];

/** One line confirming the birthday message sent with the RSVP, if there was one. */
function TributeNote({ status }: { status: SubmitRsvpResult['tributeStatus'] }) {
  if (!status) return null;
  return (
    <p className="mx-auto mt-3 max-w-md text-sm text-muted">
      {status === 'PENDING'
        ? 'Your birthday message has been received. It will appear with the tributes once the family has read it.'
        : 'Your birthday message has been received. Thank you.'}
    </p>
  );
}

export function RsvpResult({ result, email, event }: { result: SubmitRsvpResult; email: string; event?: Contact }) {
  if (result.response === 'DECLINED') {
    return (
      <RsvpCard>
        <div className="text-center">
          <StepHeading focusOnMount eyebrow="Thank you" title="We will miss you" />
          <GoldRule className="mt-5" />
          <div className="mx-auto mt-5 max-w-md space-y-3 text-[15px] leading-relaxed text-charcoal/85 sm:text-base">
            <p>
              Thank you for letting us know, {result.guestName}. We will miss you on the day, and your kind reply means a great deal to
              the family.
            </p>
            {!result.tributeStatus && (
              <p className="text-muted">If you would like, you can still leave a birthday message to be shared with the celebrant.</p>
            )}
          </div>
          <TributeNote status={result.tributeStatus} />
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant={result.tributeStatus ? 'outline' : 'gold'} size="lg">
              <Link to="/testimonials">{result.tributeStatus ? 'Read the tributes' : 'Leave a birthday message'}</Link>
            </Button>
          </div>
        </div>
      </RsvpCard>
    );
  }

  const party = 1 + result.companionCount;
  const token = result.invitationToken;
  return (
    <RsvpCard>
      <div className="text-center">
        <ConfettiBurst count={90} />
        <DrawCheck className="mx-auto" />
        <div className="mt-4">
          <StepHeading focusOnMount eyebrow="With joy" title="You're on the guest list." />
        </div>
        <GoldRule className="mt-5" />
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-charcoal/85 sm:text-base">
          Thank you, {result.guestName}. The family looks forward to celebrating with you.
        </p>
        <TributeNote status={result.tributeStatus} />

        <motion.dl
          className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gold/30 bg-gold/30 text-center"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.9 }}
        >
          <div className="bg-ivory px-4 py-4">
            <dt className="text-[11px] uppercase tracking-[0.22em] text-muted">Party size</dt>
            <dd className="mt-1 font-display text-2xl text-navy">
              {party} <span className="text-base">{party === 1 ? 'guest' : 'guests'}</span>
            </dd>
          </div>
          <div className="bg-ivory px-4 py-4">
            <dt className="text-[11px] uppercase tracking-[0.22em] text-muted">Invitation code</dt>
            <dd className="mt-1 font-display text-2xl tracking-[0.12em] text-navy">{result.invitationCode ?? '—'}</dd>
          </div>
        </motion.dl>

        <p className="mx-auto mt-5 flex max-w-md items-start justify-center gap-2 text-sm text-muted">
          {result.emailSent ? (
            <>
              <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
              <span>Your invitation has been sent to {email}.</span>
            </>
          ) : (
            <>
              <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>We could not email your invitation just now. Please keep it from the links below.</span>
            </>
          )}
        </p>

        {token && (
          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="gold" size="lg">
              <Link to={`/invitation/${token}`}>View Digital Invitation</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-navy">
              <a href={apiUrl(`/api/invitations/${token}/pass.pdf`)} download target="_blank" rel="noopener">
                <Download aria-hidden />
                Download Invitation
              </a>
            </Button>
          </div>
        )}
        <EventContact event={event} />
      </div>
    </RsvpCard>
  );
}
