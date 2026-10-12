import type { CheckInRecord } from '@birthday/types';
import { Prisma } from '../generated/prisma/client';

export const CHECKIN_INCLUDE = {
  invitation: { select: { code: true } },
  event: { select: { name: true } },
  guest: { select: { fullName: true, category: { select: { name: true } } } },
  checkedInBy: { select: { name: true } },
  reversedBy: { select: { name: true } },
} satisfies Prisma.CheckInInclude;

export type CheckInRow = Prisma.CheckInGetPayload<{ include: typeof CHECKIN_INCLUDE }>;

export function toCheckInRecord(row: CheckInRow): CheckInRecord {
  return {
    id: row.id,
    invitationId: row.invitationId,
    eventId: row.eventId,
    eventName: row.event.name,
    code: row.invitation.code,
    guestName: row.guest.fullName,
    categoryName: row.guest.category?.name ?? null,
    partySize: row.partySize,
    checkedInAt: row.checkedInAt.toISOString(),
    checkedInByName: row.checkedInBy?.name ?? null,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversedByName: row.reversedBy?.name ?? null,
    reverseReason: row.reverseReason,
  };
}
