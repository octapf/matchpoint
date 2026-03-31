import { z } from 'zod';

export const teamPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    playerIds: z.array(z.string()).optional(),
    groupIndex: z.union([z.number(), z.string()]).optional(),
  })
  .strip();
