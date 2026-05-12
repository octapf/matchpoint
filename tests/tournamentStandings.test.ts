import { describe, expect, it } from 'vitest';
import type { Match, Team } from '../types';
import { assignCategories, computeStandingsForGroup } from '../lib/tournamentStandings';

const team = (id: string, name: string): Team => ({
  _id: id,
  name,
  tournamentId: 't1',
  playerIds: [],
  createdBy: 'organizer',
  createdAt: '',
  updatedAt: '',
});

const completedMatch = (id: string, teamAId: string, teamBId: string, pointsA: number, pointsB: number): Match => ({
  _id: id,
  tournamentId: 't1',
  stage: 'classification',
  division: 'mixed',
  groupIndex: 0,
  teamAId,
  teamBId,
  setsPerMatch: 1,
  pointsToWin: 21,
  status: 'completed',
  pointsA,
  pointsB,
  winnerId: pointsA > pointsB ? teamAId : teamBId,
  createdAt: '',
  updatedAt: '',
});

describe('tournament standings', () => {
  it('uses point differential before points scored for cross-group category assignment', () => {
    const alpha = team('aaaaaaaaaaaaaaaaaaaaaaaa', 'Alpha');
    const beta = team('bbbbbbbbbbbbbbbbbbbbbbbb', 'Beta');
    const gamma = team('cccccccccccccccccccccccc', 'Gamma');
    const delta = team('dddddddddddddddddddddddd', 'Delta');
    const echo = team('eeeeeeeeeeeeeeeeeeeeeeee', 'Echo');
    const foxtrot = team('ffffffffffffffffffffffff', 'Foxtrot');

    const groupOne = computeStandingsForGroup({
      teams: [alpha, beta, gamma],
      matches: [
        completedMatch('m1', alpha._id, beta._id, 21, 0),
        completedMatch('m2', alpha._id, gamma._id, 21, 0),
      ],
      tieBreakSeed: 't1',
    });
    const groupTwo = computeStandingsForGroup({
      teams: [delta, echo, foxtrot],
      matches: [
        completedMatch('m3', delta._id, echo._id, 30, 29),
        completedMatch('m4', delta._id, foxtrot._id, 30, 29),
      ],
      tieBreakSeed: 't1',
    });

    expect(groupOne[0]?.team._id).toBe(alpha._id);
    expect(groupOne[0]?.pointDiff).toBe(42);
    expect(groupTwo[0]?.team._id).toBe(delta._id);
    expect(groupTwo[0]?.points).toBe(60);
    expect(groupTwo[0]?.pointDiff).toBe(2);

    const assigned = assignCategories({
      standingsByGroup: [groupOne, groupTwo],
      categories: ['Gold', 'Silver'],
      categoryFractions: null,
      categoryCounts: { Gold: 1, Silver: 5 },
      singleCategoryAdvanceFraction: 0.5,
      tieBreakSeed: 't1',
    });

    expect(assigned.globalOrder.slice(0, 2)).toEqual([alpha._id, delta._id]);
    expect(assigned.teamCategory.get(alpha._id)).toBe('Gold');
    expect(assigned.teamCategory.get(delta._id)).toBe('Silver');
  });

  it('uses head-to-head mini-table differential before total points inside a tied group', () => {
    const alpha = team('aaaaaaaaaaaaaaaaaaaaaaaa', 'Alpha');
    const beta = team('bbbbbbbbbbbbbbbbbbbbbbbb', 'Beta');
    const gamma = team('cccccccccccccccccccccccc', 'Gamma');

    const standings = computeStandingsForGroup({
      teams: [alpha, beta, gamma],
      matches: [
        completedMatch('m1', alpha._id, beta._id, 21, 0),
        completedMatch('m2', beta._id, gamma._id, 30, 29),
        completedMatch('m3', gamma._id, alpha._id, 21, 20),
      ],
      tieBreakSeed: 't1',
    });

    expect(standings.map((row) => row.team._id)).toEqual([alpha._id, gamma._id, beta._id]);
    expect(standings.map((row) => row.wins)).toEqual([1, 1, 1]);
    expect(standings.map((row) => row.pointDiff)).toEqual([20, 0, -20]);
  });
});
