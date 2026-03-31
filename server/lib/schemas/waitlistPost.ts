import { ObjectId } from 'mongodb';
import { z } from 'zod';

export const waitlistPostSchema = z
  .object({
    tournamentId: z.string().min(1),
    userId: z.string().min(1),
  })
  .superRefine((d, ctx) => {
    if (!ObjectId.isValid(d.tournamentId)) ctx.addIssue({ code: 'custom', path: ['tournamentId'], message: 'Invalid' });
    if (!ObjectId.isValid(d.userId)) ctx.addIssue({ code: 'custom', path: ['userId'], message: 'Invalid' });
  });
