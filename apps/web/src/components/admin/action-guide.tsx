import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionGuideRow {
  /** The button or control name exactly as it appears in the UI. */
  action: string;
  does: ReactNode;
  sees: ReactNode;
}

const storageKey = (page: string) => `bp.admin.action-guide.${page}`;

function readOpen(page: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(page)) === 'open';
  } catch {
    return false;
  }
}

function writeOpen(page: string, open: boolean): void {
  try {
    if (open) window.localStorage.setItem(storageKey(page), 'open');
    else window.localStorage.removeItem(storageKey(page));
  } catch {
    // Private mode or blocked storage: the guide still works, it just won't remember.
  }
}

/**
 * "What these actions mean": a collapsible table explaining a page's buttons in plain English.
 * Closed by default; remembers open/closed per page in this browser.
 */
export function ActionGuide({
  page,
  rows,
  title = 'What these actions mean',
  className,
}: {
  /** Stable key for remembering open/closed, e.g. "testimonials". */
  page: string;
  rows: ActionGuideRow[];
  title?: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(() => readOpen(page));
  const toggle = () => {
    setOpen((was) => {
      writeOpen(page, !was);
      return !was;
    });
  };

  return (
    <section className={cn('mb-4 rounded-xl border border-navy/10 bg-white', className)} aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={toggle}
        className="flex h-10 w-full items-center gap-2 rounded-xl px-4 text-left text-[13px] font-medium text-navy hover:bg-cream/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-rich"
      >
        <CircleHelp className="size-4 shrink-0 text-emerald" aria-hidden />
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <div id={`${id}-body`} hidden={!open} className="border-t border-navy/[0.08] px-4 pb-3 pt-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px] leading-snug">
            <thead>
              <tr className="border-b border-navy/10 text-xs text-muted">
                <th scope="col" className="w-40 py-2 pr-3 font-medium">
                  Action
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  What it does
                </th>
                <th scope="col" className="w-56 py-2 font-medium">
                  Who sees the result
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.action} className="border-b border-navy/[0.06] align-top last:border-0">
                  <th scope="row" className="py-2 pr-3 font-medium text-navy">
                    {row.action}
                  </th>
                  <td className="py-2 pr-3 text-charcoal">{row.does}</td>
                  <td className="py-2 text-muted">{row.sees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
