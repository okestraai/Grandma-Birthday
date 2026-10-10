import type { FamilyMember, FamilyRelationship, FamilyTree } from '@birthday/types';
import { formatYears, generationLabel, givenName, isDeceased, relationsOf } from './layout';

let seq = 0;
function member(id: string, generation: number, extra: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id,
    fullName: extra.fullName ?? `Person ${id.toUpperCase()}`,
    relationshipLabel: 'Relative',
    generation,
    isCelebrant: false,
    bio: null,
    birthYear: null,
    deathYear: null,
    photo: null,
    sortOrder: seq++,
    ...extra,
  };
}
const parentOf = (fromId: string, toId: string): FamilyRelationship => ({ id: `p-${fromId}-${toId}-${seq++}`, fromId, toId, type: 'PARENT_OF' });
const spouseOf = (fromId: string, toId: string): FamilyRelationship => ({ id: `s-${fromId}-${toId}-${seq++}`, fromId, toId, type: 'SPOUSE_OF' });


/** Father F & mother M; celebrant C (married to S) with siblings B1, B2; C's children K1, K2 (K1 married to K1s); grandchild G. */
function sampleTree(): FamilyTree {
  seq = 0;
  const members = [
    member('f', -1, { fullName: 'Chief Father', sortOrder: 1 }),
    member('m', -1, { fullName: 'Mother', sortOrder: 2 }),
    member('b1', 0, { sortOrder: 1 }),
    member('c', 0, { fullName: 'Dr. Margaret Okonkwo', isCelebrant: true, sortOrder: 2 }),
    member('s', 0, { sortOrder: 3 }),
    member('b2', 0, { sortOrder: 4 }),
    member('k2', 1, { sortOrder: 2 }),
    member('k1', 1, { sortOrder: 1 }),
    member('k1s', 1, { sortOrder: 3 }),
    member('g', 2, { sortOrder: 1 }),
  ];
  const relationships = [
    spouseOf('f', 'm'),
    parentOf('f', 'b1'), parentOf('m', 'b1'),
    parentOf('f', 'c'), parentOf('m', 'c'),
    parentOf('f', 'b2'), parentOf('m', 'b2'),
    spouseOf('c', 's'),
    parentOf('c', 'k1'), parentOf('s', 'k1'),
    parentOf('c', 'k2'), parentOf('s', 'k2'),
    spouseOf('k1s', 'k1'),
    parentOf('k1', 'g'),
  ];
  return { members, relationships };
}

describe('relationsOf', () => {
  it('lists spouses, parents and children sorted by sortOrder', () => {
    const tree = sampleTree();
    const rel = relationsOf(tree, 'c');
    expect(rel.spouses.map((m) => m.id)).toEqual(['s']);
    expect(rel.parents.map((m) => m.id)).toEqual(['f', 'm']);
    expect(rel.children.map((m) => m.id)).toEqual(['k1', 'k2']);
  });

  it('returns empty lists for unknown members', () => {
    expect(relationsOf(sampleTree(), 'nope')).toEqual({ spouses: [], parents: [], children: [] });
  });
});

describe('helpers', () => {
  it('formats years', () => {
    expect(formatYears({ birthYear: 1932, deathYear: 2010 })).toBe('1932 – 2010');
    expect(formatYears({ birthYear: 1980, deathYear: null })).toBe('b. 1980');
    expect(formatYears({ birthYear: null, deathYear: 2001 })).toBe('d. 2001');
    expect(formatYears({ birthYear: null, deathYear: null })).toBeNull();
    expect(isDeceased({ deathYear: 2010 })).toBe(true);
    expect(isDeceased({ deathYear: null })).toBe(false);
  });

  it('labels distant generations', () => {
    expect(generationLabel(3)).toBe('Great-grandchildren');
    expect(generationLabel(4)).toBe('Great-great-grandchildren');
    expect(generationLabel(-3)).toBe('Great-grandparents');
    expect(generationLabel(-4)).toBe('Great-great-grandparents');
  });

  it('extracts a given name, skipping honorifics', () => {
    expect(givenName('Dr. Margaret Okonkwo')).toBe('Margaret');
    expect(givenName('Chief (Mrs) Ada')).toBe('Ada');
    expect(givenName('Ada')).toBe('Ada');
    expect(givenName('')).toBe('');
  });
});
