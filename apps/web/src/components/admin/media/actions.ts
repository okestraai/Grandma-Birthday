import type { AdminMedia, BulkMediaRequest, BulkResult, UpdateMediaRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { affects, useAdminMutation } from '@/lib/admin-api';
import { formatBytes } from '@/lib/utils';

const bulkVerb: Record<BulkMediaRequest['action'], string> = {
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  DELETE: 'Deleted',
  MOVE: 'Moved',
};

export function itemsLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`;
}

/** POST /admin/media/bulk — approve, reject, delete or move several items. */
export function useBulkMedia(
  options: {
    onSuccess?: (result: BulkResult, vars: BulkMediaRequest) => void;
    success?: (result: BulkResult, vars: BulkMediaRequest) => string;
  } = {},
) {
  return useAdminMutation<BulkResult, BulkMediaRequest>({
    mutationFn: (body) => api.post<BulkResult>('/admin/media/bulk', body),
    invalidate: affects.media,
    success: options.success ?? ((result, vars) => `${bulkVerb[vars.action]} ${itemsLabel(result.affected)}`),
    onSuccess: options.onSuccess,
  });
}

/** PATCH /admin/media/:id */
export function useUpdateMedia(
  options: { success?: string | false | ((media: AdminMedia, vars: { id: string; body: UpdateMediaRequest }) => string); onSuccess?: (media: AdminMedia) => void; toastError?: boolean; onError?: (error: unknown) => void } = {},
) {
  return useAdminMutation<AdminMedia, { id: string; body: UpdateMediaRequest }>({
    mutationFn: ({ id, body }) => api.patch<AdminMedia>(`/admin/media/${id}`, body),
    invalidate: affects.media,
    success: options.success ?? 'Saved',
    toastError: options.toastError,
    onSuccess: (media) => options.onSuccess?.(media),
    onError: (error) => options.onError?.(error),
  });
}

/** DELETE /admin/media/:id */
export function useDeleteMedia(options: { onSuccess?: (id: string) => void } = {}) {
  return useAdminMutation<void, string>({
    mutationFn: (id) => api.delete(`/admin/media/${id}`),
    invalidate: affects.media,
    success: 'Deleted',
    onSuccess: (_, id) => options.onSuccess?.(id),
  });
}

export const sourceLabel: Record<AdminMedia['source'], string> = {
  ADMIN: 'Admin upload',
  GUEST_UPLOAD: 'Guest upload',
  TESTIMONIAL: 'Testimonial',
};

export function dimensions(media: Pick<AdminMedia, 'width' | 'height'>): string | null {
  return media.width && media.height ? `${media.width} × ${media.height}` : null;
}

/** formatBytes without a trailing ".0" ("10 GB", "6.2 GB"). */
export function formatSize(bytes: number): string {
  return formatBytes(bytes).replace(/\.0 /, ' ');
}
