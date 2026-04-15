import { z } from 'zod';
import { isAllowedThemePresetId } from '../themePresetIds';

export const userPatchSchema = z
  .object({
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    gender: z.enum(['male', 'female']).optional(),
    phoneVisible: z.boolean().optional(),
    /**
     * `null`/wrong types must not blow up the whole PATCH (Expo / proxies sometimes send null).
     * Allowlist lives in `server/lib/themePresetIds.ts` (no import from `lib/theme/colors`) so Vercel
     * bundles always include every preset id, including `pearl_frost`.
     */
    themePresetId: z.preprocess(
      (v) => (v === null || v === '' ? undefined : v),
      z
        .string()
        .optional()
        .refine((v) => v === undefined || isAllowedThemePresetId(v), { message: 'Invalid themePresetId' })
    ),
    role: z.enum(['user', 'admin']).optional(),
  })
  .strip();
