import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminPages, adminShell, preloadAdmin, preloadAdminPage } from './chunks';

// Stands in for a dynamic import; the tests only check which chunks are asked for.
const stub = () => Promise.resolve({} as never);

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'bp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('admin chunk preloading', () => {
  it('fetches only the login page when there is no session cookie', () => {
    const login = vi.spyOn(adminShell, 'login').mockImplementation(stub);
    const layout = vi.spyOn(adminShell, 'layout').mockImplementation(stub);
    const guests = vi.spyOn(adminPages, 'guests').mockImplementation(stub);
    preloadAdmin('/admin/guests');
    expect(login).toHaveBeenCalledOnce();
    expect(layout).not.toHaveBeenCalled();
    expect(guests).not.toHaveBeenCalled();
  });

  it('fetches the layout and the page together when signed in', () => {
    document.cookie = 'bp_csrf=token; path=/';
    const layout = vi.spyOn(adminShell, 'layout').mockImplementation(stub);
    const guests = vi.spyOn(adminPages, 'guests').mockImplementation(stub);
    preloadAdmin('/admin/guests/123');
    expect(layout).toHaveBeenCalledOnce();
    expect(guests).toHaveBeenCalledOnce();
  });

  it('maps /admin to the dashboard and ignores unknown paths', () => {
    const dashboard = vi.spyOn(adminPages, '').mockImplementation(stub);
    preloadAdminPage('/admin');
    expect(dashboard).toHaveBeenCalledOnce();
    expect(() => preloadAdminPage('/admin/nothing-here')).not.toThrow();
  });
});
