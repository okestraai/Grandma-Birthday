import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

/** Advisory lock keys used to serialise rules that span many rows. */
export const LOCK_KEYS = {
  /** Event capacity: RSVPs and admin guest changes. */
  capacity: 70_001,
  /** Storage quota: every stored upload. */
  storage: 70_002,
  /** Check-ins when one check-in covers the whole celebration (the unique index is per event). */
  checkIn: 70_003,
} as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** The client type inside `$transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
