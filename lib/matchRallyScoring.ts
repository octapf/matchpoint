/**
 * Live rally scoring for a single set (match detail + `refereePoint`).
 * Score can grow until ABS cap; matches end only when explicitly finalized.
 */

/** Hard cap so scores cannot grow without bound via taps. */
export const RALLY_POINTS_ABS_CAP = 99;

// (keep file focused: only the ABS cap constant is used across client/server)
