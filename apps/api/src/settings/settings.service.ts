import { Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import type { RsvpAvailability } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { Celebration, Event, Settings } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { randomToken } from '../common/utils/crypto';

/** What availability needs to know about each event. */
export type AvailabilityEvent = Pick<Event, 'endsAt' | 'rsvpEnabled'> & { full: boolean };

/**
 * Owns the single-row Celebration and Settings tables and the rules derived from them
 * (RSVP availability, capacity usage). Creates placeholder rows on first boot so a fresh
 * production database works before anyone has run the seed.
 */
@Injectable()
export class SettingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Settings');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.nodeEnv === 'test') return;
    await this.ensureDefaults();
  }

  async ensureDefaults(): Promise<void> {
    const start = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    start.setUTCHours(16, 0, 0, 0);
    const created: string[] = [];
    if (!(await this.prisma.settings.findUnique({ where: { id: 1 } }))) {
      await this.prisma.settings.create({
        data: {
          id: 1,
          uploadToken: randomToken(),
          storageQuotaBytes: BigInt(this.config.uploadDefaults.maxStorageBytes),
          maxPhotoBytes: this.config.uploadDefaults.maxPhotoBytes,
          maxVideoBytes: this.config.uploadDefaults.maxVideoBytes,
        },
      });
      created.push('settings');
    }
    if (!(await this.prisma.celebration.findUnique({ where: { id: 1 } }))) {
      await this.prisma.celebration.create({ data: { id: 1, name: 'A 70th Birthday Celebration', rsvpOpen: false } });
      created.push('celebration');
    }
    if ((await this.prisma.event.count()) === 0) {
      await this.prisma.event.create({
        data: {
          slug: 'main',
          name: 'A 70th Birthday Celebration',
          startsAt: start,
          endsAt: new Date(start.getTime() + 6 * 3600 * 1000),
          venueName: 'Venue to be announced',
          address: 'Address to be announced',
        },
      });
      created.push('event');
    }
    if (!(await this.prisma.celebrant.findUnique({ where: { id: 1 } }))) {
      await this.prisma.celebrant.create({ data: { id: 1, fullName: 'The Celebrant', preferredName: 'The Celebrant' } });
      created.push('celebrant');
    }
    if (created.length) this.logger.log(`Created placeholder ${created.join(', ')}; edit them in the admin dashboard.`);
  }

  async getSettings(client: PrismaService | Tx = this.prisma): Promise<Settings> {
    const settings = await client.settings.findUnique({ where: { id: 1 } });
    if (!settings) throw new NotFoundException('Settings are not configured yet.');
    return settings;
  }

  async getCelebration(client: PrismaService | Tx = this.prisma): Promise<Celebration> {
    const celebration = await client.celebration.findUnique({ where: { id: 1 } });
    if (!celebration) throw new NotFoundException('The celebration is not configured yet.');
    return celebration;
  }

  /**
   * People confirmed as attending: each attending guest plus their named companions. A guest is
   * counted once however many events they attend, so this is the celebration-wide figure.
   */
  async confirmedPeople(client: PrismaService | Tx = this.prisma, excludeGuestId?: string): Promise<number> {
    const rows = await client.rsvp.findMany({
      where: { response: 'ATTENDING', guestId: excludeGuestId ? { not: excludeGuestId } : undefined },
      select: { companionCount: true },
    });
    return rows.reduce((sum, row) => sum + 1 + row.companionCount, 0);
  }

  /** Confirmed people per guest category id ('' = no category). */
  async confirmedPeopleByCategory(client: PrismaService | Tx = this.prisma, excludeGuestId?: string): Promise<Map<string, number>> {
    const rows = await client.rsvp.findMany({
      where: { response: 'ATTENDING', guestId: excludeGuestId ? { not: excludeGuestId } : undefined },
      select: { companionCount: true, guest: { select: { categoryId: true } } },
    });
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = row.guest.categoryId ?? '';
      totals.set(key, (totals.get(key) ?? 0) + 1 + row.companionCount);
    }
    return totals;
  }

  /**
   * Whether replies are accepted. Ended: the last event is over. Full: the celebration is, or every
   * event still taking replies is. No event taking replies counts as closed by the admin.
   */
  availability(celebration: Celebration, confirmedPeople: number, events: AvailabilityEvent[], now = new Date()): RsvpAvailability {
    const replyable = events.filter((e) => e.rsvpEnabled && now < e.endsAt);
    let closedReason: RsvpAvailability['closedReason'] = null;
    if (!events.length || events.every((e) => now >= e.endsAt)) closedReason = 'EVENT_ENDED';
    else if (!celebration.rsvpOpen || !replyable.length) closedReason = 'CLOSED_BY_ADMIN';
    else if (celebration.rsvpDeadline && now > celebration.rsvpDeadline) closedReason = 'DEADLINE_PASSED';
    else if (confirmedPeople >= celebration.capacity || replyable.every((e) => e.full)) closedReason = 'CAPACITY_REACHED';
    return {
      open: closedReason === null,
      mode: celebration.rsvpMode,
      deadline: celebration.rsvpDeadline?.toISOString() ?? null,
      closedReason,
    };
  }

  uploadUrl(token: string): string {
    return `${this.config.publicWebUrl}/memories/upload/${token}`;
  }
}
