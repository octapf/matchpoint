import { Alert } from 'react-native';

/** Thrown by `apiRequest` when `fetch` fails (offline / DNS / TLS). */
export const NETWORK_ERROR_SENTINEL = '__MP_NETWORK__';

/** Exact `error` strings from Vercel API → i18n keys under `apiErrors.*` */
const API_ERROR_I18N: Record<string, string> = {
  'Already registered for this tournament': 'apiErrors.alreadyRegistered',
  'Tournament is full': 'apiErrors.tournamentFull',
  'Tournament is full (max teams reached)': 'apiErrors.tournamentFullMaxTeams',
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
  'Cannot delete tournament while players are registered. Remove all players from the roster first.':
    'apiErrors.cannotDeleteWithPlayers',
  'Both players must be on the waiting list': 'apiErrors.bothPlayersMustBeOnWaitlist',
  'One or more players are already in a team': 'apiErrors.playersAlreadyInTeam',
  'Internal server error': 'apiErrors.internal',
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

export function alertApiError(t: (key: string) => string, err: unknown, fallbackKey: string): void {
  Alert.alert(t('common.error'), apiErrorMessage(err, t, fallbackKey));
}
