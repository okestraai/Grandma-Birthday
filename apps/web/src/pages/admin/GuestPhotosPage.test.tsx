import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { AdminMedia, MediaModerationStats, Paginated } from '@birthday/types';
import { api } from '@/lib/api';
import GuestPhotosPage from './GuestPhotosPage';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/components/seo/SEO', () => ({ SEO: () => null }));

const GB = 1024 ** 3;

function media(id: string, uploaderName: string | null, message: string | null = null): AdminMedia {
  return {
    id,
    kind: 'PHOTO',
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    caption: null,
    altText: null,
    urls: { thumb: `/api/media/${id}/thumb`, medium: `/api/media/${id}/medium`, original: `/api/media/${id}/original` },
    source: 'GUEST_UPLOAD',
    status: 'PENDING',
    originalFilename: `${id}.jpg`,
    sizeBytes: 2_000_000,
    storedBytes: 2_400_000,
    albumId: null,
    albumTitle: null,
    sortOrder: 0,
    uploaderName,
    uploaderMessage: message,
    uploadedByName: null,
    reviewedAt: null,
    createdAt: '2026-09-20T18:30:00.000Z',
  };
}

const stats: MediaModerationStats = {
  guestUploads: { pending: 2, approved: 14, rejected: 1 },
  all: { pending: 2, approved: 120, rejected: 3 },
  storage: {
    quotaBytes: 10 * GB,
    usedBytes: 6.2 * GB,
    remainingBytes: 3.8 * GB,
    percentUsed: 62,
    level: 'OK',
    photoCount: 130,
    videoCount: 4,
    photoBytes: 4 * GB,
    videoBytes: 2 * GB,
    otherBytes: 0.2 * GB,
  },
};

const page: Paginated<AdminMedia> = {
  items: [media('m1', 'Ada Obi', 'Happy birthday, Mama!'), media('m2', null)],
  total: 2,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/guest-photos']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<GuestPhotosPage />, { wrapper });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((path: string) => {
    if (path === '/admin/media/stats') return Promise.resolve(stats as never);
    if (path === '/admin/media') return Promise.resolve(page as never);
    if (path === '/admin/albums') return Promise.resolve([] as never);
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
  post.mockResolvedValue({ affected: 1 } as never);
});

describe('GuestPhotosPage', () => {
  it('renders the moderation summary from the stats endpoint', async () => {
    renderPage();
    expect(await screen.findByText('Pending: 2 · Approved: 14 · Rejected: 1 · Storage: 6.2 GB / 10 GB')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/admin/media', expect.objectContaining({ source: 'GUEST_UPLOAD', status: 'PENDING' }));
  });

  it('shows bulk actions only after selecting rows, and approves the selected ids', async () => {
    renderPage();
    // Table and mobile cards both render in jsdom, so names appear twice.
    await screen.findAllByText('Ada Obi');

    expect(screen.queryByRole('button', { name: /approve selected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject selected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select photo from Ada Obi' })[0]);

    const approve = await screen.findByRole('button', { name: /approve selected/i });
    expect(approve).toBeEnabled();
    expect(screen.getByRole('button', { name: /reject selected/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeEnabled();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(approve);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/media/bulk', { ids: ['m1'], action: 'APPROVE' }));
  });

  it('selects every row on the page with the header checkbox', async () => {
    post.mockResolvedValue({ affected: 2 } as never);
    renderPage();
    await screen.findAllByText('Ada Obi');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(await screen.findByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/media/bulk', { ids: ['m1', 'm2'], action: 'APPROVE' }));
  });

  it('approves from the preview with the A key and advances to the next item', async () => {
    renderPage();
    await screen.findAllByText('Ada Obi');

    fireEvent.click(screen.getAllByRole('button', { name: 'Preview photo from Ada Obi' })[0]);
    expect(await screen.findByText('Item 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText(/Happy birthday, Mama!/).length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/media/bulk', { ids: ['m1'], action: 'APPROVE' }));
    // The approved item leaves the Pending list, so the preview moves on to the next one.
    expect(await screen.findByText('Item 1 of 1')).toBeInTheDocument();
  });
});
