import { Alert } from 'react-native';
import { captureAppException } from '@/lib/observability/app';

/** Thrown by `apiRequest` when `fetch` fails (offline / DNS / TLS). */
export const NETWORK_ERROR_SENTINEL = '__MP_NETWORK__';

/** Exact `error` strings from Vercel API → i18n keys under `apiErrors.*` */
const API_ERROR_I18N: Record<string, string> = {
  'Already registered for this tournament': 'apiErrors.alreadyRegistered',
  'Tournament is full': 'apiErrors.tournamentFull',
  'Tournament is full (max teams reached)': 'apiErrors.tournamentFullMaxTeams',
  'Tournament is full — join the team slot waitlist': 'apiErrors.tournamentFullJoinTeamSlotWaitlist',
  'Tournament is not full yet — create a team normally': 'apiErrors.tournamentNotFullCreateTeamNormally',
  'This pair is already on the team waiting list': 'apiErrors.pairAlreadyOnTeamSlotWaitlist',
  'Not allowed to enqueue this team': 'apiErrors.notAllowedToEnqueueTeam',
  'Not allowed to remove this waitlist entry': 'apiErrors.notAllowedToRemoveTeamSlotWaitlistEntry',
  'Waitlist entry not found': 'apiErrors.teamSlotWaitlistEntryNotFound',
  'Waitlist entry is not active': 'apiErrors.teamSlotWaitlistEntryNotActive',
  'This group is full': 'apiErrors.groupFull',
  'Target group is full': 'apiErrors.targetGroupFull',
  'You can only be in one team per tournament': 'apiErrors.oneTeamPerTournament',
  'Tournament is cancelled': 'apiErrors.tournamentCancelled',
  'Tournament is not full yet — join normally': 'apiErrors.waitlistNotFullYet',
  'Already on the waiting list': 'apiErrors.alreadyOnWaitlist',
  'Authentication required': 'apiErrors.authRequired',
  'Invalid credentials': 'apiErrors.invalidCredentials',
  'Tournament not found': 'apiErrors.tournamentNotFound',
  'Entry not found': 'apiErrors.entryNotFound',
  'Team not found': 'apiErrors.teamNotFound',
  'Cannot remove the last organizer': 'apiErrors.lastOrganizer',
  'Each division must have at least one organizer registered in that division': 'apiErrors.organizerDivisionCoverage',
  'Organize-only organizers cannot register as players': 'apiErrors.organizeOnlyCannotRegister',
  'Organize-only organizers must cover at least one division': 'apiErrors.organizeOnlyMustCoverDivision',
  'Only organizers can delete this tournament': 'apiErrors.onlyOrganizersDelete',
  'Only organizers can change team roster or group': 'apiErrors.onlyOrganizersTeamRosterOrGroup',
  'Team name cannot be changed after the tournament has started': 'apiErrors.teamNameLockedAfterStart',
  'Cannot delete tournament while players are registered. Remove all players from the roster first.':
    'apiErrors.cannotDeleteWithPlayers',
  'Cannot delete tournament while teams exist. Remove all teams first.': 'apiErrors.cannotDeleteWithTeams',
  'Guests can only be added by an organizer': 'apiErrors.guestsOnlyByOrganizer',
  'You must be the registered player pairing with a guest': 'apiErrors.mustBeRegisteredPlayerWithGuest',
  'You must be on the waiting list for this division': 'apiErrors.youMustBeOnWaitlistForDivision',
  'Registered player must be on the waiting list for this division':
    'apiErrors.registeredPlayerMustBeOnWaitlistDivision',
  'Match is locked by another referee': 'apiErrors.matchLockedByOtherReferee',
  'Referee changed': 'apiErrors.refereeChanged',
  'Both players must be on the waiting list': 'apiErrors.bothPlayersMustBeOnWaitlist',
  'You must be on the waiting list to invite someone': 'apiErrors.waitlistInviteMustBeOnList',
  'That player is not on the waiting list': 'apiErrors.waitlistInviteTargetNotOnList',
  'Cannot invite yourself': 'apiErrors.waitlistInviteSelf',
  'One or more players are already in a team': 'apiErrors.playersAlreadyInTeam',
  'All team slots must be filled before creating groups': 'apiErrors.allTeamSlotsForGroups',
  'Distribute teams into groups before starting': 'apiErrors.distributeGroupsBeforeStart',
  'Tournament already started': 'apiErrors.tournamentAlreadyStarted',
  'Internal server error': 'apiErrors.internal',
  // Guest players (POST /api/tournaments/:id actions)
  'Guest is on a team; remove them from the team first': 'apiErrors.guestPlayerOnTeam',
  'Invalid displayName': 'apiErrors.guestInvalidDisplayName',
  'Invalid gender': 'apiErrors.guestInvalidGender',
  'Guest player not found': 'apiErrors.guestPlayerNotFound',
  'Invalid guest id': 'apiErrors.guestInvalidId',
  'Invalid guestId': 'apiErrors.guestInvalidId',
  'No valid fields to update': 'apiErrors.guestNoFieldsToUpdate',
  'Failed to create guest player': 'apiErrors.guestCreateFailed',
};

export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    return (
      m.includes('network request failed') ||
      m.includes('failed to fetch') ||
      m.includes('networkerror') ||
      m === NETWORK_ERROR_SENTINEL.toLowerCase()
    );
  }
  return false;
}

/**
 * User-facing message: network → i18n, known API strings → i18n, else raw message or fallback key.
 */
export function apiErrorMessage(
  err: unknown,
  t: (key: string) => string,
  fallbackKey: string
): string {
  if (err instanceof Error && err.message === NETWORK_ERROR_SENTINEL) {
    return t('common.networkError');
  }
  if (isNetworkError(err)) {
    return t('common.networkError');
  }
  if (err instanceof Error && err.message.startsWith('API not configured')) {
    return t('apiErrors.apiNotConfigured');
  }
  if (err instanceof Error && err.message) {
    const key = API_ERROR_I18N[err.message];
    if (key) return t(key);
    if (err.message.includes('not enabled for this tournament')) {
      return t('apiErrors.divisionNotEnabledForPair');
    }
    return t('apiErrors.internal');
  }
  return t(fallbackKey);
}

function isExpectedApiError(err: unknown): boolean {
  if (err instanceof Error && err.message === NETWORK_ERROR_SENTINEL) return true;
  if (isNetworkError(err)) return true;
  if (err instanceof Error && err.message.startsWith('API not configured')) return true;
  if (err instanceof Error && API_ERROR_I18N[err.message]) return true;
  if (err instanceof Error && err.message.includes('not enabled for this tournament')) return true;
  return false;
}

export function alertApiError(t: (key: string) => string, err: unknown, fallbackKey: string): void {
  if (!isExpectedApiError(err)) {
    captureAppException(err, { kind: 'api', fallbackKey });
  }
  Alert.alert(t('common.error'), apiErrorMessage(err, t, fallbackKey));
}
