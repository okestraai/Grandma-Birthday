import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MotionGlobalConfig } from 'motion/react';
import type { PublicMedia, SiteOverview } from '@birthday/types';
import { ErrorState, ServerDownNoticeContext } from '@/components/ui/states';
import { MediaImage } from '@/components/public/media';
import { ApiError, isServerUnreachable } from '@/lib/api';
import { publicKeys } from '@/lib/public-api';
import PublicLayout from './PublicLayout';
import HomePage from './HomePage';

MotionGlobalConfig.skipAnimations = true;

const site = {
  event: {
    name: 'Margaret at Seventy',
    startsAt: '2026-11-21T16:00:00.000Z',
    endsAt: '2026-11-21T22:00:00.000Z',
    timezone: 'Africa/Lagos',
    venueName: 'The Emerald Ballroom',
    city: 'Lagos',
    rsvp: { open: true, mode: 'OPEN', deadline: null, closedReason: null },
  },
  celebrant: { fullName: 'Margaret Okonkwo', preferredName: 'Margaret', honorific: 'Dr.', age: 70, portrait: null },
  branding: { siteTitle: null, hero: null, logo: null },
  features: {},
  isDemo: false,
} as unknown as SiteOverview;

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderLayout(qc: QueryClient, page = <p>Page body</p>) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/story']}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="story" element={page} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('isServerUnreachable', () => {
  it('counts network failures and gateway errors, not other answers', () => {
    expect(isServerUnreachable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isServerUnreachable(new ApiError(502, {}))).toBe(true);
    expect(isServerUnreachable(new ApiError(503, {}))).toBe(true);
    expect(isServerUnreachable(new ApiError(504, {}))).toBe(true);
    expect(isServerUnreachable(new ApiError(500, {}))).toBe(false);
    expect(isServerUnreachable(new ApiError(404, {}))).toBe(false);
    expect(isServerUnreachable(new Error('x'))).toBe(false);
  });
});

describe('offline banner', () => {
  it('appears on a network error with saved data, and goes when the server is back', async () => {
    const qc = client();
    qc.setQueryData(publicKeys.site, site, { updatedAt: Date.now() - 60_000 });
    void qc.invalidateQueries({ queryKey: publicKeys.site, refetchType: 'none' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderLayout(qc);

    const banner = await screen.findByText(/We can’t reach the celebration server right now/);
    expect(banner).toHaveTextContent('You’re seeing the last saved version.');
    expect(screen.getByText('Page body')).toBeInTheDocument();

    fetchSpy.mockResolvedValue(new Response(JSON.stringify(site), { status: 200, headers: { 'content-type': 'application/json' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText(/We can’t reach the celebration server/)).not.toBeInTheDocument());
  });

  it('says it is retrying when nothing is saved, and retries when the browser comes back online', async () => {
    const qc = client();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502, statusText: 'Bad Gateway' }));
    renderLayout(qc);
    expect(await screen.findByText(/Retrying…/)).toBeInTheDocument();

    const calls = fetchSpy.mock.calls.length;
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(site), { status: 200, headers: { 'content-type': 'application/json' } }));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.queryByText(/Retrying…/)).not.toBeInTheDocument());
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(calls);
  });

  it('stays hidden for a 4xx answer', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'No' }), { status: 404, headers: { 'content-type': 'application/json' } }));
    renderLayout(qc);
    await waitFor(() => expect(qc.getQueryState(publicKeys.site)?.status).toBe('error'));
    expect(screen.queryByText(/We can’t reach the celebration server/)).not.toBeInTheDocument();
  });
});

describe('home page with no data', () => {
  it('shows the branded fallback with the 70 and a retry button', async () => {
    const qc = client();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'A 70th birthday celebration' })).toBeInTheDocument();
    expect(screen.getByText(/We’ll be right back — the celebration details are loading/)).toBeInTheDocument();
    expect(screen.getByTestId('seventy-numerals')).toHaveTextContent('70');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('shows the calm notice for an unreachable server inside the public site only', () => {
    const { rerender } = render(
      <ServerDownNoticeContext value>
        <ErrorState error={new TypeError('Failed to fetch')} onRetry={() => {}} title="We could not load the timeline" />
      </ServerDownNoticeContext>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('We’ll be right back');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    rerender(<ErrorState error={new TypeError('Failed to fetch')} title="We could not load the timeline" />);
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load the timeline');

    rerender(
      <ServerDownNoticeContext value>
        <ErrorState error={new ApiError(500, { message: 'Boom' })} title="We could not load the timeline" />
      </ServerDownNoticeContext>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });
});

describe('MediaImage', () => {
  const media = {
    id: 'm1',
    kind: 'PHOTO',
    width: 800,
    height: 1000,
    altText: 'Portrait',
    caption: null,
    urls: { thumb: '/api/media/m1/thumb', medium: '/api/media/m1/medium', original: '/api/media/m1/original' },
  } as unknown as PublicMedia;

  it('swaps a broken image for the placeholder and keeps its size', () => {
    render(<MediaImage media={media} variant="thumb" className="aspect-[4/5] w-full" fallbackLabel="MO" />);
    const img = screen.getByRole('img', { name: 'Portrait' });
    const before = { width: img.getAttribute('width'), height: img.getAttribute('height'), className: img.className };
    fireEvent.error(img);
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(img.getAttribute('src')!)).toContain('>MO</text>');
    expect(img).not.toHaveAttribute('srcset');
    expect({ width: img.getAttribute('width'), height: img.getAttribute('height'), className: img.className }).toEqual(before);
  });
});
