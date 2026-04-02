import { ObjectId } from 'mongodb';
import { z } from 'zod';

const divisionEnum = z.enum(['men', 'women', 'mixed']);
const categoryEnum = z.enum(['Gold', 'Silver', 'Bronze']);

/** POST /api/tournaments — create tournament body */
export const tournamentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  divisions: z.array(divisionEnum).min(1),
  categories: z.array(categoryEnum).optional(),
  maxTeams: z.coerce.number().int().min(2).max(512),
  pointsToWin: z.coerce.number().int().min(1).max(99).optional(),
  setsPerMatch: z.coerce.number().int().min(1).max(7).optional(),
  groupCount: z.coerce.number().optional(),
  categoryPhaseFormat: z.enum(['round_robin', 'single_elim']).optional(),
  inviteLink: z.string().min(1).max(512),
  organizerIds: z.array(z.string().min(1)).min(1),
  visibility: z.enum(['public', 'private']).optional(),
})
  .refine((d) => !!(d.startDate?.trim() || d.date?.trim()), {
    message: 'Provide startDate or date',
    path: ['startDate'],
  })
  .transform((d) => ({
    ...d,
    categories: d.categories ?? [],
  }))
  .refine((d) => d.organizerIds.every((id) => ObjectId.isValid(id)), {
    message: 'Invalid organizer id',
    path: ['organizerIds'],
  });

export type TournamentCreateBody = z.infer<typeof tournamentCreateSchema>;
