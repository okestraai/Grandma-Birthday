import { createContext, useContext, type ReactNode } from 'react';
import { AlertTriangle, CloudOff, Inbox, RotateCcw } from 'lucide-react';
import { errorMessage, isServerUnreachable } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * When true (the public layout sets it), an ErrorState for an unreachable server shows the calm
 * "we'll be right back" notice instead of an error. Admin screens keep the plain error.
 */
export const ServerDownNoticeContext = createContext(false);

export function ServerDownNotice({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-cream/60 px-6 py-9 text-center', className)}>
      <CloudOff className="size-6 text-gold-rich" aria-hidden />
      <div>
        <p className="font-display text-lg text-navy">We’ll be right back</p>
        <p className="mt-1 text-sm text-muted">We can’t reach the celebration server just now. This part will appear as soon as it’s back.</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="text-navy" onClick={onRetry}>
          <RotateCcw aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We could not load this', className }: { error: unknown; onRetry?: () => void; title?: string; className?: string }) {
  const friendly = useContext(ServerDownNoticeContext);
  if (friendly && isServerUnreachable(error)) return <ServerDownNotice onRetry={onRetry} className={className} />;
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-2xl border border-error/20 bg-error/5 px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-7 text-error" aria-hidden />
      <div>
        <p className="font-medium text-navy">{title}</p>
        <p className="mt-1 text-sm text-muted">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, icon, action, className }: { title: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed border-navy/15 px-6 py-12 text-center', className)}>
      <span className="text-gold-rich" aria-hidden>{icon ?? <Inbox className="size-7" />}</span>
      <div>
        <p className="font-medium text-navy">{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
