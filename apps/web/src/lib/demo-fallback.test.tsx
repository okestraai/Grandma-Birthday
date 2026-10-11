import type { ReactNode } from 'react';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MotionGlobalConfig } from 'motion/react';
import type { SiteOverview } from '@birthday/types';
import { OfflineBanner } from '@/components/public/OfflineBanner';
import PublicLayout from '@/pages/public/PublicLayout';
import HomePage from '@/pages/public/HomePage';
import FamilyPage from '@/pages/public/FamilyPage';
import * as fixtures from '@/demo/fixtures';
import { ApiError } from './api';
import { isDemoData, withDemoFallback } from './demo-fallback';
import { celebrantName, publicKeys, siteQuery, useInvitation, useInvitePrefill, useTestimonials, useUploadConfig } from './public-api';
import { buildSnapshot } from './snapshot';

MotionGlobalConfig.skipAnimations = true;

const realSite = { ...fixtures.site, isDemo: false, celebrant: { ...fixtures.site.celebrant, fullName: 'Real Celebrant' } } as SiteOverview;
const networkError = () => new TypeError('Failed to fetch');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.stubEnv('VITE_DEMO_FALLBACK', 'true'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('withDemoFallback', () => {
  it('returns live data when the API answers', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(realSite));
    const data = await qc.fetchQuery(siteQuery);
    expect(data.celebrant.fullName).toBe('Real Celebrant');
    expect(isDemoData(data)).toBe(false);
  });

  it('keeps the saved copy over sample data when the API is unreachable', async () => {
    const qc = client();
    qc.setQueryData(publicKeys.site, realSite, { updatedAt: Date.now() - 60_000 });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    await qc.refetchQueries({ queryKey: publicKeys.site });
    const state = qc.getQueryState(publicKeys.site);
    expect(state?.status).toBe('error');
    expect((state?.data as SiteOverview).celebrant.fullName).toBe('Real Celebrant');
  });

  it('falls back to sample data when the API is unreachable and nothing is saved', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    const data = await qc.fetchQuery(siteQuery);
    expect(data.celebrant.fullName).toBe(fixtures.site.celebrant.fullName);
    expect(data.isDemo).toBe(true);
    expect(isDemoData(data)).toBe(true);
  });

  it('also falls back on a gateway error, but not on other answers', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    expect(isDemoData(await qc.fetchQuery(siteQuery))).toBe(true);

    const other = client();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: 'INTERNAL_ERROR', message: 'Boom' }, 500));
    await expect(other.fetchQuery(siteQuery)).rejects.toBeInstanceOf(ApiError);
  });

  it('replaces sample data with real data once the API is back', async () => {
    const qc = client();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    await qc.fetchQuery(siteQuery);
    fetchSpy.mockResolvedValue(json(realSite));
    await qc.refetchQueries({ queryKey: publicKeys.site });
    const data = qc.getQueryData<SiteOverview>(publicKeys.site);
    expect(data?.celebrant.fullName).toBe('Real Celebrant');
    expect(isDemoData(data)).toBe(false);
  });

  it('serves the first page of a paged list', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    const { result } = renderHook(() => useTestimonials(8), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].items.length).toBeGreaterThan(0);
    expect(result.current.hasNextPage).toBe(false);
    expect(isDemoData(result.current.data)).toBe(true);
  });

  it('does nothing when the build turns it off', async () => {
    vi.stubEnv('VITE_DEMO_FALLBACK', 'false');
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    await expect(qc.fetchQuery(siteQuery)).rejects.toBeInstanceOf(TypeError);

    const fetcher = vi.fn().mockRejectedValue(networkError());
    await expect(withDemoFallback({ client: qc, queryKey: publicKeys.timeline }, fetcher)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('sample data and the saved copy', () => {
  it('is never saved, while real data is', async () => {
    const qc = client();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    await qc.fetchQuery(siteQuery);
    expect(buildSnapshot(qc, []).entries).toHaveLength(0);

    fetchSpy.mockResolvedValue(json(realSite));
    await qc.refetchQueries({ queryKey: publicKeys.site });
    const entries = buildSnapshot(qc, []).entries;
    expect(entries).toHaveLength(1);
    expect((entries[0].data as SiteOverview).celebrant.fullName).toBe('Real Celebrant');
  });
});

describe('personal links', () => {
  it('never get sample data', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    const { result } = renderHook(
      () => ({ invitation: useInvitation('abc'), invite: useInvitePrefill('abc'), upload: useUploadConfig('abc') }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => {
      expect(result.current.invitation.isError).toBe(true);
      expect(result.current.invite.isError).toBe(true);
      expect(result.current.upload.isError).toBe(true);
    });
    expect(result.current.invitation.data).toBeUndefined();
    expect(result.current.invite.data).toBeUndefined();
    expect(result.current.upload.data).toBeUndefined();
  });
});

describe('offline banner text', () => {
  it('says which version is showing', () => {
    const { rerender } = render(<OfflineBanner hasData sample retrying={false} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('The celebration server is offline. You’re seeing sample content.');

    rerender(<OfflineBanner hasData retrying={false} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('We can’t reach the celebration server right now. You’re seeing the last saved version.');

    rerender(<OfflineBanner hasData={false} retrying={false} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Retrying…');
  });
});

describe('public pages with the API down', () => {
  function renderPublic(path: string, page: ReactNode) {
    const qc = client();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path={path} element={page} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('shows the sample celebrant on the home page, with the sample-content banner', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    renderPublic('/', <HomePage />);
    expect(await screen.findByText('The celebration server is offline. You’re seeing sample content.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: `${celebrantName(fixtures.site.celebrant)}: celebrating 70 years` })).toBeInTheDocument();
    expect(screen.queryByText(/We’ll be right back/)).not.toBeInTheDocument();
  });

  it('swaps in real data and drops the banner when Retry reaches the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    renderPublic('/', <HomePage />);
    await screen.findByText('The celebration server is offline. You’re seeing sample content.');

    fetchSpy.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.includes('/api/site') ? json(realSite) : json({ code: 'NOT_FOUND', message: 'No' }, 404);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dr. Real Celebrant: celebrating 70 years' })).toBeInTheDocument();
    expect(screen.queryByText(/sample content/)).not.toBeInTheDocument();
  });

  it('shows the sample family', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError());
    renderPublic('/family', <FamilyPage />);
    const member = fixtures.family.members[0];
    expect((await screen.findAllByText(member.fullName)).length).toBeGreaterThan(0);
  });
});
