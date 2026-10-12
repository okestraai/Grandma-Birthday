import { ArrowRight } from 'lucide-react';
import type { PublicEvent } from '@birthday/types';
import { directionsHref } from './event-helpers';

/** "Get directions" to an event's venue: Apple Maps on iPhone, Google Maps elsewhere. */
export function DirectionsLink({ event, className }: { event: Pick<PublicEvent, 'mapUrl' | 'latitude' | 'longitude' | 'venueName' | 'address'>; className?: string }) {
  const directions = directionsHref(event);
  return (
    <a
      href={directions.href}
      {...(directions.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={className}
    >
      Get directions <ArrowRight className="size-4" aria-hidden />
      {directions.newTab && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}
