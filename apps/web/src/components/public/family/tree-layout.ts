import type { FamilyMember, FamilyTree } from '@birthday/types';

/**
 * Family-tree drawing, as a pure function (no DOM), so it can be unit-tested.
 *
 * Shape:
 *   row 0      the celebrant's parents (one couple), centred over their children
 *   row 1      the celebrant + spouse first, then the celebrant's siblings (with spouses) to the right
 *   row 2+     each couple's children below them; every child is drawn with their spouse if they
 *              have one, and their own children below that, to any depth
 *
 * A "unit" is one blood relative plus their spouse (if any). Lines run from the middle of a
 * couple down to a horizontal bar, then down to each child's card.
 */

export const CARD_W = 148;
export const CARD_H = 176;
/** Space between two spouses in one unit (the marriage line sits in it). */
export const COUPLE_GAP = 32;
/** Space between neighbouring units in a row. */
export const UNIT_GAP = 36;
/** Vertical space between rows (the connector lines live here). */
export const ROW_GAP = 64;
/** Extra space between the celebrant's family and each sibling's family. */
export const SIBLING_GAP = 72;

export interface PlacedCard {
  member: FamilyMember;
  x: number;
  y: number;
  /** A blood relative, or the person they married. */
  role: 'blood' | 'spouse';
  isCelebrant: boolean;
  /** The celebrant or the celebrant's spouse. */
  isHonoured: boolean;
}

export interface Connector {
  /** SVG path in layout coordinates. */
  d: string;
  kind: 'marriage' | 'descent';
}

export interface TreeLayout {
  cards: PlacedCard[];
  connectors: Connector[];
  width: number;
  height: number;
  /** People who could not be placed (not linked to anyone in the tree). */
  unplaced: FamilyMember[];
}

interface Graph {
  byId: Map<string, FamilyMember>;
  spouseOf: Map<string, string>;
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
}

const byAge = (a: FamilyMember, b: FamilyMember) =>
  (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.sortOrder - b.sortOrder || a.fullName.localeCompare(b.fullName);

function buildGraph(tree: Partial<FamilyTree> | null | undefined): Graph {
  const members = tree?.members ?? [];
  const byId = new Map(members.map((m) => [m.id, m]));
  const spouseOf = new Map<string, string>();
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const r of tree?.relationships ?? []) {
    if (!byId.has(r.fromId) || !byId.has(r.toId) || r.fromId === r.toId) continue;
    if (r.type === 'SPOUSE_OF') {
      if (!spouseOf.has(r.fromId) && !spouseOf.has(r.toId)) {
        spouseOf.set(r.fromId, r.toId);
        spouseOf.set(r.toId, r.fromId);
      }
    } else {
      parentsOf.set(r.toId, [...(parentsOf.get(r.toId) ?? []), r.fromId]);
      childrenOf.set(r.fromId, [...(childrenOf.get(r.fromId) ?? []), r.toId]);
    }
  }
  return { byId, spouseOf, parentsOf, childrenOf };
}

/** A blood relative, their spouse, and the children of either (as units). */
interface Unit {
  primary: FamilyMember;
  spouse: FamilyMember | null;
  children: Unit[];
  /** Filled by the layout pass. */
  x: number;
  width: number;
}

function unitWidth(unit: Pick<Unit, 'spouse'>): number {
  return unit.spouse ? CARD_W * 2 + COUPLE_GAP : CARD_W;
}

/** Children of a unit: anyone with the primary or the spouse as a parent, oldest first. */
function childIds(g: Graph, primary: string, spouse: string | null): string[] {
  const ids = new Set([...(g.childrenOf.get(primary) ?? []), ...(spouse ? (g.childrenOf.get(spouse) ?? []) : [])]);
  return [...ids]
    .map((id) => g.byId.get(id)!)
    .sort(byAge)
    .map((m) => m.id);
}

function buildUnit(g: Graph, primaryId: string, placed: Set<string>): Unit {
  placed.add(primaryId);
  const spouseId = g.spouseOf.get(primaryId) ?? null;
  const spouse = spouseId && !placed.has(spouseId) ? g.byId.get(spouseId)! : null;
  if (spouse) placed.add(spouse.id);
  const children = childIds(g, primaryId, spouse?.id ?? null)
    .filter((id) => !placed.has(id))
    .map((id) => buildUnit(g, id, placed));
  return { primary: g.byId.get(primaryId)!, spouse, children, x: 0, width: 0 };
}

/** Subtree width, and child positions relative to the subtree's left edge. */
function measure(unit: Unit): number {
  const own = unitWidth(unit);
  if (unit.children.length === 0) {
    unit.width = own;
    return own;
  }
  const childrenWidth = unit.children.reduce((sum, child) => sum + measure(child), 0) + UNIT_GAP * (unit.children.length - 1);
  unit.width = Math.max(own, childrenWidth);
  return unit.width;
}

interface Emit {
  cards: PlacedCard[];
  connectors: Connector[];
  maxDepth: number;
}

const rowY = (depth: number) => depth * (CARD_H + ROW_GAP);

/** Places a measured subtree with its left edge at `left`, `depth` rows down. */
function place(unit: Unit, left: number, depth: number, out: Emit, honoured: Set<string>): void {
  const own = unitWidth(unit);
  const childrenWidth = unit.children.reduce((s, c) => s + c.width, 0) + UNIT_GAP * Math.max(0, unit.children.length - 1);
  unit.x = left + (unit.width - own) / 2;
  const y = rowY(depth);
  out.maxDepth = Math.max(out.maxDepth, depth);

  const card = (member: FamilyMember, x: number, role: PlacedCard['role']) =>
    out.cards.push({ member, x, y, role, isCelebrant: member.isCelebrant, isHonoured: honoured.has(member.id) });
  card(unit.primary, unit.x, 'blood');
  if (unit.spouse) {
    card(unit.spouse, unit.x + CARD_W + COUPLE_GAP, 'spouse');
    const my = y + CARD_H * 0.36;
    out.connectors.push({ d: `M ${unit.x + CARD_W} ${my} H ${unit.x + CARD_W + COUPLE_GAP}`, kind: 'marriage' });
  }
  if (unit.children.length === 0) return;

  let childLeft = left + (unit.width - childrenWidth) / 2;
  const tops: number[] = [];
  for (const child of unit.children) {
    place(child, childLeft, depth + 1, out, honoured);
    tops.push(child.x + CARD_W / 2);
    childLeft += child.width + UNIT_GAP;
  }
  descent(out, unit, y, tops);
}

/** Line from a unit (couple midpoint, or the single card) down to each child's card. */
function descent(out: Emit, unit: Pick<Unit, 'x' | 'spouse'>, y: number, childCentres: number[]): void {
  const fromX = unit.spouse ? unit.x + CARD_W + COUPLE_GAP / 2 : unit.x + CARD_W / 2;
  const fromY = unit.spouse ? y + CARD_H * 0.36 : y + CARD_H;
  const busY = y + CARD_H + ROW_GAP / 2;
  const childTop = y + CARD_H + ROW_GAP;
  const lo = Math.min(fromX, ...childCentres);
  const hi = Math.max(fromX, ...childCentres);
  const parts = [`M ${fromX} ${fromY} V ${busY}`];
  if (hi > lo) parts.push(`M ${lo} ${busY} H ${hi}`);
  for (const cx of childCentres) parts.push(`M ${cx} ${busY} V ${childTop}`);
  out.connectors.push({ d: parts.join(' '), kind: 'descent' });
}

function findCelebrant(g: Graph): FamilyMember | null {
  return [...g.byId.values()].find((m) => m.isCelebrant) ?? null;
}

export function layoutTree(tree: Partial<FamilyTree> | null | undefined): TreeLayout {
  const g = buildGraph(tree);
  const out: Emit = { cards: [], connectors: [], maxDepth: 0 };
  const placed = new Set<string>();
  const celebrant = findCelebrant(g);
  const honoured = new Set<string>();
  if (celebrant) {
    honoured.add(celebrant.id);
    const partner = g.spouseOf.get(celebrant.id);
    if (partner) honoured.add(partner);
  }

  let cursor = 0;
  if (celebrant) {
    // The celebrant's parents (if recorded) head the tree.
    const parentIds = (g.parentsOf.get(celebrant.id) ?? []).filter((id) => g.byId.has(id));
    const parentPrimary = parentIds.map((id) => g.byId.get(id)!).sort(byAge)[0] ?? null;
    const parentSpouse = parentPrimary
      ? (parentIds.find((id) => id !== parentPrimary.id) ?? g.spouseOf.get(parentPrimary.id) ?? null)
      : null;
    if (parentPrimary) placed.add(parentPrimary.id);
    if (parentSpouse) placed.add(parentSpouse);

    // Row 1: the celebrant's family first, then each sibling's family to the right.
    const siblings = parentPrimary
      ? childIds(g, parentPrimary.id, parentSpouse)
          .filter((id) => id !== celebrant.id)
          .map((id) => g.byId.get(id)!)
      : [];
    const row = [celebrant, ...siblings]
      .filter((m) => !placed.has(m.id))
      .map((m) => buildUnit(g, m.id, placed));
    const depth = parentPrimary ? 1 : 0;
    const centres: number[] = [];
    row.forEach((unit, i) => {
      measure(unit);
      place(unit, cursor, depth, out, honoured);
      centres.push(unit.x + CARD_W / 2);
      cursor += unit.width + (i === 0 ? SIBLING_GAP : UNIT_GAP);
    });
    cursor -= row.length ? (row.length === 1 ? SIBLING_GAP : UNIT_GAP) : 0;

    if (parentPrimary) {
      const parentUnit = { primary: parentPrimary, spouse: parentSpouse ? g.byId.get(parentSpouse)! : null, children: [], x: 0, width: 0 };
      const own = unitWidth(parentUnit);
      // Centre the parents over the sibling row's cards (not their descendants).
      const mid = centres.length ? (Math.min(...centres) + Math.max(...centres)) / 2 : own / 2;
      parentUnit.x = Math.max(0, mid - own / 2);
      const y = rowY(0);
      out.cards.push({ member: parentUnit.primary, x: parentUnit.x, y, role: 'blood', isCelebrant: false, isHonoured: false });
      if (parentUnit.spouse) {
        out.cards.push({ member: parentUnit.spouse, x: parentUnit.x + CARD_W + COUPLE_GAP, y, role: 'blood', isCelebrant: false, isHonoured: false });
        const my = y + CARD_H * 0.36;
        out.connectors.push({ d: `M ${parentUnit.x + CARD_W} ${my} H ${parentUnit.x + CARD_W + COUPLE_GAP}`, kind: 'marriage' });
      }
      if (centres.length) descent(out, parentUnit, y, centres);
      cursor = Math.max(cursor, parentUnit.x + own);
    }
  }

  // Anyone else at the top of their own branch (no parents in the tree) gets their own tree.
  const roots = [...g.byId.values()]
    .filter((m) => !placed.has(m.id) && !(g.parentsOf.get(m.id)?.length) && !(g.spouseOf.has(m.id) && (g.parentsOf.get(g.spouseOf.get(m.id)!)?.length ?? 0) > 0))
    .sort(byAge);
  for (const root of roots) {
    if (placed.has(root.id)) continue;
    const unit = buildUnit(g, root.id, placed);
    if (!unit.spouse && unit.children.length === 0) {
      placed.delete(root.id);
      continue;
    }
    measure(unit);
    const left = cursor === 0 ? 0 : cursor + SIBLING_GAP;
    place(unit, left, 0, out, honoured);
    cursor = left + unit.width;
  }

  const unplaced = [...g.byId.values()].filter((m) => !placed.has(m.id)).sort(byAge);
  const width = Math.max(0, ...out.cards.map((c) => c.x + CARD_W));
  const height = out.cards.length ? rowY(out.maxDepth) + CARD_H : 0;
  return { cards: out.cards, connectors: out.connectors, width, height, unplaced };
}
