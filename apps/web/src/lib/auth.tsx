import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router';
import type { AuthSession, AuthUser, LoginRequest, Permission, UserRole } from '@birthday/types';
import { api, isApiError, onSessionExpired, readCookie, request } from './api';
import { PageLoader } from '@/components/ui/spinner';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

async function fetchSession(): Promise<AuthSession | null> {
  // The readable CSRF cookie only exists while a session does, so anonymous visitors
  // on the public site never trigger a /auth/me → 401 → /auth/refresh round trip.
  if (!readCookie('bp_csrf')) return null;
  try {
    return await request<AuthSession>('GET', '/auth/me');
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(
    () =>
      onSessionExpired(() => {
        queryClient.setQueryData(SESSION_QUERY_KEY, null);
      }),
    [queryClient],
  );

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const result = await api.post<AuthSession>('/auth/login', credentials, { skipRefresh: true });
      queryClient.setQueryData(SESSION_QUERY_KEY, result);
      return result.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { skipRefresh: true });
    } finally {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'admin' });
    }
  }, [queryClient]);

  const user = session.data?.user ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: session.isLoading,
      login,
      logout,
      can: (permission) => user?.permissions.includes(permission) ?? false,
    }),
    [user, session.isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Where a user lands after login. Check-in staff only have the check-in screen. */
export function homeFor(role: UserRole): string {
  return role === 'CHECK_IN_STAFF' ? '/admin/check-in' : '/admin';
}

/**
 * Route guard. The API enforces every rule again; this only keeps people out of
 * screens they cannot use.
 */
export function RequireAuth({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const { user, isLoading, can } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader label="Checking your session" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }
  if (permission && !can(permission)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}
