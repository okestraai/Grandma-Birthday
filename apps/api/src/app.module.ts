import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicCacheModule } from './common/public-cache';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { SettingsModule } from './settings/settings.module';
import { QrModule } from './qr/qr.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CelebrationModule } from './celebration/celebration.module';
import { EventsModule } from './events/events.module';
import { CelebrantModule } from './celebrant/celebrant.module';
import { TimelineModule } from './timeline/timeline.module';
import { FamilyModule } from './family/family.module';
import { MediaModule } from './media/media.module';
import { AlbumsModule } from './albums/albums.module';
import { ProgrammeModule } from './programme/programme.module';
import { InvitationsModule } from './invitations/invitations.module';
import { RsvpModule } from './rsvp/rsvp.module';
import { GuestsModule } from './guests/guests.module';
import { CheckInModule } from './checkin/checkin.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { UploadsModule } from './uploads/uploads.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SeoModule } from './seo/seo.module';
import { HealthModule } from './health/health.module';
import { AuthGuard } from './common/guards/auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { createValidationPipe } from './common/validation';
import { RequestIdMiddleware } from './common/request-id.middleware';

@Module({
  imports: [
    AppConfigModule,
    // Default: 300 requests per minute per IP; sensitive routes set tighter limits.
    // In-memory storage: with several API instances, use a shared store (see README).
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }], skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_IN_TESTS !== 'true' }),
    PrismaModule,
    PublicCacheModule,
    AuditModule,
    NotificationsModule,
    StorageModule,
    SettingsModule,
    QrModule,
    AuthModule,
    UsersModule,
    CelebrationModule,
    EventsModule,
    CelebrantModule,
    TimelineModule,
    FamilyModule,
    MediaModule,
    AlbumsModule,
    ProgrammeModule,
    InvitationsModule,
    RsvpModule,
    GuestsModule,
    CheckInModule,
    TestimonialsModule,
    UploadsModule,
    DashboardModule,
    SeoModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
