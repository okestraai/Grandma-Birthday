import { useEffect, useState } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { PageLoader } from '@/components/ui/spinner';
import { canReloadForUpdate, isChunkError, reloadForUpdate, reloadingForUpdate } from '@/lib/chunk-reload';
import { healStaleDevBundle } from '@/lib/dev-heal';

/** Shown when a route fails to render or a lazy chunk fails to load. */
export function RouteError() {
  const error = useRouteError();
  // Development: a tab left on an older Vite bundle reloads once by itself instead of erroring.
  const [healing] = useState(() => healStaleDevBundle(error));
  if (import.meta.env.DEV && !healing) console.error('Route error:', error);
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  // Page code missing after a deploy: reload once by itself, then offer a Refresh button.
  const chunkFailed = isChunkError(error);
  const [autoReload] = useState(() => reloadingForUpdate() || (chunkFailed && canReloadForUpdate()));
  useEffect(() => {
    if (autoReload) reloadForUpdate();
  }, [autoReload]);

  if (healing || autoReload) return <PageLoader />;
  if (chunkFailed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-luxury px-6 text-center text-ivory">
        <p className="font-display text-7xl text-gold-gradient">70</p>
        <h1 className="font-display text-3xl">This page has been updated</h1>
        <p className="max-w-md text-ivory/75">Refresh to load the latest version.</p>
        <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-navy">
          Refresh
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-luxury px-6 text-center text-ivory">
      <p className="font-display text-7xl text-gold-gradient">70</p>
      <h1 className="font-display text-3xl">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="max-w-md text-ivory/75">
        {notFound ? 'The page you were looking for does not exist.' : 'Please reload the page. If this keeps happening, let the hosts know.'}
      </p>
      {import.meta.env.DEV && error instanceof Error && (
        // Development only: show what broke so it can be reported. Never shown in production builds.
        <pre className="max-h-60 max-w-2xl overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-left text-xs text-ivory/90">
          {error.message}
          {error.stack ? `\n\n${error.stack.split('\n').slice(0, 6).join('\n')}` : ''}
        </pre>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-navy">
          Reload
        </button>
        <Link to="/" className="inline-flex h-11 items-center rounded-full border border-gold/60 px-6 text-sm">
          Go home
        </Link>
      </div>
    </main>
  );
}
