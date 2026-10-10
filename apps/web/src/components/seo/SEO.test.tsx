import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SEO, SITE_URL } from './SEO';

function renderAt(path: string, ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe('SEO', () => {
  it('renders the title with the site name and a canonical URL for the current path', async () => {
    renderAt('/gallery', <SEO title="Gallery" description="Photos" siteName="Margaret at 70" />);
    await waitFor(() => expect(document.title).toBe('Gallery · Margaret at 70'));
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe(`${SITE_URL}/gallery`);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Photos');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
  });

  it('does not repeat the site name and supports noindex, explicit paths and API images', async () => {
    renderAt('/x', <SEO title="Margaret at 70" siteName="Margaret at 70" path="/" noindex image="/api/media/abc/medium" />);
    await waitFor(() => expect(document.title).toBe('Margaret at 70'));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_URL}/`);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE_URL}/api/media/abc/medium`);
  });

  it('escapes JSON-LD so it cannot break out of the script element', () => {
    const { container } = renderAt('/', <SEO title="Home" jsonLd={{ '@type': 'Person', name: '</script><b>x</b>' }} />);
    const script = container.ownerDocument.querySelector('script[type="application/ld+json"]');
    expect(script?.innerHTML).not.toContain('</script>');
    expect(JSON.parse(script!.textContent!)).toEqual({ '@type': 'Person', name: '</script><b>x</b>' });
  });
});
