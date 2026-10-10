import type { AdminFamilyMember } from '@birthday/types';
import { buildFamilyOutline, buildFamilyUnits, childOfOptions, derivedGeneration, descendantIds, unitLabel } from './family-utils';
import { sampleFamily } from './family-fixtures';

const labels = (units: { members: AdminFamilyMember[] }[]) => units.map(unitLabel);

describe('buildFamilyUnits', () => {
  it('pairs spouses into one unit, blood relative first', () => {
    expect(labels(buildFamilyUnits(sampleFamily()))).toEqual(['Papa & Mama', 'Ngozi & Tunde', 'Emeka', 'Ada & Chidi', 'Kemi', 'Stranger']);
  });

  it('uses the same key for a couple whichever partner comes first', () => {
    const units = buildFamilyUnits(sampleFamily());
    expect(units.find((u) => u.members[0].id === 'Ada')?.key).toBe(['Ada', 'Chidi'].sort().join(','));
  });
});

describe('descendantIds / childOfOptions', () => {
  it('finds children, grandchildren and so on', () => {
    expect([...descendantIds(sampleFamily(), 'Ngozi')].sort()).toEqual(['Ada', 'Kemi']);
  });

  it('excludes the person, their spouse and their descendants', () => {
    const members = sampleFamily();
    expect(labels(childOfOptions(members, 'Ngozi'))).toEqual(['Papa & Mama', 'Emeka', 'Stranger']);
    expect(labels(childOfOptions(members, 'Tunde'))).toEqual(['Papa & Mama', 'Emeka', 'Stranger']);
    expect(labels(childOfOptions(members, 'Kemi'))).toEqual(['Papa & Mama', 'Ngozi & Tunde', 'Emeka', 'Ada & Chidi', 'Stranger']);
  });

  it('offers every unit for a new person', () => {
    expect(childOfOptions(sampleFamily(), null)).toHaveLength(6);
  });
});

describe('derivedGeneration', () => {
  it('is one below the parents', () => {
    expect(derivedGeneration(sampleFamily(), ['Ada', 'Chidi'])).toBe(2);
    expect(derivedGeneration(sampleFamily(), [])).toBeNull();
  });
});

describe('buildFamilyOutline', () => {
  it('starts from the celebrant’s parents and nests children under their parents’ unit', () => {
    const { roots, unlinked } = buildFamilyOutline(sampleFamily());
    expect(roots).toHaveLength(1);
    const [top] = roots;
    expect(unitLabel(top.unit)).toBe('Papa & Mama');
    expect(top.children.map((c) => unitLabel(c.unit))).toEqual(['Ngozi & Tunde', 'Emeka']);
    const ada = top.children[0].children[0];
    expect(unitLabel(ada.unit)).toBe('Ada & Chidi');
    expect(ada.children.map((c) => unitLabel(c.unit))).toEqual(['Kemi']);
    expect(unlinked.map((m) => m.id)).toEqual(['Stranger']);
  });
});
