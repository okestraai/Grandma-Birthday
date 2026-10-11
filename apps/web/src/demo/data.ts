import type { QueryKey } from '@tanstack/react-query';
import * as fixtures from './fixtures';

/**
 * Sample data for a public query key, or undefined when there is none. Loaded only when the API
 * cannot be reached (see lib/demo-fallback.ts). Paged lists have one page.
 */
export function demoFor(key: QueryKey, pageParam?: unknown): unknown {
  if (key[0] !== 'public') return undefined;
  if (pageParam !== undefined && pageParam !== 1) return undefined;
  const [, name, arg, sub] = key;
  switch (name) {
    case 'site':
      return fixtures.site;
    case 'timeline':
      return fixtures.timeline;
    case 'family':
      return fixtures.family;
    case 'albums':
      return fixtures.albums;
    case 'album':
      if (typeof arg !== 'string') return undefined;
      return sub === 'media' ? fixtures.albumMedia[arg] : fixtures.albumDetails[arg];
    case 'programme':
      return fixtures.programme;
    case 'testimonials':
      return typeof arg === 'number' ? (fixtures.testimonials[arg] ?? fixtures.testimonials[12]) : undefined;
    case 'rsvp':
      return arg === 'form' ? fixtures.rsvpForm : undefined;
    default:
      return undefined;
  }
}
