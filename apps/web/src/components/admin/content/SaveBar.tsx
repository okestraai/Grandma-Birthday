import { RotateCcw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AButton } from '../ui';

/** Sticky footer for long forms: shows whether there are unsaved changes, with Reset and Save. */
export function SaveBar({
  dirty,
  saving,
  onReset,
  formId,
  saveLabel = 'Save changes',
}: {
  dirty: boolean;
  saving: boolean;
  onReset: () => void;
  /** The <form id> the Save button submits. */
  formId: string;
  saveLabel?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-3 mt-5 flex flex-wrap items-center justify-end gap-2 border-t px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6',
        dirty ? 'border-gold/50 bg-champagne/70' : 'border-navy/10 bg-white/90',
      )}
    >
      <p className="mr-auto text-[13px] text-navy" aria-live="polite">
        {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
      </p>
      <AButton variant="ghost" onClick={onReset} disabled={!dirty || saving}>
        <RotateCcw aria-hidden /> Reset
      </AButton>
      <AButton type="submit" form={formId} variant="emerald" loading={saving} disabled={!dirty}>
        {!saving && <Save aria-hidden />} {saveLabel}
      </AButton>
    </div>
  );
}
