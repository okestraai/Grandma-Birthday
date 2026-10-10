/**
 * Compact building blocks for the admin dashboard.
 *
 * The public site uses large, rounded, luxurious controls (components/ui). The dashboard is a
 * work tool: 13–14px text, 32–36px controls on desktop, and 40px touch targets below `md`.
 */
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Checkbox as CheckboxPrimitive, Slot, Switch as SwitchPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Loader2, Minus, Search, X } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export const adminButton = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-navy text-white hover:bg-[#0d2a44]',
        emerald: 'bg-emerald text-white hover:bg-emerald-deep',
        outline: 'border border-navy/15 bg-white text-navy hover:border-navy/30 hover:bg-navy/[0.03]',
        ghost: 'text-navy hover:bg-navy/[0.06]',
        danger: 'bg-error text-white hover:bg-error/90',
        'danger-ghost': 'text-error hover:bg-error/10',
        warning: 'bg-warning text-white hover:bg-warning/90',
      },
      size: {
        xs: 'h-10 px-2 text-xs md:h-7',
        sm: 'h-10 px-2.5 text-[13px] md:h-8',
        md: 'h-10 px-3.5 text-[13px] md:h-9',
        lg: 'h-12 px-5 text-sm',
        icon: 'size-10 md:size-8',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

export interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof adminButton> {
  asChild?: boolean;
  loading?: boolean;
}

export const AButton = forwardRef<HTMLButtonElement, AdminButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, type, ...props }, ref) => {
    const Component = asChild ? Slot.Root : 'button';
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(adminButton({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Component>
    );
  },
);
AButton.displayName = 'AButton';

/** Icon-only button. `label` is required: it becomes the accessible name and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<AdminButtonProps, 'size'> & { label: string; tooltip?: boolean }>(
  ({ label, tooltip = true, variant = 'ghost', children, ...props }, ref) => {
    const button = (
      <AButton ref={ref} size="icon" variant={variant} aria-label={label} {...props}>
        {children}
      </AButton>
    );
    if (!tooltip) return button;
    return <Tip content={label}>{button}</Tip>;
  },
);
IconButton.displayName = 'IconButton';

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-[60] max-w-64 rounded-md bg-navy px-2.5 py-1.5 text-xs leading-snug text-white shadow-lift"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-navy" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const control =
  'w-full rounded-lg border border-navy/15 bg-white text-sm text-charcoal transition-colors placeholder:text-muted/70 hover:border-navy/30 focus:border-gold-rich focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:cursor-not-allowed disabled:bg-cream disabled:text-muted aria-[invalid=true]:border-error aria-[invalid=true]:ring-error/20';

export const AInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, 'h-10 px-3 md:h-9', props.type === 'color' && 'p-1', className)} {...props} />
));
AInput.displayName = 'AInput';

export const ATextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(control, 'min-h-20 px-3 py-2 leading-relaxed', className)} {...props} />
  ),
);
ATextarea.displayName = 'ATextarea';

export const ASelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(control, 'h-10 appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pl-3 pr-8 md:h-9', className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236F6A61' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    }}
    {...props}
  >
    {children}
  </select>
));
ASelect.displayName = 'ASelect';

/**
 * Label + control + hint/error. Give the control `id={htmlFor}` and
 * `aria-describedby={describedBy(htmlFor, error, hint)}`, `aria-invalid={!!error}`.
 */
export function AField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-navy">
        {label}
        {required && (
          <span className="ml-0.5 text-error" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {(error || hint) && (
        <p id={`${htmlFor}-msg`} className={cn('mt-1 text-xs', error ? 'text-error' : 'text-muted')} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, error?: unknown, hint?: unknown): string | undefined {
  return error || hint ? `${id}-msg` : undefined;
}

// ---------------------------------------------------------------------------
// Switch and checkbox
// ---------------------------------------------------------------------------

export interface ASwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
}

export const ASwitch = forwardRef<HTMLButtonElement, ASwitchProps>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    {...props}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-navy/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-emerald',
      // Invisible hit area so the switch is a 40px touch target on phones.
      'before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""] md:before:-inset-y-1',
      className,
    )}
  >
    <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
  </SwitchPrimitive.Root>
));
ASwitch.displayName = 'ASwitch';

/** A switch with a visible label and optional description, as one row. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium text-navy">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="mt-0.5 text-xs text-muted">
            {description}
          </p>
        )}
      </div>
      <ASwitch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-d` : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

export function ACheckbox({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  ...aria
}: {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded border border-navy/35 bg-white text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich disabled:opacity-40 data-[state=checked]:border-navy data-[state=checked]:bg-navy data-[state=indeterminate]:border-navy data-[state=indeterminate]:bg-navy',
        'before:absolute before:-inset-3 before:content-[""] md:before:-inset-1.5',
        className,
      )}
      {...aria}
    >
      <CheckboxPrimitive.Indicator>
        {checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/** Page title (Playfair, ~22px), description and actions. Also sets the document title (noindex). */
export function PageHeader({
  title,
  description,
  actions,
  seoTitle,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  seoTitle?: string;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <SEO title={`${seoTitle ?? title} · Admin`} noindex />
      <div className="min-w-0">
        <h1 className="font-display text-[22px] leading-tight text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-xl border border-navy/10 bg-white', className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-navy/[0.08] px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold text-navy">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'navy' | 'emerald' | 'gold' | 'warning' | 'error';
  loading?: boolean;
}) {
  const toneClass = {
    navy: 'bg-navy/[0.06] text-navy',
    emerald: 'bg-emerald/10 text-emerald',
    gold: 'bg-champagne/70 text-gold-rich',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-navy/10 bg-white p-4">
      {icon && (
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]', toneClass)} aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        {loading ? (
          <span className="mt-1 block h-6 w-16 animate-pulse rounded bg-navy/[0.07]" aria-hidden />
        ) : (
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-navy">{value}</p>
        )}
        {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Search box that reports changes after the user pauses typing. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  delay = 300,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  delay?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChangeRef.current(draft), delay);
    return () => window.clearTimeout(timer);
  }, [draft, value, delay]);

  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChangeRef.current(draft);
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(control, 'h-10 pl-8 pr-8 md:h-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChangeRef.current('');
          }}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-navy md:size-7"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export interface FilterTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Segmented filter (All / Pending / Approved…) with counts. */
export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors md:h-8',
              active ? 'bg-navy text-white' : 'text-navy hover:bg-navy/[0.06]',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-[11px] tabular-nums',
                  active ? 'bg-gold text-navy' : 'bg-navy/[0.07] text-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Wraps search + filters in a responsive row. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-3 flex flex-wrap items-end gap-2', className)}>{children}</div>;
}

/** Sticky bar that appears when rows are selected. */
export function BulkBar({ count, onClear, children, noun = 'selected' }: { count: number; onClear: () => void; children: ReactNode; noun?: string }) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold/50 bg-champagne/40 px-3 py-2 backdrop-blur"
    >
      <span className="text-[13px] font-medium text-navy" aria-live="polite">
        {count} {noun}
      </span>
      <AButton size="sm" variant="ghost" onClick={onClear}>
        Clear
      </AButton>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Small key-value list for detail views. */
export function DetailList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(0,8rem)_1fr] gap-x-4 gap-y-2 text-[13px]', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-charcoal">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
