import { CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { downloadIcs, googleCalendarUrl, slugify, type CalendarEvent } from '../calendar';

/**
 * "Add to calendar" (.ics download, works with Apple/Outlook/Google) plus Google Calendar links.
 * Several events go into one .ics file; Google Calendar takes one event per link, so each gets its own.
 */
export function AddToCalendar({
  events,
  filename,
  variant = 'outline',
  size = 'md',
  className,
  showGoogle = true,
  tone = 'light',
}: {
  events: CalendarEvent[];
  /** File name without .ics; defaults to the first event's title. */
  filename?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  showGoogle?: boolean;
  tone?: 'light' | 'dark';
}) {
  if (!events.length) return null;
  const several = events.length > 1;
  const linkClass = cn(
    'text-sm underline decoration-gold/60 underline-offset-4 transition-colors',
    tone === 'dark' ? 'text-ivory/80 hover:text-gold' : 'text-emerald hover:text-navy',
  );
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          downloadIcs(events, `${slugify(filename ?? events[0].title)}.ics`);
          toast.success('Calendar file downloaded', {
            description: several ? `Open it to add all ${events.length} events to your calendar.` : 'Open it to add the celebration to your calendar.',
          });
        }}
      >
        <CalendarPlus aria-hidden /> {several ? 'Add all to calendar' : 'Add to calendar'}
      </Button>
      {showGoogle && !several && (
        <a href={googleCalendarUrl(events[0])} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Google Calendar<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {showGoogle && several && (
        <p className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm', tone === 'dark' ? 'text-ivory/60' : 'text-muted')}>
          <span>Google Calendar:</span>
          {events.map((event) => (
            <a key={event.uid} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {event.label ?? event.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </p>
      )}
    </div>
  );
}
