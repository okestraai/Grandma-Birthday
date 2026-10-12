import { useSearchParams } from 'react-router';
import type { ApiErrorCode, SiteOverview } from '@birthday/types';
import { PageHero } from '@/components/public/section';
import { InvalidInviteNotice, ClosedNotice, InviteOnlyNotice } from '@/components/public/rsvp/notices';
import { RsvpCard, RsvpSkeleton } from '@/components/public/rsvp/parts';
import { RsvpForm } from '@/components/public/rsvp/RsvpForm';
import { SEO } from '@/components/seo/SEO';
import { ErrorState } from '@/components/ui/states';
import { isApiError } from '@/lib/api';
import { siteNameOf, useInvitePrefill, useRsvpForm, useSite } from '@/lib/public-api';
import { formatEventDate } from '@/lib/utils';
import { celebrationDates } from '@/components/public/event/event-helpers';

const INVALID_INVITE: ApiErrorCode[] = ['INVITATION_NOT_FOUND', 'INVITATION_REVOKED', 'INVITATION_EXPIRED', 'NOT_FOUND'];

function describe(site: SiteOverview | undefined): string | undefined {
  if (!site) return undefined;
  const { celebration, events } = site;
  const where = events.length === 1 ? ` at ${events[0].venueName}` : '';
  return `Kindly reply to the invitation to ${celebration.name} on ${celebrationDates(site)}${where}.`;
}

export default function RsvpPage() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite')?.trim() || null;

  const site = useSite();
  const formQuery = useRsvpForm();
  const invite = useInvitePrefill(inviteToken);

  const event = site.data?.celebration;
  const config = formQuery.data;
  const deadline = config?.availability.open ? config.availability.deadline : null;

  let content;
  if (formQuery.isPending || (inviteToken && invite.isPending)) {
    content = <RsvpSkeleton />;
  } else if (!config) {
    content = (
      <RsvpCard>
        <ErrorState error={formQuery.error} onRetry={() => void formQuery.refetch()} title="We could not load the RSVP form" />
      </RsvpCard>
    );
  } else if (!config.availability.open) {
    content = <ClosedNotice availability={config.availability} event={event} timezone={event?.timezone} />;
  } else if (inviteToken && invite.isError && (!invite.data || (isApiError(invite.error) && INVALID_INVITE.includes(invite.error.code)))) {
    // A failed refetch (say, the server is down) keeps the form and what was typed on screen.
    content = isApiError(invite.error) && INVALID_INVITE.includes(invite.error.code) ? (
      <InvalidInviteNotice code={invite.error.code} allowOpen={config.availability.mode === 'OPEN'} event={event} />
    ) : (
      <RsvpCard>
        <ErrorState error={invite.error} onRetry={() => void invite.refetch()} title="We could not load your invitation" />
      </RsvpCard>
    );
  } else if (config.availability.mode === 'INVITE_ONLY' && !inviteToken) {
    content = <InviteOnlyNotice event={event} />;
  } else {
    content = <RsvpForm key={inviteToken ?? 'open'} config={config} site={site.data} prefill={invite.data ?? null} inviteToken={inviteToken} />;
  }

  return (
    <>
      <SEO title="RSVP" description={describe(site.data)} siteName={siteNameOf(site.data)} noindex={Boolean(inviteToken)} />
      <PageHero
        eyebrow="RSVP"
        title="An invitation to celebrate"
        description={
          deadline
            ? `Kindly reply by ${formatEventDate(deadline, event?.timezone)}.`
            : 'Your reply helps the family prepare a warm welcome for every guest.'
        }
        className="pb-28 sm:pb-32"
      />
      <section aria-label="Your reply" className="relative bg-cream pb-20 sm:pb-28">
        <div className="container-page -mt-16 sm:-mt-20">{content}</div>
      </section>
    </>
  );
}
