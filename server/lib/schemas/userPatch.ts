import { z } from 'zod';

export const userPatchSchema = z
  .object({
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    gender: z.enum(['male', 'female']).optional(),
    phoneVisible: z.boolean().optional(),
    role: z.enum(['user', 'admin']).optional(),
  })
  .strip();
