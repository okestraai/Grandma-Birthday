import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { AdminSettings } from '@birthday/types';
import { api } from '@/lib/api';
import { BrandingSection } from './BrandingSection';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const settings = {
  primaryColor: '#112233',
  secondaryColor: '#445566',
  logoMediaId: null,
  heroMediaId: null,
  ogImageMediaId: null,
  logo: null,
  hero: null,
  ogImage: null,
  siteTitle: 'Mama at 70',
  siteDescription: null,
} as unknown as AdminSettings;

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BrandingSection settings={settings} onDirtyChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('BrandingSection', () => {
  it('explains what branding changes on the public site', () => {
    renderSection();
    expect(screen.getByText('What branding changes on the public site')).toBeInTheDocument();
    expect(screen.getByText(/the picture shown when someone shares the site link on WhatsApp, Facebook or X/)).toBeInTheDocument();
  });

  it('resets each colour, or both, to the defaults; saving sends them', async () => {
    vi.mocked(api.put).mockResolvedValue({ ...settings, uploadToken: 't' } as never);
    renderSection();
    const primary = screen.getByRole('textbox', { name: 'Primary colour' });
    const accent = screen.getByRole('textbox', { name: 'Accent colour' });

    fireEvent.click(screen.getByRole('button', { name: /Reset primary colour to default/ }));
    expect(primary).toHaveValue('#071A2B');
    expect(accent).toHaveValue('#445566');

    fireEvent.change(primary, { target: { value: '#000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset colours to default' }));
    expect(primary).toHaveValue('#071A2B');
    expect(accent).toHaveValue('#D6B36A');
    expect(screen.getByRole('button', { name: 'Reset colours to default' })).toBeDisabled();

    // Reset only fills the form: nothing is saved until Save.
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/settings', expect.objectContaining({ primaryColor: '#071A2B', secondaryColor: '#D6B36A' })),
    );
  });
});
