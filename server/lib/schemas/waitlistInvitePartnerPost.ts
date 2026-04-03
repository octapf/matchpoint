import { ObjectId } from 'mongodb';
import { z } from 'zod';

export const waitlistInvitePartnerPostSchema = z
  .object({
    action: z.literal('invitePartner'),
    tournamentId: z.string().min(1),
    division: z.enum(['men', 'women', 'mixed']),
    toUserId: z.string().min(1),
  })
  .superRefine((d, ctx) => {
    if (!ObjectId.isValid(d.tournamentId)) ctx.addIssue({ code: 'custom', path: ['tournamentId'], message: 'Invalid' });
    if (!ObjectId.isValid(d.toUserId)) ctx.addIssue({ code: 'custom', path: ['toUserId'], message: 'Invalid' });
  });
