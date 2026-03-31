import { z } from 'zod';

export const entriesPostSchema = z.object({
  tournamentId: z.string().min(1),
  userId: z.string().min(1),
  lookingForPartner: z.boolean().optional(),
});

export type EntriesPostBody = z.infer<typeof entriesPostSchema>;
