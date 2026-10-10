import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AuthProvider } from '@/lib/auth';

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

/** Renders routes inside the app's providers (query client, auth) with a memory router. */
export function renderRoutes(routes: RouteObject[], initialPath: string, element?: ReactElement) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const client = newQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <AuthProvider>{element ?? <RouterProvider router={router} />}</AuthProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, client };
}
