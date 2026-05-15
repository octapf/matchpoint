import { describe, expect, it } from 'vitest';
import type { Match, Team, TournamentCategory } from '../types';
import {
  assignCategories as assignClientCategories,
  computeStandingsForGroup as computeClientStandingsForGroup,
} from '../lib/tournamentStandings';
import {
  assignCategoriesForDivision as assignServerCategoriesForDivision,
  computeStandingsForGroup as computeServerStandingsForGroup,
} from '../server/lib/tournamentStandings';

const team = (id: string, name: string): Team =>
  ({
    _id: id,
    name,
    tournamentId: 't',
    playerIds: [],
    createdBy: '',
    createdAt: '',
    updatedAt: '',
  }) as Team;

const completed = (id: string, teamAId: string, teamBId: string, pointsA: number, pointsB: number): Match =>
  ({
    _id: id,
    tournamentId: 't',
    stage: 'classification',
    teamAId,
    teamBId,
    pointsA,
    pointsB,
    winnerId: pointsA > pointsB ? teamAId : teamBId,
    status: 'completed',
    createdAt: '',
    updatedAt: '',
  }) as Match;

describe('client tournament standings parity', () => {
  it('uses the server mini-league tie breakers inside a tied group', () => {
    const teams = [
      team('aaaaaaaaaaaaaaaaaaaaaaaa', 'A'),
      team('bbbbbbbbbbbbbbbbbbbbbbbb', 'B'),
      team('cccccccccccccccccccccccc', 'C'),
    ];
    const matches = [
      completed('m1', teams[0]!._id, teams[1]!._id, 21, 10),
      completed('m2', teams[1]!._id, teams[2]!._id, 21, 20),
      completed('m3', teams[2]!._id, teams[0]!._id, 21, 20),
    ];

    const client = computeClientStandingsForGroup({ teams, matches, tieBreakSeed: 'seed' }).map((r) => r.team._id);
    const server = computeServerStandingsForGroup({ teams, matches, tieBreakSeed: 'seed' }).map((r) => r.teamId);

    expect(client).toEqual(server);
    expect(client).toEqual([teams[0]!._id, teams[2]!._id, teams[1]!._id]);
  });

  it('uses point differential before points for cross-group category assignment', () => {
    const a = team('aaaaaaaaaaaaaaaaaaaaaaaa', 'A');
    const b = team('bbbbbbbbbbbbbbbbbbbbbbbb', 'B');
    const c = team('cccccccccccccccccccccccc', 'C');
    const d = team('dddddddddddddddddddddddd', 'D');
    const categories: TournamentCategory[] = ['Gold', 'Silver'];

    const clientGroups = [
      computeClientStandingsForGroup({ teams: [a, c], matches: [completed('g1', a._id, c._id, 21, 10)], tieBreakSeed: 'seed' }),
      computeClientStandingsForGroup({ teams: [b, d], matches: [completed('g2', b._id, d._id, 30, 29)], tieBreakSeed: 'seed' }),
    ];
    const serverGroups = [
      computeServerStandingsForGroup({ teams: [a, c], matches: [completed('g1', a._id, c._id, 21, 10)], tieBreakSeed: 'seed' }),
      computeServerStandingsForGroup({ teams: [b, d], matches: [completed('g2', b._id, d._id, 30, 29)], tieBreakSeed: 'seed' }),
    ];

    const client = assignClientCategories({
      standingsByGroup: clientGroups,
      categories,
      categoryFractions: null,
      categoryCounts: { Gold: 1, Silver: 1 },
      singleCategoryAdvanceFraction: 0.5,
      tieBreakSeed: 'seed',
    });
    const server = assignServerCategoriesForDivision({
      standingsByGroup: serverGroups,
      categories,
      categoryFractions: null,
      categoryCounts: { Gold: 1, Silver: 1 },
      singleCategoryAdvanceFraction: 0.5,
      tieBreakSeed: 'seed',
    });

    expect(client.globalOrder).toEqual(server.globalOrder);
    expect(client.teamCategory.get(a._id)).toBe('Gold');
    expect(client.teamCategory.get(b._id)).toBe('Silver');
  });
});
