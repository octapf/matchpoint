import { z } from 'zod';

export const teamSlotWaitlistPostSchema = z
  .object({
    tournamentId: z.string().min(1),
    name: z.string().min(1).max(200),
    playerIds: z.array(z.string()).length(2),
    createdBy: z.string().min(1),
  })
  .strip();
