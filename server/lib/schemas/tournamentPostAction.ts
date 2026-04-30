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
      'refereePointsBatch',
      'setServeOrder',
      'auditTournament',
      'placeTournamentBet',
      'pauseTournament',
      'resumeTournament',
      'createGuestPlayer',
      'updateGuestPlayer',
      'deleteGuestPlayer',
      'deleteAllGuestPlayers',
    ]),
  })
  .passthrough();
