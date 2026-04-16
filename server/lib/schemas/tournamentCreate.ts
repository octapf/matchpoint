import { ObjectId } from 'mongodb';
import { z } from 'zod';

const divisionEnum = z.enum(['men', 'women', 'mixed']);
const categoryEnum = z.enum(['Gold', 'Silver', 'Bronze']);
const isoDate = z.string().min(4).max(40);
const divisionDateRangeSchema = z.object({
  startDate: isoDate,
  endDate: isoDate,
});

/** POST /api/tournaments — create tournament body */
export const tournamentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  divisionDates: z
    .object({
      men: divisionDateRangeSchema.optional(),
      women: divisionDateRangeSchema.optional(),
      mixed: divisionDateRangeSchema.optional(),
    })
    .optional(),
  location: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  divisions: z.array(divisionEnum).min(1),
  categories: z.array(categoryEnum).optional(),
  maxTeams: z.coerce.number().int().min(2).max(512),
  pointsToWin: z.coerce.number().int().min(1).max(99).optional(),
  setsPerMatch: z.coerce.number().int().min(1).max(7).optional(),
  groupCount: z.coerce.number().optional(),
  categoryPhaseFormat: z.enum(['round_robin', 'single_elim']).optional(),
  classificationMatchesPerOpponent: z.coerce.number().int().min(1).max(5).optional(),
  singleCategoryAdvanceFraction: z.coerce.number().optional(),
  categoryFractions: z
    .object({
      Gold: z.number().optional(),
      Silver: z.number().optional(),
      Bronze: z.number().optional(),
    })
    .optional(),
  inviteLink: z.string().min(1).max(512),
  organizerIds: z.array(z.string().min(1)).min(1),
  visibility: z.enum(['public', 'private']).optional(),
  bettingEnabled: z.boolean().optional(),
  bettingAllowWinner: z.boolean().optional(),
  bettingAllowScore: z.boolean().optional(),
  bettingAnonymous: z.boolean().optional(),
})
  .refine((d) => {
    // Allow legacy create payloads to omit divisionDates; they will be expanded from startDate/endDate.
    const hasLegacy = !!(d.startDate?.trim() || d.date?.trim());
    const hasDiv = d.divisionDates != null && typeof d.divisionDates === 'object';
    return hasDiv || hasLegacy;
  }, {
    message: 'Provide divisionDates or startDate/date',
    path: ['divisionDates'],
  })
  .transform((d) => ({
    ...d,
    categories: d.categories ?? [],
    // Expand legacy start/end into divisionDates for all enabled divisions (so server always stores per-division).
    divisionDates: (() => {
      const divs = [...new Set(d.divisions)];
      const legacyStart = (d.startDate || d.date || '').trim();
      const legacyEnd = (d.endDate || d.date || legacyStart).trim();
      const src = d.divisionDates ?? {};
      const out: Record<string, { startDate: string; endDate: string } | undefined> = {
        men: (src as any).men,
        women: (src as any).women,
        mixed: (src as any).mixed,
      };
      for (const div of divs) {
        if (!out[div] && legacyStart) out[div] = { startDate: legacyStart, endDate: legacyEnd || legacyStart };
      }
      return out;
    })(),
  }))
  .superRefine((d, ctx) => {
    const divs = [...new Set(d.divisions)];
    const dd = (d as any).divisionDates as Record<string, { startDate: string; endDate: string } | undefined> | undefined;
    for (const div of divs) {
      const r = dd?.[div];
      if (!r?.startDate || !r?.endDate) {
        ctx.addIssue({ code: 'custom', message: `Missing divisionDates for ${div}`, path: ['divisionDates', div] });
        continue;
      }
      if (String(r.endDate).trim() < String(r.startDate).trim()) {
        ctx.addIssue({ code: 'custom', message: `End date must be on or after start date (${div})`, path: ['divisionDates', div, 'endDate'] });
      }
    }
  })
  .refine((d) => d.organizerIds.every((id) => ObjectId.isValid(id)), {
    message: 'Invalid organizer id',
    path: ['organizerIds'],
  });

export type TournamentCreateBody = z.infer<typeof tournamentCreateSchema>;
