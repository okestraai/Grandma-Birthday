import type { FamilyMember, FamilyRelationship, FamilyTree } from '@birthday/types';
import { CARD_H, CARD_W, layoutTree, ROW_GAP } from './tree-layout';

let seq = 0;
function m(id: string, birthYear: number, extra: Partial<FamilyMember> = {}): FamilyMember {
  return { id, fullName: id, relationshipLabel: 'Relative', generation: 0, isCelebrant: false, bio: null, birthYear, deathYear: null, photo: null, sortOrder: 0, ...extra };
}
const spouse = (a: string, b: string): FamilyRelationship => ({ id: `r${++seq}`, fromId: a, toId: b, type: 'SPOUSE_OF' });
const parent = (p: string, c: string): FamilyRelationship => ({ id: `r${++seq}`, fromId: p, toId: c, type: 'PARENT_OF' });
const both = (a: string, b: string, kids: string[]) => kids.flatMap((k) => [parent(a, k), parent(b, k)]);

/** Parents; the celebrant + husband; two siblings (one married); children; a grandchild with a spouse; great-grandchildren. */
const tree: FamilyTree = {
  members: [
    m('dad', 1920), m('mum', 1925),
    m('ada', 1956, { isCelebrant: true }), m('emeka', 1953),
    m('obi', 1950), m('ifeoma', 1952), m('uche', 1962),
    m('ngozi', 1978), m('tunde', 1975), m('amara', 1985),
    m('kemi', 1999), m('david', 1997), m('tobi', 2002),
    m('baby1', 2023), m('baby2', 2025),
  ],
  relationships: [
    spouse('dad', 'mum'), ...both('dad', 'mum', ['obi', 'ada', 'uche']),
    spouse('ada', 'emeka'), spouse('obi', 'ifeoma'),
    ...both('ada', 'emeka', ['ngozi', 'amara']), spouse('ngozi', 'tunde'),
    ...both('ngozi', 'tunde', ['kemi', 'tobi']), spouse('kemi', 'david'),
    ...both('kemi', 'david', ['baby1', 'baby2']),
  ],
};

const rowOf = (y: number) => y / (CARD_H + ROW_GAP);

describe('layoutTree', () => {
  const layout = layoutTree(tree);
  const at = (id: string) => layout.cards.find((c) => c.member.id === id)!;

  it('places every linked person exactly once', () => {
    expect(layout.cards).toHaveLength(tree.members.length);
    expect(new Set(layout.cards.map((c) => c.member.id)).size).toBe(tree.members.length);
    expect(layout.unplaced).toEqual([]);
  });

  it('puts parents on top, then the celebrant generation, then each generation below', () => {
    expect(rowOf(at('dad').y)).toBe(0);
    expect(rowOf(at('mum').y)).toBe(0);
    for (const id of ['ada', 'emeka', 'obi', 'ifeoma', 'uche']) expect(rowOf(at(id).y)).toBe(1);
    for (const id of ['ngozi', 'tunde', 'amara']) expect(rowOf(at(id).y)).toBe(2);
    for (const id of ['kemi', 'david', 'tobi']) expect(rowOf(at(id).y)).toBe(3);
    for (const id of ['baby1', 'baby2']) expect(rowOf(at(id).y)).toBe(4);
  });

  it('draws each spouse beside their partner, marked as married in', () => {
    expect(at('emeka').x).toBeGreaterThan(at('ada').x);
    expect(at('emeka').x - at('ada').x).toBeLessThan(CARD_W * 1.5);
    expect(at('tunde').role).toBe('spouse');
    expect(at('ngozi').role).toBe('blood');
    expect(at('ada').isHonoured && at('emeka').isHonoured).toBe(true);
  });

  it('keeps the celebrant first and her siblings to the right', () => {
    expect(at('obi').x).toBeGreaterThan(at('emeka').x);
    expect(at('uche').x).toBeGreaterThan(at('obi').x);
  });

  it('centres children under their parents and keeps cards from overlapping', () => {
    const coupleMid = (at('kemi').x + at('david').x + CARD_W) / 2;
    const kidsMid = (at('baby1').x + at('baby2').x + CARD_W) / 2;
    expect(Math.abs(coupleMid - kidsMid)).toBeLessThan(1);
    const rows = new Map<number, number[]>();
    for (const c of layout.cards) rows.set(c.y, [...(rows.get(c.y) ?? []), c.x]);
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(CARD_W);
    }
  });

  it('draws a marriage line per couple and a descent line per family with children', () => {
    expect(layout.connectors.filter((c) => c.kind === 'marriage')).toHaveLength(5);
    expect(layout.connectors.filter((c) => c.kind === 'descent')).toHaveLength(4);
  });

  it('copes with a tree that has no celebrant or links', () => {
    const lone = layoutTree({ members: [m('x', 1990)], relationships: [] });
    expect(lone.cards).toHaveLength(0);
    expect(lone.unplaced.map((u) => u.id)).toEqual(['x']);
    expect(layoutTree({ members: [], relationships: [] }).width).toBe(0);
  });
});
