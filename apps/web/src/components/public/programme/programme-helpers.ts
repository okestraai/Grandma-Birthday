import type { ProgrammeGroup } from '@birthday/types';

/** Events that have a programme. The API already leaves out the rest; saved copies may not. */
export function groupsWithItems(groups: ProgrammeGroup[] | undefined): ProgrammeGroup[] {
  return (groups ?? []).filter((g) => g.items.length > 0);
}

/**
 * The event whose programme shows first: the next one that has not finished (one in progress
 * counts), or the first in display order once they all have.
 */
export function defaultProgrammeGroup(groups: ProgrammeGroup[], now = Date.now()): ProgrammeGroup | undefined {
  const upcoming = groups
    .filter((g) => new Date(g.event.endsAt).getTime() > now)
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  return upcoming[0] ?? groups[0];
}

/** The group for `slug` (from ?event=), else the default. */
export function pickProgrammeGroup(groups: ProgrammeGroup[], slug: string | null | undefined, now = Date.now()): ProgrammeGroup | undefined {
  return groups.find((g) => g.event.slug === slug) ?? defaultProgrammeGroup(groups, now);
}

/** Link to one event's programme. With a single programme the plain page is enough. */
export function programmeHref(groups: ProgrammeGroup[], slug: string | undefined): string {
  return groups.length > 1 && slug ? `/programme?event=${encodeURIComponent(slug)}` : '/programme';
}
