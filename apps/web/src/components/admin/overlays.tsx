import { useEffect, useState, type ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { useBlocker } from 'react-router';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AButton, ATextarea, AField } from './ui';

/** Compact modal for admin forms. Built on Radix Dialog (focus trap, Escape, labelled). */
export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-navy/50" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-lift focus:outline-none',
            width,
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-navy/10 px-5 py-3.5">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold text-navy">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
              )}
            </div>
            <D.Close className="-mr-2 flex size-10 items-center justify-center rounded-lg text-muted hover:bg-navy/5 hover:text-navy md:size-8" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-navy/10 px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Side sheet for detail views. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  width = 'max-w-xl',
  className,
  bare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
  width?: string;
  className?: string;
  /** No header or padding: children fill the panel (title stays available to screen readers). */
  bare?: boolean;
}) {
  if (bare) {
    return (
      <D.Root open={open} onOpenChange={onOpenChange}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-navy/40" />
          <D.Content
            className={cn('fixed inset-y-0 z-50 w-full shadow-lift focus:outline-none', side === 'right' ? 'right-0' : 'left-0', width, className)}
          >
            <D.Title className="sr-only">{title}</D.Title>
            <D.Description className="sr-only">{description ?? (typeof title === 'string' ? title : 'Panel')}</D.Description>
            {children}
          </D.Content>
        </D.Portal>
      </D.Root>
    );
  }
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-navy/40" />
        <D.Content
          className={cn(
            'fixed inset-y-0 z-50 flex w-full flex-col bg-white shadow-lift focus:outline-none',
            side === 'right' ? 'right-0' : 'left-0',
            width,
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-navy/10 px-5 py-3.5">
            <div className="min-w-0">
              <D.Title className="truncate text-base font-semibold text-navy">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : 'Details'}</D.Description>
              )}
            </div>
            <D.Close className="-mr-2 flex size-10 items-center justify-center rounded-lg text-muted hover:bg-navy/5 hover:text-navy md:size-8" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-navy/10 px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmation for destructive or irreversible actions, in the dashboard's compact style. */
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </AButton>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-charcoal">{description}</div>
    </AdminDialog>
  );
}

/** Confirmation that asks for a reason (revoke invitation, reverse check-in). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  required = false,
  loading,
  onConfirm,
  label = 'Reason',
  placeholder = 'Add a short note for the audit log…',
  minLength,
  maxLength = 300,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  required?: boolean;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  label?: string;
  placeholder?: string;
  /** Minimum trimmed length; applies when required or when something was typed. Match the API DTO. */
  minLength?: number;
  /** Maximum length; match the API DTO. */
  maxLength?: number;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);
  const length = reason.trim().length;
  const error =
    required && length === 0
      ? 'Please give a reason.'
      : minLength && length > 0 && length < minLength
        ? `Use at least ${minLength} characters.`
        : length > maxLength
          ? `Keep it to ${maxLength} characters or fewer.`
          : undefined;
  const invalid = error !== undefined;
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton
            variant="danger"
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (!invalid) onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </AButton>
        </>
      }
    >
      <AField label={label} htmlFor="reason-input" required={required} error={touched ? error : undefined}>
        <ATextarea
          id="reason-input"
          rows={3}
          value={reason}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={touched && invalid}
          aria-describedby={touched && invalid ? 'reason-input-msg' : undefined}
        />
      </AField>
    </AdminDialog>
  );
}

/**
 * Warns before leaving a page with unsaved changes: in-app navigation (router blocker)
 * and tab close / reload (beforeunload). Render the returned element.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  return (
    <Confirm
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title="Leave without saving?"
      description="You have unsaved changes on this page. If you leave now they will be lost."
      confirmLabel="Discard changes"
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  );
}
