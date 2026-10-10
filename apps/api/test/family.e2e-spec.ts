import { createTestApp, login, resetDb, type Session, type TestContext } from './helpers';

describe('Family tree editing (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    admin = await login(ctx, 'admin@test.local');
  });
  afterAll(() => ctx.app.close());

  const post = (body: object) => admin.agent.post('/api/admin/family').set('X-CSRF-Token', admin.csrf).send(body);
  const put = (id: string, body: object) => admin.agent.put(`/api/admin/family/${id}`).set('X-CSRF-Token', admin.csrf).send(body);

  it('builds a family with spouses and "child of" links, deriving generations', async () => {
    const dad = (await post({ fullName: 'Papa Eze', relationshipLabel: 'Father', generation: -1, spouse: { fullName: 'Mama Eze', relationshipLabel: 'Mother' } }).expect(201)).body;
    expect(dad.spouseId).toBeTruthy();
    const celebrant = (
      await post({ fullName: 'Ada Eze', relationshipLabel: 'The celebrant', isCelebrant: true, parentIds: [dad.id, dad.spouseId], spouse: { fullName: 'Emeka Okonkwo', relationshipLabel: 'Husband' } }).expect(201)
    ).body;
    expect(celebrant.generation).toBe(0);
    expect(celebrant.parentIds.sort()).toEqual([dad.id, dad.spouseId].sort());

    const child = (await post({ fullName: 'Ngozi Okonkwo', relationshipLabel: 'Daughter', parentIds: [celebrant.id, celebrant.spouseId], spouse: { fullName: 'Tunde Bello', relationshipLabel: 'Son-in-law' } }).expect(201)).body;
    expect(child.generation).toBe(1);
    const grandchild = (await post({ fullName: 'Kemi Bello', relationshipLabel: 'Granddaughter', parentIds: [child.id, child.spouseId] }).expect(201)).body;
    expect(grandchild.generation).toBe(2);
    const great = (await post({ fullName: 'Baby Bello', relationshipLabel: 'Great-grandchild', parentIds: [grandchild.id] }).expect(201)).body;
    expect(great.generation).toBe(3);

    const tree = (await admin.agent.get('/api/admin/family').expect(200)).body;
    const byName = (n: string) => tree.members.find((m: { fullName: string }) => m.fullName === n);
    expect(byName('Tunde Bello')).toMatchObject({ generation: 1, marriedIn: true, relationshipLabel: 'Son-in-law' });
    expect(byName('Ngozi Okonkwo').marriedIn).toBe(false);
    expect(byName('Mama Eze').marriedIn).toBe(false);

    // The public tree carries the same links.
    const pub = (await ctx.http().get('/api/family').expect(200)).body;
    expect(pub.members).toHaveLength(8);
    expect(pub.relationships.filter((r: { type: string }) => r.type === 'SPOUSE_OF')).toHaveLength(3);
  });

  it('updates and removes a spouse; a married-in spouse is deleted, a blood relative only unlinked', async () => {
    const child = (await post({ fullName: 'Chidi Okonkwo', relationshipLabel: 'Son', generation: 1, spouse: { fullName: 'Adaora', relationshipLabel: 'Daughter-in-law' } }).expect(201)).body;
    await put(child.id, { fullName: 'Chidi Okonkwo', relationshipLabel: 'Son', spouse: { fullName: 'Adaora Okonkwo', birthYear: 1983 } }).expect(200);
    const spouse = await ctx.prisma.familyMember.findUniqueOrThrow({ where: { id: child.spouseId } });
    expect(spouse).toMatchObject({ fullName: 'Adaora Okonkwo', birthYear: 1983, relationshipLabel: 'Daughter-in-law', generation: 1 });

    const removed = (await put(child.id, { fullName: 'Chidi Okonkwo', relationshipLabel: 'Son', spouse: null }).expect(200)).body;
    expect(removed.spouseId).toBeNull();
    expect(await ctx.prisma.familyMember.count({ where: { id: spouse.id } })).toBe(0);
  });

  it('moving a person under new parents shifts their descendants and spouse', async () => {
    const top = (await post({ fullName: 'Top Person', relationshipLabel: 'Grandparent', generation: -1 }).expect(201)).body;
    const mid = (await post({ fullName: 'Mid Person', relationshipLabel: 'Child', generation: 3, spouse: { fullName: 'Mid Spouse' } }).expect(201)).body;
    const low = (await post({ fullName: 'Low Person', relationshipLabel: 'Grandchild', parentIds: [mid.id] }).expect(201)).body;
    expect(low.generation).toBe(4);
    await put(mid.id, { fullName: 'Mid Person', relationshipLabel: 'Child', parentIds: [top.id] }).expect(200);
    const gens = Object.fromEntries((await ctx.prisma.familyMember.findMany()).map((m) => [m.fullName, m.generation]));
    expect(gens).toMatchObject({ 'Top Person': -1, 'Mid Person': 0, 'Mid Spouse': 0, 'Low Person': 1 });
  });

  it('deleting a person also deletes a spouse who married in, but keeps their children', async () => {
    const top = (await post({ fullName: 'Top Parent', relationshipLabel: 'Father', generation: -1 }).expect(201)).body;
    const child = (await post({ fullName: 'Blood Child', relationshipLabel: 'Son', parentIds: [top.id], spouse: { fullName: 'In Law' } }).expect(201)).body;
    const kid = (await post({ fullName: 'Little One', relationshipLabel: 'Grandchild', parentIds: [child.id, child.spouseId] }).expect(201)).body;
    await admin.agent.delete(`/api/admin/family/${child.id}`).set('X-CSRF-Token', admin.csrf).expect(204);
    const left = (await ctx.prisma.familyMember.findMany()).map((m) => m.fullName).sort();
    expect(left).toEqual(['Little One', 'Top Parent']);
    expect(kid.generation).toBe(1);
  });

  it('rejects impossible links', async () => {
    const a = (await post({ fullName: 'Person A', relationshipLabel: 'Parent', generation: 0 }).expect(201)).body;
    const b = (await post({ fullName: 'Person B', relationshipLabel: 'Child', parentIds: [a.id] }).expect(201)).body;
    expect((await put(a.id, { fullName: 'Person A', relationshipLabel: 'Parent', parentIds: [b.id] }).expect(400)).body.details).toHaveProperty('parentIds');
    await put(a.id, { fullName: 'Person A', relationshipLabel: 'Parent', parentIds: [a.id] }).expect(400);
    await post({ fullName: 'Person C', relationshipLabel: 'Child', parentIds: [a.id, a.id] }).expect(400);
    await post({ fullName: 'Person D', relationshipLabel: 'Child', parentIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
    await post({ fullName: 'Person E', relationshipLabel: 'Child', parentIds: [a.id, b.id, a.id] }).expect(400);
  });
});
