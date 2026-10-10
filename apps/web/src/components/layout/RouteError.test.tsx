import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { resetChunkReload } from '@/lib/chunk-reload';
import { RouteError } from './RouteError';

let reload: ReturnType<typeof vi.fn>;
const realLocation = window.location;

function renderFailing(error: Error, path = '/story') {
  const Throw = () => {
    throw error;
  };
  const router = createMemoryRouter([{ path: '*', element: <Throw />, errorElement: <RouteError /> }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  sessionStorage.clear();
  resetChunkReload();
  reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, pathname: '/story', reload } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  vi.restoreAllMocks();
});

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://site.test/assets/StoryPage-abc123.js');

describe('RouteError', () => {
  it('reloads once by itself when page code from an old deploy is missing', () => {
    renderFailing(chunkError());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('This page has been updated')).not.toBeInTheDocument();
    expect(Number(sessionStorage.getItem('bp:chunk-reload'))).toBeGreaterThan(0);
  });

  it('shows the refresh message instead of reloading again within 30 seconds', () => {
    sessionStorage.setItem('bp:chunk-reload', String(Date.now() - 5_000));
    renderFailing(new TypeError('Importing a module script failed.'));
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'This page has been updated' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Refresh' }).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the last automatic reload is over 30 seconds old', () => {
    sessionStorage.setItem('bp:chunk-reload', String(Date.now() - 31_000));
    renderFailing(new TypeError('error loading dynamically imported module: /assets/x.js'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads by itself on the party camera page', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, pathname: '/memories/upload/tok', reload } });
    renderFailing(chunkError(), '/memories/upload/tok');
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'This page has been updated' })).toBeInTheDocument();
  });

  it('keeps the usual message for other errors', () => {
    renderFailing(new Error('Cannot read properties of undefined'));
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
