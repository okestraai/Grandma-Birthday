/** '' → null (no separate limit); otherwise a whole number ≥ 0, or undefined when invalid. */
export function parsePlaces(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** Shared wording: capacity counts people, not invitations. */
export const PEOPLE_COMING_NOTE =
  'People coming = guests who said yes plus the companions they are bringing. Places set aside count people, not invitations.';
