import { z } from 'zod';

export const userPatchSchema = z
  .object({
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    gender: z.enum(['male', 'female']).optional(),
    phoneVisible: z.boolean().optional(),
    themePresetId: z
      .enum([
        'classic',
        'sport_blue',
        'sport_orange',
        'neon_pop',
        'lavender_mist',
        'blush_ice',
        'candy_pink',
        'forest_lime',
        'sand_rose',
      ])
      .optional(),
    role: z.enum(['user', 'admin']).optional(),
  })
  .strip();
