import { z } from 'zod';

/** POST /api/tournaments/:id — body must include a known `action`. */
export const tournamentPostActionSchema = z
  .object({
    action: z.enum([
      'randomizeGroups',
      'rebalanceGroups',
      'start',
      'generateCategoryMatches',
      'finalizeClassification',
      'removePlayer',
      'updateMatch',
      'claimReferee',
      'refereeHeartbeat',
      'startMatch',
      'refereePoint',
      'setServeOrder',
      'auditTournament',
      'placeTournamentBet',
      'createGuestPlayer',
      'updateGuestPlayer',
      'deleteGuestPlayer',
    ]),
  })
  .passthrough();
