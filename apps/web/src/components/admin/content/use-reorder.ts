import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';

/**
 * Reorders a cached list optimistically, sends PUT `path` { ids }, and rolls back on error.
 * Call `mutate(nextList)` with the whole list in its new order.
 */
export function useOptimisticReorder<T extends { id: string; sortOrder: number }>(queryKey: QueryKey, path: string) {
  const queryClient = useQueryClient();
  const mutationKey = [...queryKey, 'reorder'];
  return useMutation<void, unknown, T[], { previous: T[] | undefined }>({
    mutationKey,
    mutationFn: (items) => api.put<void>(path, { ids: items.map((item) => item.id) }),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T[]>(queryKey);
      queryClient.setQueryData<T[]>(
        queryKey,
        items.map((item, index) => ({ ...item, sortOrder: index })),
      );
      return { previous };
    },
    onError: (error, _items, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(`Could not save the new order. ${errorMessage(error)}`);
    },
    onSettled: async () => {
      // Refetch once the last of a quick run of moves has finished.
      if (queryClient.isMutating({ mutationKey }) <= 1) await queryClient.invalidateQueries({ queryKey });
    },
  });
}
