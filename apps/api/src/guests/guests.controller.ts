import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AdminGuestDetail, AdminGuestListItem, AdminRsvpQuestion, GuestCategory, Paginated, SendInvitationsResult } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import type { RsvpQuestion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateGuestDto, GuestListQuery, RevokeInvitationDto, SendInvitationsDto, UpdateGuestDto, UpsertCategoryDto, UpsertQuestionDto } from './guests.dto';
import { GuestsService } from './guests.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('Admin: guests')
@ApiCookieAuth()
@Controller('admin')
@RequirePermissions('guests:manage')
export class GuestsController {
  constructor(
    private readonly guests: GuestsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---- Guests ---------------------------------------------------------------

  @Get('guests')
  list(@Query() query: GuestListQuery): Promise<Paginated<AdminGuestListItem>> {
    return this.guests.list(query);
  }

  @Get('guests/export.csv')
  @ApiOperation({ summary: 'CSV export with the same filters as the list (max 10,000 rows)' })
  async export(@Query() query: GuestListQuery, @Res() res: Response): Promise<void> {
    const csv = await this.guests.exportCsv(query);
    res.type('text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="guests-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  }

  @Post('guests')
  create(@Body() dto: CreateGuestDto, @Req() req: RequestWithUser): Promise<AdminGuestDetail> {
    return this.guests.create(dto, requestMeta(req));
  }

  @Get('guests/:id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminGuestDetail> {
    return this.guests.detail(id);
  }

  @Put('guests/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuestDto, @Req() req: RequestWithUser): Promise<AdminGuestDetail> {
    return this.guests.update(id, dto, requestMeta(req));
  }

  @Delete('guests/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    return this.guests.remove(id, requestMeta(req));
  }

  @Post('guests/:id/invitation/resend')
  @HttpCode(200)
  resend(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<AdminGuestDetail> {
    return this.guests.resend(id, requestMeta(req));
  }

  @Post('guests/:id/invitation/revoke')
  @HttpCode(200)
  revoke(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeInvitationDto, @Req() req: RequestWithUser): Promise<AdminGuestDetail> {
    return this.guests.revoke(id, dto.reason, requestMeta(req));
  }

  @Post('guests/:id/invitation/reinstate')
  @HttpCode(200)
  reinstate(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<AdminGuestDetail> {
    return this.guests.reinstate(id, requestMeta(req));
  }

  @Post('guests/:id/invitation/regenerate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a new invitation link; the old QR code stops working' })
  regenerate(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<AdminGuestDetail> {
    return this.guests.regenerate(id, requestMeta(req));
  }

  @Post('invitations/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Email invitations to chosen guests, or to everyone not yet sent one' })
  send(@Body() dto: SendInvitationsDto, @Req() req: RequestWithUser): Promise<SendInvitationsResult> {
    return this.guests.sendMany(dto, requestMeta(req));
  }

  @Get('invitations')
  invitations(@Query() query: GuestListQuery): Promise<Paginated<AdminGuestListItem>> {
    return this.guests.list(query, true);
  }

  // ---- Categories -----------------------------------------------------------

  @Get('guest-categories')
  async categories(): Promise<GuestCategory[]> {
    const [rows, byCategory] = await Promise.all([
      this.prisma.guestCategory.findMany({ include: { _count: { select: { guests: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.settings.confirmedPeopleByCategory(),
    ]);
    return rows.map((c) => ({
      capacity: c.capacity,
      confirmedPeople: byCategory.get(c.id) ?? 0,
      full: c.capacity !== null && (byCategory.get(c.id) ?? 0) >= c.capacity,
      id: c.id,
      name: c.name,
      description: c.description,
      defaultCompanions: c.defaultCompanions,
      selfSelectable: c.selfSelectable,
      color: c.color,
      sortOrder: c.sortOrder,
      guestCount: c._count.guests,
    }));
  }

  @Post('guest-categories')
  async createCategory(@Body() dto: UpsertCategoryDto, @Req() req: RequestWithUser): Promise<GuestCategory> {
    await this.assertUniqueCategory(dto.name);
    await this.assertCapacity(dto.capacity);
    const max = (await this.prisma.guestCategory.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const row = await this.prisma.guestCategory.create({ data: { ...dto, sortOrder: dto.sortOrder ?? max + 1 } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_GUEST_CATEGORY', entityType: 'GuestCategory', entityId: row.id, metadata: { op: 'create' } });
    return (await this.categories()).find((c) => c.id === row.id)!;
  }

  @Put('guest-categories/:id')
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertCategoryDto, @Req() req: RequestWithUser): Promise<GuestCategory> {
    if (!(await this.prisma.guestCategory.findUnique({ where: { id } }))) throw Errors.notFound('Category');
    await this.assertUniqueCategory(dto.name, id);
    await this.assertCapacity(dto.capacity, id);
    await this.prisma.guestCategory.update({ where: { id }, data: dto });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_GUEST_CATEGORY', entityType: 'GuestCategory', entityId: id, metadata: { op: 'update' } });
    return (await this.categories()).find((c) => c.id === id)!;
  }

  @Delete('guest-categories/:id')
  @HttpCode(204)
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    const category = await this.prisma.guestCategory.findUnique({ where: { id }, include: { _count: { select: { guests: true } } } });
    if (!category) throw Errors.notFound('Category');
    if (category._count.guests > 0) {
      throw Errors.conflict(`${category._count.guests} guest(s) are in this category. Move them to another category first.`);
    }
    await this.prisma.guestCategory.delete({ where: { id } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_GUEST_CATEGORY', entityType: 'GuestCategory', entityId: id, metadata: { op: 'delete' } });
  }

  // ---- RSVP questions -------------------------------------------------------

  @Get('rsvp-questions')
  async questions(): Promise<AdminRsvpQuestion[]> {
    const rows = await this.prisma.rsvpQuestion.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(toQuestion);
  }

  @Post('rsvp-questions')
  async createQuestion(@Body() dto: UpsertQuestionDto, @Req() req: RequestWithUser): Promise<AdminRsvpQuestion> {
    const options = this.options(dto);
    const max = (await this.prisma.rsvpQuestion.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const row = await this.prisma.rsvpQuestion.create({ data: { ...dto, options, sortOrder: dto.sortOrder ?? max + 1 } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_RSVP_QUESTION', entityType: 'RsvpQuestion', entityId: row.id, metadata: { op: 'create' } });
    return toQuestion(row);
  }

  @Put('rsvp-questions/:id')
  async updateQuestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertQuestionDto, @Req() req: RequestWithUser): Promise<AdminRsvpQuestion> {
    if (!(await this.prisma.rsvpQuestion.findUnique({ where: { id } }))) throw Errors.notFound('Question');
    const row = await this.prisma.rsvpQuestion.update({ where: { id }, data: { ...dto, options: this.options(dto) } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_RSVP_QUESTION', entityType: 'RsvpQuestion', entityId: id, metadata: { op: 'update' } });
    return toQuestion(row);
  }

  @Delete('rsvp-questions/:id')
  @HttpCode(204)
  async deleteQuestion(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    const { count } = await this.prisma.rsvpQuestion.deleteMany({ where: { id } });
    if (!count) throw Errors.notFound('Question');
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_RSVP_QUESTION', entityType: 'RsvpQuestion', entityId: id, metadata: { op: 'delete' } });
  }

  private options(dto: UpsertQuestionDto): string[] {
    const options = [...new Set((dto.options ?? []).map((o) => o.trim()).filter(Boolean))];
    if (dto.type === 'SELECT' && options.length < 2) throw Errors.validation({ options: ['Give at least two options.'] });
    return dto.type === 'SELECT' ? options : [];
  }

  /** A category's share cannot be below its confirmed guests, nor push the total past the event capacity. */
  private async assertCapacity(capacity: number | null | undefined, id?: string): Promise<void> {
    if (capacity === undefined || capacity === null) return;
    const [event, others, byCategory] = await Promise.all([
      this.settings.getEvent(),
      this.prisma.guestCategory.aggregate({ where: { id: id ? { not: id } : undefined }, _sum: { capacity: true } }),
      this.settings.confirmedPeopleByCategory(),
    ]);
    const confirmed = id ? (byCategory.get(id) ?? 0) : 0;
    if (capacity < confirmed) throw Errors.validation({ capacity: [`${confirmed} people in this category are already confirmed.`] });
    const total = (others._sum.capacity ?? 0) + capacity;
    if (total > event.capacity) {
      throw Errors.validation({ capacity: [`Categories would then hold ${total} places, more than the event capacity of ${event.capacity}.`] });
    }
  }

  private async assertUniqueCategory(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.guestCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, id: exceptId ? { not: exceptId } : undefined } });
    if (clash) throw Errors.validation({ name: ['A category with this name already exists.'] });
  }
}

function toQuestion(q: RsvpQuestion): AdminRsvpQuestion {
  return { id: q.id, label: q.label, helpText: q.helpText, type: q.type, options: q.options, required: q.required, sortOrder: q.sortOrder, isActive: q.isActive };
}
