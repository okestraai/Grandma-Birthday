import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { DropdownMenu } from 'radix-ui';
import {
  Album,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  HardDrive,
  History,
  Images,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Mail,
  Menu,
  MessageSquareQuote,
  Network,
  QrCode,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  UserCircle,
  UserRound,
  Users,
  ImagePlus,
} from 'lucide-react';
import type { Permission, UserRole } from '@birthday/types';
import { mediaStatsQuery, testimonialCountsQuery } from '@/lib/admin-queries';
import { useAuth } from '@/lib/auth';
import { cn, initials } from '@/lib/utils';
import { Drawer } from '@/components/admin/overlays';
import { CountPill } from '@/components/admin/misc';
import { PageLoader } from '@/components/ui/spinner';
import { UpdateNotice } from '@/components/UpdateNotice';
import { preloadAdminPage } from './chunks';

type BadgeKey = 'guestPhotos' | 'testimonials';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission: Permission;
  badge?: BadgeKey;
  end?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:read', end: true }],
  },
  {
    label: 'Celebrant',
    items: [
      { to: '/admin/celebrant', label: 'Celebrant', icon: UserRound, permission: 'content:manage' },
      { to: '/admin/timeline', label: 'Timeline', icon: History, permission: 'content:manage' },
      { to: '/admin/family', label: 'Family Tree', icon: Network, permission: 'content:manage' },
      { to: '/admin/testimonials', label: 'Testimonials', icon: MessageSquareQuote, permission: 'testimonials:manage', badge: 'testimonials' },
    ],
  },
  {
    label: 'Media',
    items: [
      { to: '/admin/gallery', label: 'Gallery', icon: Images, permission: 'media:manage' },
      { to: '/admin/albums', label: 'Albums', icon: Album, permission: 'media:manage' },
      { to: '/admin/media', label: 'Media Library', icon: FolderOpen, permission: 'media:manage' },
      { to: '/admin/guest-photos', label: 'Guest Photos', icon: ImagePlus, permission: 'media:manage', badge: 'guestPhotos' },
    ],
  },
  {
    label: 'Guests',
    items: [
      { to: '/admin/guests', label: 'Guests', icon: Users, permission: 'guests:manage' },
      { to: '/admin/guest-categories', label: 'Guest Categories', icon: Tags, permission: 'guests:manage' },
      { to: '/admin/invitations', label: 'Invitations', icon: Mail, permission: 'guests:manage' },
      { to: '/admin/check-in', label: 'Check-In', icon: QrCode, permission: 'checkin:use' },
    ],
  },
  {
    label: 'Event',
    items: [
      { to: '/admin/event', label: 'Events', icon: CalendarDays, permission: 'event:manage' },
      { to: '/admin/programme', label: 'Programme', icon: ListOrdered, permission: 'event:manage' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings:manage' },
      { to: '/admin/storage', label: 'Storage', icon: HardDrive, permission: 'storage:read' },
      { to: '/admin/users', label: 'Users', icon: ShieldCheck, permission: 'users:manage' },
      { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit:read' },
    ],
  },
];

const EXTRA_CRUMBS: Record<string, string> = {
  '/admin/account': 'Account',
};

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  CHECK_IN_STAFF: 'Check-in staff',
};

function usePendingBadges(can: (p: Permission) => boolean): Record<BadgeKey, number> {
  const mediaStats = useQuery({ ...mediaStatsQuery, enabled: can('media:manage'), refetchInterval: 20_000 });
  const testimonialCounts = useQuery({ ...testimonialCountsQuery, enabled: can('testimonials:manage'), refetchInterval: 20_000 });
  return {
    guestPhotos: mediaStats.data?.guestUploads.pending ?? 0,
    testimonials: testimonialCounts.data?.pending ?? 0,
  };
}

/** How long the pointer rests on a sidebar link before its page is fetched ahead of the click. */
const HOVER_INTENT_MS = 150;

/**
 * Fetches a page ahead of a click, but only once the pointer has rested on its link: sweeping
 * across the sidebar starts nothing. Keyboard focus is a clear intent, so it starts at once.
 */
function useHoverPreload() {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (to: string) => ({
    onPointerEnter: () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => preloadAdminPage(to), HOVER_INTENT_MS);
    },
    onPointerLeave: () => window.clearTimeout(timer.current),
    onFocus: () => preloadAdminPage(to),
  });
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const preloadOn = useHoverPreload();
  const badges = usePendingBadges(can);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => can(item.permission)) })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Admin" className="flex h-full flex-col bg-navy text-white/80">
      <Link to="/admin" onClick={onNavigate} className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
        <span className="font-display text-2xl leading-none text-gold-gradient" aria-hidden>
          70
        </span>
        <span className="text-[13px] font-semibold tracking-wide text-white">Celebration Admin</span>
      </Link>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{group.label}</p>
            <ul>
              {group.items.map((item) => {
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      {...preloadOn(item.to)}
                      className={({ isActive }) =>
                        cn(
                          'relative flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors md:h-8',
                          isActive
                            ? 'bg-white/10 font-medium text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gold'
                            : 'hover:bg-white/[0.06] hover:text-white',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0 opacity-80" />
                      <span className="truncate">{item.label}</span>
                      <CountPill count={count} label={`${count} pending`} />
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <a
        href="/"
        target="_blank"
        rel="noopener"
        className="flex h-11 shrink-0 items-center gap-2 border-t border-white/10 px-4 text-xs text-white/60 hover:text-white"
      >
        <ExternalLink className="size-3.5" aria-hidden /> View public site
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </nav>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const all = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })));
  const match =
    all.find((item) => item.to === pathname) ??
    all.filter((item) => item.to !== '/admin' && pathname.startsWith(item.to + '/')).sort((a, b) => b.to.length - a.to.length)[0];
  const crumbs: { label: string; to?: string }[] = [{ label: 'Admin', to: '/admin' }];
  if (match && match.to !== '/admin') crumbs.push({ label: match.group }, { label: match.label, to: match.to });
  else if (EXTRA_CRUMBS[pathname]) crumbs.push({ label: EXTRA_CRUMBS[pathname] });
  else if (pathname === '/admin') crumbs.push({ label: 'Dashboard' });

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 truncate text-[13px] text-muted">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className={cn('flex items-center gap-1', !last && i > 0 && 'hidden sm:flex', i === 0 && crumbs.length > 2 && 'hidden sm:flex')}>
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-navy">
                  {crumb.label}
                </span>
              ) : crumb.to ? (
                <Link to={crumb.to} className="hover:text-navy">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const itemClass =
    'flex h-10 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] text-navy outline-none data-[highlighted]:bg-navy/[0.06] md:h-8';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-10 items-center gap-2 rounded-lg px-1.5 text-left hover:bg-navy/[0.05] focus-visible:outline-2 focus-visible:outline-gold-rich md:h-9"
        aria-label={`Account menu for ${user.name}`}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-gold">{initials(user.name)}</span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-[13px] font-medium leading-tight text-navy">{user.name}</span>
          <span className="block text-[11px] leading-tight text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-lg border border-navy/10 bg-white p-1 shadow-lift">
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium text-navy">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-0.5 text-xs text-muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-navy/10" />
          <DropdownMenu.Item className={itemClass} onSelect={() => navigate('/admin/account')}>
            <UserCircle className="size-4" aria-hidden /> Account
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={() => window.open('/', '_blank', 'noopener')}>
            <ExternalLink className="size-4" aria-hidden /> Public site
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-navy/10" />
          <DropdownMenu.Item
            className={cn(itemClass, 'text-error')}
            onSelect={() => {
              void logout().finally(() => navigate('/admin/login', { replace: true }));
            }}
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default function AdminLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer on navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  if (!user) return <PageLoader />;

  return (
    <div className="min-h-dvh bg-[#f6f5f1] font-sans text-charcoal">
      <a
        href="#admin-main"
        className="sr-only z-[70] rounded-md bg-navy px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar />
      </aside>
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu" side="left" width="max-w-[17rem]" bare>
        <Sidebar onNavigate={() => setMenuOpen(false)} />
      </Drawer>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-navy/10 bg-white/95 px-3 backdrop-blur lg:px-6">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg text-navy hover:bg-navy/5 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu className="size-5" />
          </button>
          <Link to="/admin" className="font-display text-xl leading-none text-gold-rich lg:hidden" aria-label="Dashboard home">
            70
          </Link>
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-navy hover:bg-navy/5 md:inline-flex"
          >
            <ExternalLink className="size-4" aria-hidden /> Public site
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <UserMenu />
        </header>
        <UpdateNotice variant="bar" />
        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-3 py-5 focus:outline-none sm:px-4 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
