import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { Menu } from 'lucide-react';
import type { SiteOverview } from '@birthday/types';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { navLinksFor } from './nav';
import { HeaderGlass } from './effects/HeaderGlass';
import { MagneticLink } from './motion';

// The phone menu (and the dialog library behind it) loads on first use, or when the pointer or
// focus reaches the menu button.
const loadMobileMenu = () => import('./MobileMenu');
const MobileMenu = lazy(loadMobileMenu);

function useScrolled(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

function Brand({ site }: { site: SiteOverview | undefined }) {
  const [logoFailed, setLogoFailed] = useState<string | null>(null);
  const logoSrc = site?.branding.logo ? apiUrl(site.branding.logo.urls.thumb ?? site.branding.logo.urls.original) : null;
  // A logo that fails to load (the API is down) falls back to the gold 70 roundel.
  const logo = logoSrc && logoFailed !== logoSrc ? logoSrc : null;
  const name = site?.celebrant.preferredName;
  return (
    <Link to="/" className="group flex items-center gap-3 rounded-full" aria-label={name ? `${name}'s celebration: home` : 'Home'}>
      {logo ? (
        <img src={logo} alt="" className="h-9 w-auto" width={36} height={36} onError={() => setLogoFailed(logo)} />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-full border border-gold/50 font-display text-lg lining-nums text-gold-gradient transition-colors group-hover:border-gold">
          {site?.celebrant.age ?? 70}
        </span>
      )}
      {name && (
        <span className="hidden font-display text-lg leading-none text-ivory sm:inline">
          {name}
          <span className="ml-1.5 align-middle text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-gold">at {site?.celebrant.age ?? 70}</span>
        </span>
      )}
    </Link>
  );
}

export function Header({ site, overHero }: { site: SiteOverview | undefined; overHero: boolean }) {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const transparent = overHero && !scrolled && !open;
  const links = navLinksFor(site);

  // Close the menu on navigation.
  useEffect(() => setOpen(false), [location.pathname]);

  // The hover underline is CSS; the active one is a single gold bar that slides between links.
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative py-2 text-[13px] font-medium tracking-wide text-ivory/80 transition-colors hover:text-ivory',
      'after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-gold/60 after:transition-transform after:duration-500 after:ease-luxe hover:after:scale-x-100',
      isActive && 'text-ivory after:hidden',
    );

  return (
    <header
      className={cn(
        'no-print fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow] duration-500 ease-luxe',
        // Nearly opaque rather than blurred: a backdrop blur re-renders on every scroll frame.
        transparent ? 'bg-transparent' : 'bg-navy/95 shadow-[0_1px_0_rgba(214,179,106,0.18)]',
      )}
    >
      <div className="container-page flex h-[72px] items-center justify-between gap-6">
        <Brand site={site} />
        <nav aria-label="Main" className="hidden xl:block">
          <div className="relative">
            {overHero && <HeaderGlass visible={transparent} />}
            <ul className="relative flex items-center gap-7">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.to === '/'} className={linkClass}>
                    {({ isActive }) => (
                      <>
                        {link.label}
                        {isActive && (
                          <motion.span
                            aria-hidden
                            layoutId="header-nav-active"
                            className="absolute inset-x-[-6px] -bottom-1 h-[2px] rounded-full bg-gold shadow-[0_0_10px_rgba(214,179,106,0.8)]"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="flex items-center gap-2">
          <MagneticLink
            to="/rsvp"
            className="hidden h-10 items-center rounded-full bg-gold px-5 text-[13px] font-semibold tracking-wide text-navy shadow-soft transition-shadow duration-300 ease-luxe hover:shadow-gold sm:inline-flex"
          >
            RSVP
          </MagneticLink>
          <button
            ref={menuButton}
            type="button"
            className="flex size-11 items-center justify-center rounded-full text-ivory transition-colors hover:bg-white/10 xl:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            onPointerEnter={loadMobileMenu}
            onFocus={loadMobileMenu}
            onClick={() => {
              setMenuLoaded(true);
              setOpen(true);
            }}
          >
            <Menu className="size-6" aria-hidden />
          </button>
          {menuLoaded && (
            <Suspense fallback={null}>
              <MobileMenu open={open} onOpenChange={setOpen} returnFocusTo={menuButton} links={links} />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  );
}
