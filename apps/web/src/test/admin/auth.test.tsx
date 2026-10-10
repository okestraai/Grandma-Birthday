import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthSession } from '@birthday/types';
import { ApiError } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import LoginPage from '@/pages/admin/LoginPage';
import { renderRoutes } from './utils';

const { request, post } = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    request,
    api: { ...actual.api, post },
  };
});

const unauthenticated = () => Promise.reject(new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Not signed in' }));

function session(role: AuthSession['user']['role'], permissions: AuthSession['user']['permissions']): AuthSession {
  return {
    user: { id: 'u1', email: 'staff@demo.local', name: 'Door Staff', role, permissions },
    accessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

const loginRoutes = [
  { path: '/admin/login', element: <LoginPage /> },
  { path: '/admin', element: <p>Dashboard home</p> },
  { path: '/admin/guests', element: <p>Guests page</p> },
  { path: '/admin/check-in', element: <p>Check-in page</p> },
];

beforeEach(() => {
  request.mockReset();
  post.mockReset();
  // A readable CSRF cookie means "a session may exist", so the provider asks /auth/me.
  document.cookie = 'bp_csrf=test-token; path=/';
});

describe('LoginPage', () => {
  it('validates the form before calling the API', async () => {
    request.mockImplementation(unauthenticated);
    renderRoutes(loginRoutes, '/admin/login');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'That email and password do not match'],
    ['ACCOUNT_LOCKED', 423, 'Account locked until 8:15 PM'],
    ['ACCOUNT_DISABLED', 403, 'This account has been disabled'],
    ['RATE_LIMITED', 429, 'Too many sign-in attempts'],
  ] as const)('shows a clear message for %s', async (code, status, text) => {
    request.mockImplementation(unauthenticated);
    post.mockRejectedValue(new ApiError(status, { code, message: code === 'ACCOUNT_LOCKED' ? 'Account locked until 8:15 PM' : 'Server message' }));
    renderRoutes(loginRoutes, '/admin/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email'), 'admin@demo.local');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'admin@demo.local', password: 'wrong-password' }, { skipRefresh: true });
  });

  it('maps VALIDATION_FAILED details onto the fields', async () => {
    request.mockImplementation(unauthenticated);
    post.mockRejectedValue(new ApiError(400, { code: 'VALIDATION_FAILED', message: 'Invalid', details: { email: ['Email is not allowed'] } }));
    renderRoutes(loginRoutes, '/admin/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'admin@demo.local');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email is not allowed')).toBeInTheDocument();
  });

  it('redirects to ?next= after a successful login', async () => {
    request.mockImplementation(unauthenticated);
    post.mockResolvedValue(session('ADMIN', ['guests:manage', 'dashboard:read']));
    renderRoutes(loginRoutes, '/admin/login?next=%2Fadmin%2Fguests');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'admin@demo.local');
    await user.type(screen.getByLabelText('Password'), 'Celebrate70!Demo');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Guests page')).toBeInTheDocument();
  });

  it('ignores an off-site ?next= and sends staff to check-in', async () => {
    request.mockImplementation(unauthenticated);
    post.mockResolvedValue(session('CHECK_IN_STAFF', ['checkin:use']));
    renderRoutes(loginRoutes, '/admin/login?next=%2F%2Fevil.example');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'staff@demo.local');
    await user.type(screen.getByLabelText('Password'), 'Celebrate70!Demo');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Check-in page')).toBeInTheDocument();
  });

  it('redirects away when already signed in', async () => {
    request.mockResolvedValue(session('ADMIN', ['dashboard:read']));
    renderRoutes(loginRoutes, '/admin/login');
    expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  const guarded = [
    { path: '/admin/login', element: <p>Login screen</p> },
    { path: '/admin/check-in', element: <p>Check-in page</p> },
    {
      path: '/admin/guests',
      element: (
        <RequireAuth permission="guests:manage">
          <p>Guests page</p>
        </RequireAuth>
      ),
    },
  ];

  it('redirects to login with ?next= when logged out', async () => {
    request.mockImplementation(unauthenticated);
    const { router } = renderRoutes(guarded, '/admin/guests?q=ada');
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/admin/guests?q=ada')}`));
  });

  it('sends users without the permission to their home screen', async () => {
    request.mockResolvedValue(session('CHECK_IN_STAFF', ['checkin:use']));
    renderRoutes(guarded, '/admin/guests');
    expect(await screen.findByText('Check-in page')).toBeInTheDocument();
    expect(screen.queryByText('Guests page')).not.toBeInTheDocument();
  });

  it('renders the page when the user has the permission', async () => {
    request.mockResolvedValue(session('ADMIN', ['guests:manage']));
    renderRoutes(guarded, '/admin/guests');
    expect(await screen.findByText('Guests page')).toBeInTheDocument();
  });
});

describe('AuthProvider', () => {
  it('does not call the API for visitors without a session cookie', async () => {
    document.cookie = 'bp_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    renderRoutes([{ path: '/admin/guests', element: <RequireAuth permission="guests:manage"><p>Guests page</p></RequireAuth> }, { path: '/admin/login', element: <p>Login screen</p> }], '/admin/guests');
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
