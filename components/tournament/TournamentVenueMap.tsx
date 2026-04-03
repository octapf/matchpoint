/**
 * TypeScript entry: Metro resolves `TournamentVenueMap.ios` / `.android` / `.web` at bundle time
 * and does not use this file on those platforms when the specific file exists.
 */
export type { TournamentVenueMapProps } from './TournamentVenueMap.android';
export { TournamentVenueMap } from './TournamentVenueMap.android';
