import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { applyBranding } from '@/lib/branding';
import { useSite } from '@/lib/public-api';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { RouteCurtain, RouteTransition } from '@/components/public/motion/RouteTransition';
import { ScrollProgress } from '@/components/public/motion/ScrollProgress';
import { OfflineBanner, useServerDown } from '@/components/public/OfflineBanner';
import { ServerDownNoticeContext } from '@/components/ui/states';
import { UpdateNotice } from '@/components/UpdateNotice';

/**
 * Scrolls to the top on every route change. When the URL has a hash, it scrolls to that
 * element instead, once the lazy page has rendered it.
 */
function useScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(id);
      if (target || ++tries > 40) {
        window.clearInterval(timer);
        target?.scrollIntoView({ block: 'start' });
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, hash]);
}

export default function PublicLayout() {
  const { data: site } = useSite();
  const { pathname } = useLocation();
  const server = useServerDown();
  useScrollToTop();

  // Page transitions (curtain and fade-in) play on navigation only, never on the first load.
  const firstPath = useRef(pathname);
  const [navigated, setNavigated] = useState(false);
  if (!navigated && pathname !== firstPath.current) setNavigated(true);

  useEffect(() => {
    if (site) applyBranding(site.branding);
  }, [site]);

  return (
    // overflow-x: clip stops sliding and parallax layers from widening the page on phones,
    // without making a scroll container (sticky elements keep working).
    <div className="flex min-h-dvh flex-col bg-ivory [overflow-x:clip]">
      <a
        href="#main"
        className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-lift transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <Header site={site} overHero={pathname === '/'} />
      <ScrollProgress />
      {navigated && <RouteCurtain key={pathname} mark={site?.celebrant.age ?? 70} />}
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* Error states on public pages turn into a calm "we'll be right back" when the server is down. */}
        <ServerDownNoticeContext value>
          <RouteTransition key={pathname} animate={navigated}>
            <Outlet />
          </RouteTransition>
        </ServerDownNoticeContext>
      </main>
      <Footer site={site} />
      {/* Notices at the foot of the screen share one column, so they stack instead of overlapping. */}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-3 z-40 flex flex-col gap-2 px-3">
        {site?.isDemo && (
          <p
            className="self-start rounded-full border border-gold/40 bg-navy/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-champagne shadow-soft backdrop-blur-sm"
            role="note"
          >
            Demo content
          </p>
        )}
        <UpdateNotice className="pointer-events-auto self-center" />
        {server.down && (
          <OfflineBanner
            className="pointer-events-auto self-center"
            hasData={server.hasData}
            retrying={server.retrying}
            onRetry={() => void server.retry()}
          />
        )}
      </div>
    </div>
  );
}
