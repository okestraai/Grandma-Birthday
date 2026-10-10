import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { AdminTestimonial, ModerationStatus, Paginated, TestimonialCounts } from '@birthday/types';
import { api } from '@/lib/api';
import TestimonialsAdminPage from '@/pages/admin/TestimonialsAdminPage';
import { PublicSwitch } from './PublicSwitch';
import { applyTestimonialPatch } from './rules';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function testimonial(id: string, status: ModerationStatus, extra: Partial<AdminTestimonial> = {}): AdminTestimonial {
  return {
    id,
    authorName: `Guest ${id}`,
    fromRsvp: false,
    relationship: 'Friend',
    message: 'Happy seventieth birthday!',
    isFeatured: false,
    photo: null,
    video: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    email: `${id}@example.com`,
    status,
    isPublic: false,
    sortOrder: 0,
    reviewedAt: null,
    reviewedByName: null,
    editedAt: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...extra,
  };
}

describe('PublicSwitch', () => {
  it.each<ModerationStatus>(['PENDING', 'REJECTED'])('is disabled for %s testimonials and explains why', (status) => {
    const onChange = vi.fn();
    render(<PublicSwitch testimonial={testimonial('a', status)} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Show on public website' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription('Approve this testimonial before showing it on the public website.');
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is enabled for APPROVED testimonials and reports the new value', () => {
    const onChange = vi.fn();
    render(<PublicSwitch testimonial={testimonial('a', 'APPROVED')} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Show on public website' });
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('shows an approved, public testimonial as checked', () => {
    render(<PublicSwitch testimonial={testimonial('a', 'APPROVED', { isPublic: true })} onChange={() => {}} showLabel />);
    expect(screen.getByRole('switch', { name: 'Show on public website' })).toBeChecked();
  });
});

describe('testimonial rules', () => {
  it('approving does not publish', () => {
    expect(applyTestimonialPatch(testimonial('a', 'PENDING'), { status: 'APPROVED' })).toMatchObject({ status: 'APPROVED', isPublic: false });
  });
  it('featuring also publishes, rejecting clears both', () => {
    const featured = applyTestimonialPatch(testimonial('a', 'APPROVED'), { isFeatured: true });
    expect(featured).toMatchObject({ isFeatured: true, isPublic: true });
    expect(applyTestimonialPatch(featured, { status: 'REJECTED' })).toMatchObject({ isFeatured: false, isPublic: false });
  });
  it('cannot publish a pending testimonial', () => {
    expect(applyTestimonialPatch(testimonial('a', 'PENDING'), { isPublic: true }).isPublic).toBe(false);
  });
});

describe('TestimonialsAdminPage public switch', () => {
  const items = [testimonial('p', 'PENDING'), testimonial('r', 'REJECTED'), testimonial('ok', 'APPROVED')];
  const page: Paginated<AdminTestimonial> = { items, total: 3, page: 1, pageSize: 25, totalPages: 1 };
  const counts: TestimonialCounts = { all: 3, pending: 1, approved: 1, rejected: 1, featured: 0, public: 0 };

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (path: string) => (path.endsWith('/counts') ? counts : page) as never);
    vi.mocked(api.patch).mockImplementation(async (_path: string, body?: unknown) => ({ ...items[2], ...(body as object) }) as never);
  });
  afterEach(() => vi.clearAllMocks());

  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/testimonials']}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('disables the switch for pending and rejected rows and PATCHes isPublic for approved ones', async () => {
    render(<TestimonialsAdminPage />, { wrapper });
    const table = await screen.findByRole('table');
    const rowFor = (name: string) => within(table).getByText(name).closest('tr')!;

    await waitFor(() => expect(within(rowFor('Guest p')).getByRole('switch')).toBeDisabled());
    expect(within(rowFor('Guest r')).getByRole('switch')).toBeDisabled();
    const approvedSwitch = within(rowFor('Guest ok')).getByRole('switch', { name: 'Show on public website' });
    expect(approvedSwitch).toBeEnabled();

    // Hold the PATCH open to observe the optimistic state.
    let resolvePatch: (value: AdminTestimonial) => void = () => {};
    vi.mocked(api.patch).mockImplementationOnce(() => new Promise((resolve) => (resolvePatch = resolve as never)) as never);

    fireEvent.click(approvedSwitch);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/testimonials/ok', { isPublic: true }));
    await waitFor(() => expect(within(rowFor('Guest ok')).getByRole('switch')).toBeChecked());
    resolvePatch({ ...items[2], isPublic: true });
  });
});
