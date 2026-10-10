import { Errors } from '../errors';
import type { PrismaService } from '../../prisma/prisma.service';

/** Validates that a referenced media id exists and is a photo; returns it unchanged. */
export async function assertPhoto(prisma: PrismaService, id: string | null | undefined, field: string): Promise<void> {
  if (!id) return;
  const media = await prisma.media.findUnique({ where: { id }, select: { kind: true } });
  if (!media || media.kind !== 'PHOTO') throw Errors.validation({ [field]: ['Choose a photo from the media library.'] });
}
