import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AdminTestimonial, BulkResult, BulkTestimonialRequest, Paginated, UpdateTestimonialRequest } from '@birthday/types';
import { api, errorMessage, isApiError } from '@/lib/api';
import { adminKeys, affects, useAdminMutation } from '@/lib/admin-api';
import { applyTestimonialPatch, bulkActionPatch, NOT_APPROVED_HINT } from './rules';

export interface TestimonialPatchVars {
  id: string;
  patch: UpdateTestimonialRequest;
}

type Snapshot = [QueryKey, unknown][];

function isPage(data: unknown): data is Paginated<AdminTestimonial> {
  return !!data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items);
}

function successMessage(patch: UpdateTestimonialRequest): string {
  if (patch.status === 'APPROVED') return 'Approved. It is not public until you switch it on.';
  if (patch.status === 'REJECTED') return 'Rejected';
  if (patch.status === 'PENDING') return 'Moved back to pending';
  if (patch.isFeatured === true) return 'Featured on the public website';
  if (patch.isFeatured === false) return 'No longer featured';
  if (patch.isPublic === true) return 'Now shown on the public website';
  if (patch.isPublic === false) return 'Hidden from the public website';
  return 'Testimonial saved';
}

function errorText(error: unknown): string {
  return isApiError(error, 'TESTIMONIAL_NOT_APPROVED') ? NOT_APPROVED_HINT : errorMessage(error);
}

/**
 * Testimonial mutations. Moderation changes are optimistic: every cached list page is patched
 * with the server's rules, and restored if the request fails.
 */
export function useTestimonialMutations(options: { onDeleted?: (id: string) => void; onBulkDone?: () => void } = {}) {
  const queryClient = useQueryClient();

  const snapshotAndPatch = async (ids: Set<string>, patch: UpdateTestimonialRequest): Promise<Snapshot> => {
    await queryClient.cancelQueries({ queryKey: adminKeys.testimonials });
    const snapshot = queryClient.getQueriesData({ queryKey: adminKeys.testimonials });
    for (const [key, data] of snapshot) {
      if (!isPage(data)) continue;
      queryClient.setQueryData<Paginated<AdminTestimonial>>(key, {
        ...data,
        items: data.items.map((item) => (ids.has(item.id) ? applyTestimonialPatch(item, patch) : item)),
      });
    }
    return snapshot;
  };

  const restore = (snapshot: Snapshot | undefined) => snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));

  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.testimonials }),
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard }),
    ]);

  const update = useMutation<AdminTestimonial, unknown, TestimonialPatchVars, { snapshot: Snapshot }>({
    mutationFn: ({ id, patch }) => api.patch<AdminTestimonial>(`/admin/testimonials/${id}`, patch),
    onMutate: async ({ id, patch }) => ({ snapshot: await snapshotAndPatch(new Set([id]), patch) }),
    onError: (error, _vars, context) => {
      restore(context?.snapshot);
      toast.error(errorText(error));
    },
    onSuccess: (data, { patch }) => {
      for (const [key, cached] of queryClient.getQueriesData({ queryKey: adminKeys.testimonials })) {
        if (isPage(cached)) {
          queryClient.setQueryData<Paginated<AdminTestimonial>>(key, {
            ...cached,
            items: cached.items.map((item) => (item.id === data.id ? data : item)),
          });
        }
      }
      toast.success(successMessage(patch));
    },
    onSettled: settle,
  });

  const bulk = useMutation<BulkResult, unknown, BulkTestimonialRequest, { snapshot: Snapshot } | undefined>({
    mutationFn: (body) => api.post<BulkResult>('/admin/testimonials/bulk', body),
    onMutate: async ({ ids, action }) => {
      const patch = bulkActionPatch(action);
      if (!patch) return undefined;
      return { snapshot: await snapshotAndPatch(new Set(ids), patch) };
    },
    onError: (error, _vars, context) => {
      restore(context?.snapshot);
      toast.error(errorText(error));
    },
    onSuccess: (result, { action }) => {
      toast.success(`${result.affected} ${action === 'DELETE' ? 'deleted' : 'updated'}`);
      options.onBulkDone?.();
    },
    onSettled: settle,
  });

  const remove = useAdminMutation<void, string>({
    mutationFn: (id) => api.delete(`/admin/testimonials/${id}`),
    invalidate: affects.testimonials,
    success: 'Testimonial deleted',
    onSuccess: (_data, id) => options.onDeleted?.(id),
  });

  /** Pending state for one row, so only its controls show as busy. */
  const isUpdating = (id: string) => update.isPending && update.variables?.id === id;

  return { update, bulk, remove, isUpdating, patch: (id: string, patch: UpdateTestimonialRequest) => update.mutate({ id, patch }) };
}
