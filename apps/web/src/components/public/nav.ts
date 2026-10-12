import type { SiteOverview } from '@birthday/types';

export const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'Biography' },
  { to: '/story', label: 'Life Story' },
  { to: '/family', label: 'Family' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/event', label: 'The Event' },
  { to: '/programme', label: 'Programme' },
  { to: '/testimonials', label: 'Tributes' },
] as const;

export type NavItem = (typeof NAV_LINKS)[number];

/** False when an admin has hidden the programme. A saved copy from before the switch has no flag: shown. */
export function programmeShown(site: Pick<SiteOverview, 'celebration'> | undefined): boolean {
  return site?.celebration.programmeVisible !== false;
}

/** The main links, without Programme while it is hidden. */
export function navLinksFor(site: Pick<SiteOverview, 'celebration'> | undefined): readonly NavItem[] {
  return programmeShown(site) ? NAV_LINKS : NAV_LINKS.filter((link) => link.to !== '/programme');
}
