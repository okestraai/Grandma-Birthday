import type { AdminFamilyMember } from '@birthday/types';

let order = 0;
export function person(id: string, over: Partial<AdminFamilyMember> = {}): AdminFamilyMember {
  return {
    id,
    fullName: id,
    relationshipLabel: 'Relative',
    generation: 0,
    isCelebrant: false,
    bio: null,
    birthYear: null,
    deathYear: null,
    photo: null,
    sortOrder: order++,
    photoMediaId: null,
    isPublished: true,
    spouseId: null,
    parentIds: [],
    marriedIn: false,
    ...over,
  };
}

/**
 * Papa & Mama (top)
 *   Ngozi (celebrant) & Tunde (married in)
 *     Ada & Chidi (married in)
 *       Kemi
 *   Emeka
 * Stranger (unlinked)
 */
export function sampleFamily(): AdminFamilyMember[] {
  order = 0;
  return [
    person('Papa', { generation: -1, spouseId: 'Mama' }),
    person('Mama', { generation: -1, spouseId: 'Papa' }),
    person('Ngozi', { isCelebrant: true, spouseId: 'Tunde', parentIds: ['Papa', 'Mama'] }),
    person('Tunde', { spouseId: 'Ngozi', marriedIn: true }),
    person('Emeka', { parentIds: ['Papa', 'Mama'] }),
    person('Chidi', { generation: 1, spouseId: 'Ada', marriedIn: true }),
    person('Ada', { generation: 1, spouseId: 'Chidi', parentIds: ['Ngozi', 'Tunde'] }),
    person('Kemi', { generation: 2, parentIds: ['Ada', 'Chidi'] }),
    person('Stranger', { generation: 3 }),
  ];
}
