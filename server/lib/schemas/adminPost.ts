import { z } from 'zod';

export const adminPostSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('devSeed'), force: z.boolean().optional() }),
  z.object({ action: z.literal('devSeedPurge') }),
  z.object({
    action: z.literal('dbBackfill'),
    tournamentId: z.string().optional(),
  }),
  z.object({ action: z.literal('dbIndexes') }),
  z.object({ action: z.literal('reorderClassification'), tournamentId: z.string() }),
]);

export type AdminPostBody = z.infer<typeof adminPostSchema>;
