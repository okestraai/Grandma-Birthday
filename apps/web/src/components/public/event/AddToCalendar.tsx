import { CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { downloadIcs, googleCalendarUrl, slugify, type CalendarEvent } from '../calendar';

/** "Add to calendar" (.ics download, works with Apple/Outlook/Google) plus a Google Calendar link. */
export function AddToCalendar({
  event,
  variant = 'outline',
  size = 'md',
  className,
  showGoogle = true,
  tone = 'light',
}: {
  event: CalendarEvent;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  showGoogle?: boolean;
  tone?: 'light' | 'dark';
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          downloadIcs(event, `${slugify(event.title)}.ics`);
          toast.success('Calendar file downloaded', { description: 'Open it to add the celebration to your calendar.' });
        }}
      >
        <CalendarPlus aria-hidden /> Add to calendar
      </Button>
      {showGoogle && (
        <a
          href={googleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'text-sm underline decoration-gold/60 underline-offset-4 transition-colors',
            tone === 'dark' ? 'text-ivory/80 hover:text-gold' : 'text-emerald hover:text-navy',
          )}
        >
          Google Calendar<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
