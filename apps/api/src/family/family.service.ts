import { Injectable } from '@nestjs/common';
import type { AdminFamilyMember, AdminFamilyTree, FamilyMember as FamilyMemberDto, FamilyRelationship as RelDto, FamilyTree } from '@birthday/types';
import { Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { assertPhoto } from '../common/utils/media-ref';
import type { FamilyMember, FamilyRelationship } from '../generated/prisma/client';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull, type PublicMediaRow } from '../media/media.mapper';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateRelationshipDto, SpouseDto, UpsertFamilyMemberDto } from './family.dto';

type MemberRow = FamilyMember & { photoMedia: PublicMediaRow | null };

const ORDER = [{ generation: 'asc' as const }, { sortOrder: 'asc' as const }, { birthYear: 'asc' as const }, { createdAt: 'asc' as const }];

export function toPublicMember(m: MemberRow): FamilyMemberDto {
  return {
    id: m.id,
    fullName: m.fullName,
    relationshipLabel: m.relationshipLabel,
    generation: m.generation,
    isCelebrant: m.isCelebrant,
    bio: m.bio,
    birthYear: m.birthYear,
    deathYear: m.deathYear,
    photo: publicMediaOrNull(m.photoMedia),
    sortOrder: m.sortOrder,
  };
}

const toRel = (r: FamilyRelationship): RelDto => ({ id: r.id, fromId: r.fromId, toId: r.toId, type: r.type });

/** The spouse and parents of each member, read from the relationship rows. */
function linksOf(relationships: FamilyRelationship[]) {
  const spouse = new Map<string, string>();
  const parents = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type === 'SPOUSE_OF') {
      spouse.set(r.fromId, r.toId);
      spouse.set(r.toId, r.fromId);
    } else {
      parents.set(r.toId, [...(parents.get(r.toId) ?? []), r.fromId]);
    }
  }
  return { spouse, parents };
}

/**
 * Family members and their links. PARENT_OF (from = parent) and SPOUSE_OF rows are the source
 * of truth; the admin form edits them through `parentIds` and `spouse` so nobody has to manage
 * raw relationships to build a normal tree.
 */
@Injectable()
export class FamilyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async publicTree(): Promise<FamilyTree> {
    const members = await this.prisma.familyMember.findMany({ where: { isPublished: true }, include: { photoMedia: { select: PUBLIC_MEDIA_SELECT } }, orderBy: ORDER });
    const ids = members.map((m) => m.id);
    const relationships = await this.prisma.familyRelationship.findMany({ where: { fromId: { in: ids }, toId: { in: ids } }, orderBy: { createdAt: 'asc' } });
    return { members: members.map(toPublicMember), relationships: relationships.map(toRel) };
  }

  async adminTree(): Promise<AdminFamilyTree> {
    const [members, relationships] = await Promise.all([
      this.prisma.familyMember.findMany({ include: { photoMedia: { select: PUBLIC_MEDIA_SELECT } }, orderBy: ORDER }),
      this.prisma.familyRelationship.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    const { spouse, parents } = linksOf(relationships);
    return {
      members: members.map((m) => ({
        ...toPublicMember(m),
        photoMediaId: m.photoMediaId,
        isPublished: m.isPublished,
        spouseId: spouse.get(m.id) ?? null,
        parentIds: parents.get(m.id) ?? [],
        // Joined by marriage: no parents of their own, but their spouse has parents in the tree.
        marriedIn: !m.isCelebrant && !parents.get(m.id)?.length && Boolean(parents.get(spouse.get(m.id) ?? '')?.length),
      })),
      relationships: relationships.map(toRel),
    };
  }

  async create(dto: UpsertFamilyMemberDto, meta: RequestMeta): Promise<AdminFamilyMember> {
    await this.validate(dto);
    const id = await this.prisma.$transaction(async (tx) => {
      if (dto.isCelebrant) await tx.familyMember.updateMany({ where: { isCelebrant: true }, data: { isCelebrant: false } });
      const generation = await this.generationFor(tx, dto);
      const member = await tx.familyMember.create({ data: { ...this.fields(dto), generation, sortOrder: dto.sortOrder ?? (await this.nextSort(tx)) } });
      if (dto.parentIds) await this.setParents(tx, member.id, dto.parentIds);
      if (dto.spouse !== undefined) await this.setSpouse(tx, member.id, generation, dto.spouse);
      await this.audit.record(meta, { action: 'ADMIN_CHANGED_FAMILY', entityType: 'FamilyMember', entityId: member.id, metadata: { op: 'create' } }, tx);
      return member.id;
    });
    return this.one(id);
  }

  async update(id: string, dto: UpsertFamilyMemberDto, meta: RequestMeta): Promise<AdminFamilyMember> {
    await this.validate(dto, id);
    const current = await this.prisma.familyMember.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Family member');
    await this.prisma.$transaction(async (tx) => {
      if (dto.isCelebrant) await tx.familyMember.updateMany({ where: { isCelebrant: true, id: { not: id } }, data: { isCelebrant: false } });
      if (dto.parentIds) await this.setParents(tx, id, dto.parentIds);
      const generation = dto.parentIds?.length || dto.generation !== undefined ? await this.generationFor(tx, dto) : current.generation;
      await tx.familyMember.update({ where: { id }, data: { ...this.fields(dto), generation, sortOrder: dto.sortOrder } });
      if (generation !== current.generation) await this.shiftDescendants(tx, id, generation);
      if (dto.spouse !== undefined) await this.setSpouse(tx, id, generation, dto.spouse);
      await this.audit.record(meta, { action: 'ADMIN_CHANGED_FAMILY', entityType: 'FamilyMember', entityId: id, metadata: { op: 'update' } }, tx);
    });
    return this.one(id);
  }

  /**
   * Deletes a person and their links. A spouse who only joined by marriage (no parents of their
   * own in the tree) is deleted with them, so nobody is left floating. Children stay.
   */
  async remove(id: string, meta: RequestMeta): Promise<void> {
    const removedSpouse = await this.prisma.$transaction(async (tx) => {
      const member = await tx.familyMember.findUnique({ where: { id } });
      if (!member) throw Errors.notFound('Family member');
      const spouse = await this.spouseOf(tx, id);
      const spouseParents = spouse ? await tx.familyRelationship.count({ where: { type: 'PARENT_OF', toId: spouse.id } }) : 0;
      const ownParents = await tx.familyRelationship.count({ where: { type: 'PARENT_OF', toId: id } });
      // Only a spouse who married into *this* person's line goes with them.
      const takeSpouse = spouse && !spouse.isCelebrant && spouseParents === 0 && (ownParents > 0 || member.isCelebrant);
      await tx.familyMember.deleteMany({ where: { id: { in: takeSpouse ? [id, spouse.id] : [id] } } });
      return takeSpouse ? spouse.id : null;
    });
    await this.audit.record(meta, { action: 'ADMIN_CHANGED_FAMILY', entityType: 'FamilyMember', entityId: id, metadata: { op: 'delete', removedSpouse } });
  }

  async relate(dto: CreateRelationshipDto, meta: RequestMeta): Promise<RelDto> {
    if (dto.fromId === dto.toId) throw Errors.validation({ toId: ['A person cannot be related to themselves.'] });
    const count = await this.prisma.familyMember.count({ where: { id: { in: [dto.fromId, dto.toId] } } });
    if (count !== 2) throw Errors.validation({ fromId: ['Both people must exist.'] });
    const existing = await this.prisma.familyRelationship.findFirst({
      where: { OR: [{ fromId: dto.fromId, toId: dto.toId }, { fromId: dto.toId, toId: dto.fromId, type: dto.type }] },
    });
    if (existing) throw Errors.conflict('These two people are already linked.');
    if (dto.type === 'SPOUSE_OF') {
      const taken = await this.prisma.familyRelationship.findFirst({
        where: { type: 'SPOUSE_OF', OR: [{ fromId: { in: [dto.fromId, dto.toId] } }, { toId: { in: [dto.fromId, dto.toId] } }] },
      });
      if (taken) throw Errors.conflict('One of these people already has a spouse in the tree.');
    } else {
      const parents = await this.prisma.familyRelationship.count({ where: { type: 'PARENT_OF', toId: dto.toId } });
      if (parents >= 2) throw Errors.conflict('This person already has two parents in the tree.');
      if (await this.isAncestor(this.prisma, dto.toId, dto.fromId)) throw Errors.conflict('That link would make someone their own ancestor.');
    }
    const rel = await this.prisma.familyRelationship.create({ data: dto });
    await this.audit.record(meta, { action: 'ADMIN_CHANGED_FAMILY', entityType: 'FamilyRelationship', entityId: rel.id, metadata: { op: 'create', type: dto.type } });
    return toRel(rel);
  }

  async unrelate(id: string, meta: RequestMeta): Promise<void> {
    const { count } = await this.prisma.familyRelationship.deleteMany({ where: { id } });
    if (!count) throw Errors.notFound('Relationship');
    await this.audit.record(meta, { action: 'ADMIN_CHANGED_FAMILY', entityType: 'FamilyRelationship', entityId: id, metadata: { op: 'delete' } });
  }

  // ---------------------------------------------------------------------------

  private fields(dto: UpsertFamilyMemberDto) {
    return {
      fullName: dto.fullName,
      relationshipLabel: dto.relationshipLabel,
      isCelebrant: dto.isCelebrant,
      bio: dto.bio,
      birthYear: dto.birthYear,
      deathYear: dto.deathYear,
      photoMediaId: dto.photoMediaId,
      isPublished: dto.isPublished,
    };
  }

  private async validate(dto: UpsertFamilyMemberDto, id?: string): Promise<void> {
    const years = (d: { birthYear?: number | null; deathYear?: number | null }, field: string) => {
      if (d.birthYear && d.deathYear && d.deathYear < d.birthYear) throw Errors.validation({ [field]: ['Cannot be before the birth year.'] });
    };
    years(dto, 'deathYear');
    if (dto.spouse) years(dto.spouse, 'spouse.deathYear');
    await assertPhoto(this.prisma, dto.photoMediaId, 'photoMediaId');
    await assertPhoto(this.prisma, dto.spouse?.photoMediaId, 'spouse.photoMediaId');

    if (dto.parentIds) {
      const ids = [...new Set(dto.parentIds)];
      if (ids.length !== dto.parentIds.length) throw Errors.validation({ parentIds: ['Choose each parent once.'] });
      if (id && ids.includes(id)) throw Errors.validation({ parentIds: ['A person cannot be their own parent.'] });
      if ((await this.prisma.familyMember.count({ where: { id: { in: ids } } })) !== ids.length) {
        throw Errors.validation({ parentIds: ['Choose parents who are already in the tree.'] });
      }
      if (id) {
        for (const parentId of ids) {
          if (await this.isAncestor(this.prisma, id, parentId)) throw Errors.validation({ parentIds: ['A descendant cannot also be a parent.'] });
        }
        const spouse = await this.spouseOf(this.prisma, id);
        if (spouse && ids.includes(spouse.id)) throw Errors.validation({ parentIds: ['A spouse cannot also be a parent.'] });
      }
    }
  }

  /** Children sit one generation below their oldest-recorded parent. */
  private async generationFor(tx: Tx, dto: UpsertFamilyMemberDto): Promise<number> {
    if (dto.parentIds?.length) {
      const parents = await tx.familyMember.findMany({ where: { id: { in: dto.parentIds } }, select: { generation: true } });
      return Math.max(...parents.map((p) => p.generation)) + 1;
    }
    return dto.generation ?? 0;
  }

  private async nextSort(tx: Tx): Promise<number> {
    return ((await tx.familyMember.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
  }

  private async setParents(tx: Tx, id: string, parentIds: string[]): Promise<void> {
    await tx.familyRelationship.deleteMany({ where: { type: 'PARENT_OF', toId: id } });
    if (parentIds.length) await tx.familyRelationship.createMany({ data: parentIds.map((fromId) => ({ fromId, toId: id, type: 'PARENT_OF' as const })) });
  }

  private async spouseOf(client: PrismaService | Tx, id: string): Promise<FamilyMember | null> {
    const rel = await client.familyRelationship.findFirst({ where: { type: 'SPOUSE_OF', OR: [{ fromId: id }, { toId: id }] } });
    if (!rel) return null;
    return client.familyMember.findUnique({ where: { id: rel.fromId === id ? rel.toId : rel.fromId } });
  }

  /**
   * Creates, updates or removes the member's spouse. A removed spouse who joined by marriage
   * (no parents of their own in the tree) is deleted; anyone else is only unlinked.
   */
  private async setSpouse(tx: Tx, id: string, generation: number, spouse: SpouseDto | null): Promise<void> {
    const existing = await this.spouseOf(tx, id);
    if (spouse === null) {
      if (!existing) return;
      const ownParents = await tx.familyRelationship.count({ where: { type: 'PARENT_OF', toId: existing.id } });
      if (ownParents === 0 && !existing.isCelebrant) await tx.familyMember.delete({ where: { id: existing.id } });
      else await tx.familyRelationship.deleteMany({ where: { type: 'SPOUSE_OF', OR: [{ fromId: id, toId: existing.id }, { fromId: existing.id, toId: id }] } });
      return;
    }
    const data = {
      fullName: spouse.fullName,
      relationshipLabel: spouse.relationshipLabel || existing?.relationshipLabel || 'Spouse',
      birthYear: spouse.birthYear ?? null,
      deathYear: spouse.deathYear ?? null,
      bio: spouse.bio ?? null,
      photoMediaId: spouse.photoMediaId ?? null,
      generation,
    };
    if (existing) {
      await tx.familyMember.update({ where: { id: existing.id }, data });
      return;
    }
    const created = await tx.familyMember.create({ data: { ...data, sortOrder: await this.nextSort(tx) } });
    await tx.familyRelationship.create({ data: { fromId: id, toId: created.id, type: 'SPOUSE_OF' } });
  }

  /** Keeps descendants (and their spouses) one generation below their parents after a move. */
  private async shiftDescendants(tx: Tx, id: string, generation: number): Promise<void> {
    const rels = await tx.familyRelationship.findMany();
    const { spouse } = linksOf(rels);
    const children = (parent: string) => rels.filter((r) => r.type === 'PARENT_OF' && r.fromId === parent).map((r) => r.toId);
    const queue: [string, number][] = [[id, generation]];
    const seen = new Set<string>([id]);
    const partner = spouse.get(id);
    if (partner) await tx.familyMember.update({ where: { id: partner }, data: { generation } });
    while (queue.length) {
      const [person, gen] = queue.shift()!;
      for (const child of children(person)) {
        if (seen.has(child)) continue;
        seen.add(child);
        await tx.familyMember.update({ where: { id: child }, data: { generation: gen + 1 } });
        const childSpouse = spouse.get(child);
        if (childSpouse && !seen.has(childSpouse)) await tx.familyMember.update({ where: { id: childSpouse }, data: { generation: gen + 1 } });
        queue.push([child, gen + 1]);
      }
    }
  }

  /** True if `candidate` is an ancestor of `person` (walks PARENT_OF links upward). */
  private async isAncestor(client: PrismaService | Tx, candidate: string, person: string): Promise<boolean> {
    const links = await client.familyRelationship.findMany({ where: { type: 'PARENT_OF' }, select: { fromId: true, toId: true } });
    const parentsOf = new Map<string, string[]>();
    for (const link of links) parentsOf.set(link.toId, [...(parentsOf.get(link.toId) ?? []), link.fromId]);
    const seen = new Set<string>();
    const stack = [person];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === candidate) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(parentsOf.get(current) ?? []));
    }
    return false;
  }

  private async one(id: string): Promise<AdminFamilyMember> {
    const tree = await this.adminTree();
    const member = tree.members.find((m) => m.id === id);
    if (!member) throw Errors.notFound('Family member');
    return member;
  }
}
