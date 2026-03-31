import { z } from 'zod';

export const entryPatchSchema = z
  .object({
    teamId: z.union([z.string(), z.null()]).optional(),
    lookingForPartner: z.boolean().optional(),
    status: z.enum(['joined', 'in_team']).optional(),
  })
  .strip();
