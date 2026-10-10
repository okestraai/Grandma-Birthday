import { Inject, Injectable } from '@nestjs/common';
import type { SeoMetadata } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { escapeHtml } from '../notifications/templates';
import type { Celebrant, Event } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ageAt } from '../celebrant/celebrant.mapper';
import { mediaVersion, PUBLIC_MEDIA_SELECT, type PublicMediaRow } from '../media/media.mapper';

const PRIVATE_PREFIXES = ['/admin', '/invitation/', '/memories/upload/', '/api/'];

interface Context {
  event: Event;
  celebrant: Celebrant & { portraitMedia: PublicMediaRow | null };
  siteName: string;
  description: string;
  image: string | null;
}

/**
 * Server-side SEO so crawlers and link previews (which do not run JavaScript) get real
 * titles, descriptions, images and JSON-LD. The web server calls this for each page request.
 */
@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private abs(path: string): string {
    return `${this.config.publicWebUrl}${path}`;
  }

  private mediaUrl(media: PublicMediaRow | null | undefined): string | null {
    return media && media.status === 'APPROVED' && media.kind === 'PHOTO' ? this.abs(`/api/media/${media.id}/medium?v=${mediaVersion(media)}`) : null;
  }

  private async context(): Promise<Context> {
    const [event, celebrant, settings] = await Promise.all([
      this.settings.getEvent(),
      this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 }, include: { portraitMedia: { select: PUBLIC_MEDIA_SELECT } } }),
      this.prisma.settings.findUniqueOrThrow({ where: { id: 1 }, include: { ogImageMedia: { select: PUBLIC_MEDIA_SELECT }, heroMedia: { select: PUBLIC_MEDIA_SELECT } } }),
    ]);
    const age = ageAt(celebrant.birthDate, event.startsAt) ?? 70;
    const siteName = settings.siteTitle ?? `${celebrant.preferredName} at ${age}`;
    const description =
      settings.siteDescription ??
      `Join us in celebrating ${age} years of life, love and legacy: ${celebrant.fullName}. ${event.venueName}${event.city ? `, ${event.city}` : ''}.`;
    return {
      event,
      celebrant,
      siteName,
      description,
      image: this.mediaUrl(settings.ogImageMedia) ?? this.mediaUrl(settings.heroMedia) ?? this.mediaUrl(celebrant.portraitMedia),
    };
  }

  private eventLd(ctx: Context): Record<string, unknown> {
    const { event, celebrant } = ctx;
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.name,
      description: event.description ?? ctx.description,
      startDate: event.startsAt.toISOString(),
      endDate: event.endsAt.toISOString(),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: event.venueName,
        address: { '@type': 'PostalAddress', streetAddress: event.address, addressLocality: event.city ?? undefined },
        ...(event.latitude !== null && event.longitude !== null ? { geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } } : {}),
      },
      image: ctx.image ? [ctx.image] : undefined,
      url: this.abs('/event'),
      performer: { '@type': 'Person', name: celebrant.fullName },
    };
  }

  private personLd(ctx: Context): Record<string, unknown> {
    const { celebrant } = ctx;
    return {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: celebrant.fullName,
      alternateName: celebrant.preferredName !== celebrant.fullName ? celebrant.preferredName : undefined,
      honorificPrefix: celebrant.honorific ?? undefined,
      birthDate: celebrant.birthDate?.toISOString().slice(0, 10),
      birthPlace: celebrant.birthPlace ?? undefined,
      description: celebrant.introduction ?? undefined,
      image: this.mediaUrl(celebrant.portraitMedia) ?? undefined,
      url: this.abs('/about'),
    };
  }

  async forPath(rawPath: string): Promise<SeoMetadata> {
    const path = (`/${rawPath.replace(/^\/+/, '')}`.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
    const ctx = await this.context();
    const base = { canonicalUrl: this.abs(path === '/' ? '/' : path), imageUrl: ctx.image, type: 'website' as const, noindex: false, jsonLd: [] as Record<string, unknown>[] };
    const title = (t: string) => `${t} · ${ctx.siteName}`;

    if (PRIVATE_PREFIXES.some((p) => path.startsWith(p) || `${path}/` === p)) {
      return { ...base, title: ctx.siteName, description: ctx.description, noindex: true };
    }

    switch (path) {
      case '/':
        return { ...base, title: ctx.siteName, description: ctx.description, jsonLd: [this.eventLd(ctx), this.personLd(ctx)] };
      case '/about':
        return { ...base, type: 'profile', title: title(`About ${ctx.celebrant.preferredName}`), description: ctx.celebrant.introduction ?? ctx.description, jsonLd: [this.personLd(ctx)] };
      case '/story':
        return { ...base, type: 'article', title: title('Seventy Years: The Story'), description: `Milestones from the life of ${ctx.celebrant.fullName}.` };
      case '/family':
        return { ...base, title: title('Family'), description: `The family of ${ctx.celebrant.fullName}.` };
      case '/gallery':
        return { ...base, title: title('Memories'), description: `Photographs from seventy years of ${ctx.celebrant.preferredName}'s life.` };
      case '/event':
        return { ...base, title: title(ctx.event.name), description: `${ctx.event.venueName}. ${ctx.event.description ?? ctx.description}`.slice(0, 300), jsonLd: [this.eventLd(ctx)] };
      case '/programme':
        return { ...base, title: title('Programme'), description: `The order of the evening for ${ctx.event.name}.` };
      case '/testimonials':
        return { ...base, title: title('Tributes'), description: `Birthday messages and tributes for ${ctx.celebrant.fullName}.` };
      case '/rsvp':
        return { ...base, title: title('RSVP'), description: `Reply to your invitation to ${ctx.event.name}.` };
      default:
        break;
    }

    const album = path.match(/^\/gallery\/([a-z0-9-]+)$/);
    if (album) {
      const row = await this.prisma.album.findFirst({ where: { slug: album[1], isPublished: true }, include: { coverMedia: { select: PUBLIC_MEDIA_SELECT } } });
      if (row) {
        return {
          ...base,
          title: title(row.title),
          description: row.description ?? `${row.title}: photographs of ${ctx.celebrant.preferredName}.`,
          imageUrl: this.mediaUrl(row.coverMedia) ?? ctx.image,
          jsonLd: [{ '@context': 'https://schema.org', '@type': 'ImageGallery', name: row.title, description: row.description ?? undefined, url: base.canonicalUrl }],
        };
      }
    }
    return { ...base, title: title('Page not found'), description: ctx.description, noindex: true };
  }

  async sitemap(): Promise<string> {
    const albums = await this.prisma.album.findMany({ where: { isPublished: true, media: { some: { status: 'APPROVED' } } }, select: { slug: true, updatedAt: true } });
    const today = new Date().toISOString().slice(0, 10);
    const pages = ['/', '/about', '/story', '/family', '/gallery', '/event', '/programme', '/testimonials', '/rsvp'].map((p) => ({ loc: this.abs(p), lastmod: today }));
    const albumPages = albums.map((a) => ({ loc: this.abs(`/gallery/${a.slug}`), lastmod: a.updatedAt.toISOString().slice(0, 10) }));
    const urls = [...pages, ...albumPages].map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }
}
