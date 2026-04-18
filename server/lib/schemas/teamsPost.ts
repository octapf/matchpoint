import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { isGuestPlayerSlot } from '../../../lib/playerSlots';

export const teamsPostSchema = z
  .object({
    tournamentId: z.string().min(1),
    name: z.string().min(1).max(200),
    playerIds: z.array(z.string()).length(2),
    createdBy: z.string().min(1),
    groupIndex: z.union([z.number(), z.string()]).optional(),
  })
  .superRefine((data, ctx) => {
    if (!ObjectId.isValid(data.tournamentId)) {
      ctx.addIssue({ code: 'custom', path: ['tournamentId'], message: 'Invalid tournament id' });
    }
    for (const pid of data.playerIds) {
      const ok = ObjectId.isValid(pid) || isGuestPlayerSlot(pid);
      if (!ok) {
        ctx.addIssue({ code: 'custom', path: ['playerIds'], message: 'Invalid player id' });
      }
    }
  });

export type TeamsPostBody = z.infer<typeof teamsPostSchema>;
