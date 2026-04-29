import { describe, expect, it } from 'vitest';
import type { BracketMatchRow } from '../components/tournament/detail/CategoryBracketDiagram';
import { isTeamEliminatedFromCategoryBracketRows } from '../lib/categoryBracketElimination';

const T = (id: string, name: string) =>
  ({
    _id: id,
    name,
    tournamentId: 't',
    playerIds: [],
    createdBy: '',
    createdAt: '',
    updatedAt: '',
  }) as BracketMatchRow['teamA'];

describe('isTeamEliminatedFromCategoryBracketRows', () => {
  it('returns false when the team has not lost yet', () => {
    const rows: BracketMatchRow[] = [
      {
        id: 'm0',
        teamA: T('aaaaaaaaaaaaaaaaaaaaaaaa', 'A'),
        teamB: T('bbbbbbbbbbbbbbbbbbbbbbbb', 'B'),
        pointsA: 0,
        pointsB: 0,
        winnerId: '',
        status: 'scheduled',
        orderIndex: 0,
      },
    ];
    expect(isTeamEliminatedFromCategoryBracketRows('aaaaaaaaaaaaaaaaaaaaaaaa', rows)).toBe(false);
  });

  it('returns true when the team lost and has no later match', () => {
    const loser = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const winner = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const rows: BracketMatchRow[] = [
      {
        id: 'm0',
        teamA: T(loser, 'L'),
        teamB: T(winner, 'W'),
        pointsA: 0,
        pointsB: 0,
        winnerId: winner,
        status: 'completed',
        orderIndex: 0,
      },
    ];
    expect(isTeamEliminatedFromCategoryBracketRows(loser, rows)).toBe(true);
    expect(isTeamEliminatedFromCategoryBracketRows(winner, rows)).toBe(false);
  });

  it('returns false when the team lost semi but appears later (bronze)', () => {
    const semiLoser = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const semiWinner = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const otherSemiLoser = 'cccccccccccccccccccccccc';
    const otherSemiWinner = 'dddddddddddddddddddddddd';
    const rows: BracketMatchRow[] = [
      {
        id: 'semi1',
        teamA: T(semiLoser, 'A'),
        teamB: T(semiWinner, 'B'),
        pointsA: 0,
        pointsB: 0,
        winnerId: semiWinner,
        status: 'completed',
        orderIndex: 0,
        bracketRound: 1,
      },
      {
        id: 'semi2',
        teamA: T(otherSemiLoser, 'C'),
        teamB: T(otherSemiWinner, 'D'),
        pointsA: 0,
        pointsB: 0,
        winnerId: otherSemiWinner,
        status: 'completed',
        orderIndex: 1,
        bracketRound: 1,
      },
      {
        id: 'bronze',
        teamA: T(semiLoser, 'A'),
        teamB: T(otherSemiLoser, 'C'),
        pointsA: 0,
        pointsB: 0,
        winnerId: '',
        status: 'scheduled',
        orderIndex: 2,
        bracketRound: 3,
        isBronzeMatch: true,
      },
    ];
    expect(isTeamEliminatedFromCategoryBracketRows(semiLoser, rows)).toBe(false);
  });
});
