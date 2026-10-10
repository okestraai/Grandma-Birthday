import type { AdminFamilyMember, FamilyRelationType, FamilyRelationship } from '@birthday/types';

export const GENERATIONS: { value: number; label: string; hint: string }[] = [
  { value: -2, label: 'Celebrant’s grandparents’ generation', hint: 'Grandparents, great-aunts and great-uncles of the celebrant' },
  { value: -1, label: 'Celebrant’s parents’ generation', hint: 'Parents, aunts and uncles of the celebrant' },
  { value: 0, label: 'Celebrant’s generation', hint: 'The celebrant, spouse, siblings and cousins' },
  { value: 1, label: 'Children', hint: 'Children and their spouses' },
  { value: 2, label: 'Grandchildren', hint: 'Grandchildren and their spouses' },
  { value: 3, label: 'Great-grandchildren', hint: 'Great-grandchildren and their spouses' },
  { value: 4, label: 'Great-great-grandchildren', hint: 'Great-great-grandchildren and their spouses' },
];

export function generationName(generation: number): string {
  return GENERATIONS.find((g) => g.value === generation)?.label ?? `Generation ${generation}`;
}

/** "1950–2020", "b. 1956", "d. 1999", or "" */
export function lifeYears(m: Pick<AdminFamilyMember, 'birthYear' | 'deathYear'>): string {
  if (m.birthYear && m.deathYear) return `${m.birthYear}–${m.deathYear}`;
  if (m.birthYear) return `b. ${m.birthYear}`;
  if (m.deathYear) return `d. ${m.deathYear}`;
  return '';
}

export const RELATION_VERB: Record<FamilyRelationType, string> = {
  PARENT_OF: 'is parent of',
  SPOUSE_OF: 'is spouse of',
};

export function sortMembers(members: AdminFamilyMember[]): AdminFamilyMember[] {
  return [...members].sort(
    (a, b) => a.generation - b.generation || a.sortOrder - b.sortOrder || a.fullName.localeCompare(b.fullName),
  );
}

/** Whether an equivalent relationship already exists (spouse links count in both directions). */
export function findDuplicate(relationships: FamilyRelationship[], fromId: string, toId: string, type: FamilyRelationType): FamilyRelationship | undefined {
  return relationships.find(
    (r) =>
      r.type === type &&
      ((r.fromId === fromId && r.toId === toId) || (type === 'SPOUSE_OF' && r.fromId === toId && r.toId === fromId)),
  );
}

/** Would making `fromId` a parent of `toId` create a loop (toId is already an ancestor of fromId)? */
export function wouldCreateCycle(relationships: FamilyRelationship[], fromId: string, toId: string): boolean {
  const parentsOf = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== 'PARENT_OF') continue;
    parentsOf.set(r.toId, [...(parentsOf.get(r.toId) ?? []), r.fromId]);
  }
  const stack = [fromId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === toId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(parentsOf.get(id) ?? []));
  }
  return false;
}

/** Members (already sorted) grouped by generation, in generation order. */
export function groupByGeneration(sorted: AdminFamilyMember[]): [number, AdminFamilyMember[]][] {
  const groups = new Map<number, AdminFamilyMember[]>();
  for (const m of sorted) groups.set(m.generation, [...(groups.get(m.generation) ?? []), m]);
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

// ---------------------------------------------------------------------------
// Family units: a person, or a couple linked by `spouseId`
// ---------------------------------------------------------------------------

export interface FamilyUnit {
  /** Stable key: the member ids, sorted, joined with ",". */
  key: string;
  /** One or two people. The blood relative comes first when the other married in. */
  members: AdminFamilyMember[];
}

export function unitKey(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

/** "Ngozi Okonkwo-Bello & Tunde Bello", or a single name. */
export function unitLabel(unit: Pick<FamilyUnit, 'members'>): string {
  return unit.members.map((m) => m.fullName).join(' & ');
}

/** Groups every member into a unit with their spouse (if any), in display order. */
export function buildFamilyUnits(members: AdminFamilyMember[]): FamilyUnit[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const units: FamilyUnit[] = [];
  for (const m of sortMembers(members)) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const spouse = m.spouseId ? byId.get(m.spouseId) : undefined;
    if (spouse && !seen.has(spouse.id)) {
      seen.add(spouse.id);
      const pair = m.marriedIn && !spouse.marriedIn ? [spouse, m] : [m, spouse];
      units.push({ key: unitKey([m.id, spouse.id]), members: pair });
    } else {
      units.push({ key: unitKey([m.id]), members: [m] });
    }
  }
  return units;
}

/** Ids of everyone descended from `id` (children, grandchildren, ...), following `parentIds`. */
export function descendantIds(members: AdminFamilyMember[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const m of members) for (const p of m.parentIds) childrenOf.set(p, [...(childrenOf.get(p) ?? []), m.id]);
  const out = new Set<string>();
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next) || next === id) continue;
    out.add(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return out;
}

/**
 * The family units someone can be a child of: every unit except ones containing the person
 * themself, their spouse or any of their descendants. `memberId` null means a new person.
 */
export function childOfOptions(members: AdminFamilyMember[], memberId: string | null): FamilyUnit[] {
  const units = buildFamilyUnits(members);
  if (!memberId) return units;
  const self = members.find((m) => m.id === memberId);
  const excluded = descendantIds(members, memberId);
  excluded.add(memberId);
  if (self?.spouseId) excluded.add(self.spouseId);
  return units.filter((u) => !u.members.some((m) => excluded.has(m.id)));
}

/** Generation implied by the given parents (one below the youngest parent), or null. */
export function derivedGeneration(members: AdminFamilyMember[], parentIds: readonly string[]): number | null {
  const gens = members.filter((m) => parentIds.includes(m.id)).map((m) => m.generation);
  return gens.length ? Math.max(...gens) + 1 : null;
}

// ---------------------------------------------------------------------------
// Outline: family units nested under their parents' unit
// ---------------------------------------------------------------------------

export interface OutlineNode {
  unit: FamilyUnit;
  children: OutlineNode[];
  /** Already shown higher up (e.g. both partners have parents in the tree). */
  repeat?: boolean;
}

export interface FamilyOutline {
  roots: OutlineNode[];
  /** People with no spouse, parents or children in the tree. */
  unlinked: AdminFamilyMember[];
}

const MAX_DEPTH = 12;

/**
 * Builds the outline from the top ancestor of the celebrant (their parents, or the celebrant),
 * then any other connected units without parents, then anything still unreached.
 */
export function buildFamilyOutline(members: AdminFamilyMember[]): FamilyOutline {
  const byId = new Map(members.map((m) => [m.id, m]));
  const units = buildFamilyUnits(members);
  const unitOf = new Map<string, FamilyUnit>();
  for (const u of units) for (const m of u.members) unitOf.set(m.id, u);
  const order = new Map(units.map((u, i) => [u.key, i]));
  const parentsOf = (m: AdminFamilyMember) => m.parentIds.filter((p) => byId.has(p));

  const childUnits = new Map<string, FamilyUnit[]>();
  for (const m of sortMembers(members)) {
    const child = unitOf.get(m.id)!;
    for (const p of parentsOf(m)) {
      const parent = unitOf.get(p)!;
      if (parent.key === child.key) continue;
      const list = childUnits.get(parent.key) ?? [];
      if (!list.includes(child)) list.push(child);
      childUnits.set(parent.key, list);
    }
  }
  for (const list of childUnits.values()) list.sort((a, b) => order.get(a.key)! - order.get(b.key)!);

  const visited = new Set<string>();
  const node = (unit: FamilyUnit, depth: number): OutlineNode => {
    if (visited.has(unit.key)) return { unit, children: [], repeat: true };
    visited.add(unit.key);
    const kids = depth < MAX_DEPTH ? (childUnits.get(unit.key) ?? []) : [];
    return { unit, children: kids.map((k) => node(k, depth + 1)) };
  };

  const connected = (u: FamilyUnit) => u.members.length > 1 || childUnits.has(u.key) || u.members.some((m) => parentsOf(m).length > 0);
  const roots: OutlineNode[] = [];

  const celebrant = members.find((m) => m.isCelebrant);
  if (celebrant) {
    // Climb to the celebrant's top ancestor so parents, siblings and (if recorded) grandparents show.
    let top = celebrant;
    const climbed = new Set<string>([top.id]);
    for (;;) {
      const parent = parentsOf(top).map((p) => byId.get(p)!).find((p) => !climbed.has(p.id));
      if (!parent) break;
      climbed.add(parent.id);
      top = parent;
    }
    roots.push(node(unitOf.get(top.id)!, 0));
  }
  for (const u of units) {
    if (!visited.has(u.key) && connected(u) && u.members.every((m) => parentsOf(m).length === 0)) roots.push(node(u, 0));
  }
  for (const u of units) if (!visited.has(u.key) && connected(u)) roots.push(node(u, 0));

  const unlinked = units.filter((u) => !visited.has(u.key)).flatMap((u) => u.members);
  return { roots, unlinked };
}
