import type { AdminCelebrant, Celebrant as CelebrantDto } from '@birthday/types';
import type { Celebrant } from '../generated/prisma/client';
import { publicMediaOrNull, type PublicMediaRow } from '../media/media.mapper';

/** Age reached on the event date (e.g. 70). */
export function ageAt(birthDate: Date | null, on: Date): number | null {
  if (!birthDate) return null;
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birthDate.getUTCMonth() || (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export function toPublicCelebrant(c: Celebrant & { portraitMedia: PublicMediaRow | null }, eventDate: Date): CelebrantDto {
  return {
    fullName: c.fullName,
    preferredName: c.preferredName,
    honorific: c.honorific,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    birthPlace: c.birthPlace,
    age: ageAt(c.birthDate, eventDate),
    heroHeadline: c.heroHeadline,
    introduction: c.introduction,
    biography: c.biography,
    quote: c.quote,
    quoteAttribution: c.quoteAttribution,
    achievements: c.achievements,
    values: c.values,
    portrait: publicMediaOrNull(c.portraitMedia),
  };
}

export function toAdminCelebrant(c: Celebrant & { portraitMedia: PublicMediaRow | null }, eventDate: Date): AdminCelebrant {
  return { ...toPublicCelebrant(c, eventDate), portraitMediaId: c.portraitMediaId };
}
