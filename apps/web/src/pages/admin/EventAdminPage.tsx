import { useQuery } from '@tanstack/react-query';
import { celebrationQuery } from '@/lib/admin-queries';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { DateCell, useScrollToHash } from '@/components/admin/misc';
import { PageHeader } from '@/components/admin/ui';
import { ActionGuide } from '@/components/admin/action-guide';
import { EVENT_ACTIONS } from '@/components/admin/action-guide-content';
import { CelebrationForm } from '@/components/admin/event/CelebrationForm';
import { CategoryAllocations } from '@/components/admin/event/CategoryAllocations';
import { EventsSection } from '@/components/admin/event/EventsSection';

export default function EventAdminPage() {
  const query = useQuery(celebrationQuery);
  useScrollToHash(query.isSuccess);

  return (
    <>
      <PageHeader
        title="Events"
        description={
          query.data ? (
            <>
              Each event’s date and venue, and the RSVP rules for the whole celebration. Last saved <DateCell iso={query.data.updatedAt} />.
            </>
          ) : (
            'Each event’s date and venue, and the RSVP rules for the whole celebration.'
          )
        }
      />
      <ActionGuide page="events" rows={EVENT_ACTIONS} />
      {query.isPending ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-64" />
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-[480px]" />
            <Skeleton className="h-96" />
          </div>
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-6">
          <EventsSection timeZone={query.data.timezone} />
          <section aria-labelledby="celebration-heading">
            <h2 id="celebration-heading" className="mb-3 font-display text-lg text-navy">
              Celebration
            </h2>
            <CelebrationForm celebration={query.data} besideRsvp={<CategoryAllocations />} />
          </section>
        </div>
      )}
    </>
  );
}
