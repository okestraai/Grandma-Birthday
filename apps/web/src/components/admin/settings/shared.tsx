import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AdminSettings, UpdateSettingsRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, useAdminMutation } from '@/lib/admin-api';
import { AButton } from '@/components/admin/ui';

export interface SectionProps {
  settings: AdminSettings;
  /** Reports this section's unsaved state to the page (for the leave-page guard). */
  onDirtyChange: (dirty: boolean) => void;
}

/**
 * PUT /admin/settings with only one section's fields. The response replaces the cached settings.
 * Form errors are reported by the caller (toastError is off), so VALIDATION_FAILED lands on fields.
 */
export function useSaveSettings({ success, onSaved, onError }: { success: string; onSaved: (settings: AdminSettings) => void; onError: (error: unknown) => void }) {
  const queryClient = useQueryClient();
  return useAdminMutation<AdminSettings, UpdateSettingsRequest>({
    mutationFn: (body) => api.put<AdminSettings>('/admin/settings', body),
    success,
    toastError: false,
    invalidate: [adminKeys.storage, adminKeys.dashboard, adminKeys.mediaStats],
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'uploadToken' in data) {
        queryClient.setQueryData(adminKeys.settings, data);
        onSaved(data);
      } else {
        void queryClient.invalidateQueries({ queryKey: adminKeys.settings });
      }
    },
    onError,
  });
}

/** Propagates a section's dirty flag to the page, and clears it on unmount. */
export function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
}

/**
 * Re-initialises a section's form when the server copy of the settings changes
 * (another tab saved, the QR token rotated), but only while it has no unsaved edits.
 */
export function useFollowSettings(settings: AdminSettings, dirty: boolean, resetForm: () => void) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const resetRef = useRef(resetForm);
  resetRef.current = resetForm;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!dirtyRef.current) resetRef.current();
  }, [settings]);
}

/** Save / Discard footer for a settings section. */
export function SectionFooter({ dirty, saving, onDiscard, children }: { dirty: boolean; saving: boolean; onDiscard: () => void; children?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-navy/[0.08] pt-3">
      {children}
      {dirty && (
        <span className="mr-auto text-xs text-muted" aria-live="polite">
          Unsaved changes
        </span>
      )}
      <AButton variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
        Discard
      </AButton>
      <AButton type="submit" variant="emerald" loading={saving} disabled={!dirty}>
        Save
      </AButton>
    </div>
  );
}
