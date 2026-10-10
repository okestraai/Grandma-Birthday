import type { FamilyMember, FamilyRelationship, FamilyTree } from '@birthday/types';

/**
 * Family helpers shared by the tree and the detail dialog: relations of one person, name and
 * year formatting. The tree drawing itself is in tree-layout.ts.
 * Admin-entered data is treated as untrusted: unknown ids, self links and duplicates are dropped.
 */

interface CleanGraph {
  members: FamilyMember[];
  byId: Map<string, FamilyMember>;
  /** childId → parent ids */
  parents: Map<string, string[]>;
  /** parentId → child ids */
  children: Map<string, string[]>;
  /** memberId → spouse ids */
  spouses: Map<string, string[]>;
}

function bySortOrder(a: FamilyMember, b: FamilyMember): number {
  const sa = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
  const sb = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
  return sa - sb || a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id);
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/** Drops unknown ids, self links and duplicates; indexes the rest. */
function cleanGraph(tree: Partial<FamilyTree> | null | undefined): CleanGraph {
  const byId = new Map<string, FamilyMember>();
  for (const m of tree?.members ?? []) {
    if (m && typeof m.id === 'string' && !byId.has(m.id)) byId.set(m.id, m);
  }
  const members = [...byId.values()].sort(bySortOrder);
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  for (const r of (tree?.relationships ?? []) as FamilyRelationship[]) {
    if (!r || r.fromId === r.toId || !byId.has(r.fromId) || !byId.has(r.toId)) continue;
    if (r.type === 'PARENT_OF') {
      // A mutual parent link is a data error: keep the first direction only.
      if (parents.get(r.fromId)?.includes(r.toId)) continue;
      push(parents, r.toId, r.fromId);
      push(children, r.fromId, r.toId);
    } else if (r.type === 'SPOUSE_OF') {
      push(spouses, r.fromId, r.toId);
      push(spouses, r.toId, r.fromId);
    }
  }
  return { members, byId, parents, children, spouses };
}

function sortedMembers(ids: string[] | undefined, byId: Map<string, FamilyMember>): FamilyMember[] {
  return (ids ?? []).map((id) => byId.get(id)).filter((m): m is FamilyMember => Boolean(m)).sort(bySortOrder);
}

/** Spouses, parents and children of one member, for the detail dialog. */
export function relationsOf(
  tree: Partial<FamilyTree> | null | undefined,
  memberId: string,
): { spouses: FamilyMember[]; parents: FamilyMember[]; children: FamilyMember[] } {
  const g = cleanGraph(tree);
  return {
    spouses: sortedMembers(g.spouses.get(memberId), g.byId),
    parents: sortedMembers(g.parents.get(memberId), g.byId),
    children: sortedMembers(g.children.get(memberId), g.byId),
  };
}

/** First given name, skipping a leading honorific such as "Dr." or "Chief". */
export function givenName(fullName: string): string {
  const honorifics = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'chief', 'sir', 'lady', 'rev', 'hon', 'engr', 'barr', 'pastor', 'deacon', 'deaconess', 'elder', 'alhaji', 'alhaja', 'lolo', 'nze']);
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts.find((p) => !honorifics.has(p.replace(/[.()]/g, '').toLowerCase()));
  return first ?? parts[0] ?? '';
}

/** Row label relative to the celebrant's generation (0). Never hardcodes a name. */
export function generationLabel(generation: number, celebrantName?: string | null): string {
  switch (generation) {
    case -2:
      return 'Grandparents';
    case -1:
      return 'Parents';
    case 0:
      return celebrantName ? `Generation of ${celebrantName}` : 'The celebrant’s generation';
    case 1:
      return 'Children';
    case 2:
      return 'Grandchildren';
    case 3:
      return 'Great-grandchildren';
    default: {
      const greats = Array.from({ length: Math.abs(generation) - 2 }, () => 'great').join('-');
      const label = `${greats}-grand${generation < 0 ? 'parents' : 'children'}`;
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
}

/** "1932 – 2010", "b. 1980", "d. 2010" or null. */
export function formatYears(member: Pick<FamilyMember, 'birthYear' | 'deathYear'>): string | null {
  const { birthYear, deathYear } = member;
  if (birthYear && deathYear) return `${birthYear} – ${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  if (deathYear) return `d. ${deathYear}`;
  return null;
}

export function isDeceased(member: Pick<FamilyMember, 'deathYear'>): boolean {
  return member.deathYear != null;
}
