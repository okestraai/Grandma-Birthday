import { useQuery } from '@tanstack/react-query';
import { eventQuery } from '@/lib/admin-queries';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { DateCell, useScrollToHash } from '@/components/admin/misc';
import { PageHeader } from '@/components/admin/ui';
import { EventForm } from '@/components/admin/event/EventForm';
import { CategoryAllocations } from '@/components/admin/event/CategoryAllocations';

export default function EventAdminPage() {
  const query = useQuery(eventQuery);
  useScrollToHash(query.isSuccess);

  return (
    <>
      <PageHeader
        title="Event"
        description={
          query.data ? (
            <>
              Date, venue, guest information and RSVP rules. Last saved <DateCell iso={query.data.updatedAt} />.
            </>
          ) : (
            'Date, venue, guest information and RSVP rules.'
          )
        }
      />
      {query.isPending ? (
        <div className="grid gap-4 xl:grid-cols-2" aria-busy>
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-96" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <EventForm event={query.data} besideVenue={<CategoryAllocations />} />
      )}
    </>
  );
}
