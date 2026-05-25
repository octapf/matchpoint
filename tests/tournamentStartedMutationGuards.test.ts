import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';
import { deleteGuestPlayer } from '../server/lib/tournamentGuestPlayerActions';
import type { Db } from 'mongodb';

describe('started tournament mutation guards', () => {
  it('blocks group rebalance after the tournament has started', async () => {
    const tournamentId = new ObjectId().toString();
    let teamUpdated = false;
    const db = {
      collection(name: string) {
        if (name === 'tournaments') {
          return {
            findOne: async () => ({ _id: new ObjectId(tournamentId), startedAt: '2026-05-25T10:00:00.000Z' }),
          };
        }
        if (name === 'teams') {
          return {
            updateOne: async () => {
              teamUpdated = true;
              return { modifiedCount: 1 };
            },
          };
        }
        return {
          countDocuments: async () => 0,
        };
      },
    } as unknown as Db;

    await expect(rebalanceTournamentTeams(db, tournamentId)).rejects.toThrow('Tournament has started');
    expect(teamUpdated).toBe(false);
  });

  it('blocks guest deletion after the tournament has started', async () => {
    const tournamentId = new ObjectId().toString();
    const guestId = new ObjectId().toString();
    let guestDeleted = false;
    const db = {
      collection(name: string) {
        if (name === 'tournaments') {
          return {
            findOne: async () => ({ _id: new ObjectId(tournamentId), phase: 'classification' }),
          };
        }
        if (name === 'tournament_guest_players') {
          return {
            deleteOne: async () => {
              guestDeleted = true;
              return { deletedCount: 1 };
            },
          };
        }
        return {
          deleteMany: async () => ({ deletedCount: 0 }),
        };
      },
    } as unknown as Db;

    await expect(deleteGuestPlayer(db, tournamentId, guestId)).resolves.toEqual({
      ok: false,
      error: 'Tournament already started',
    });
    expect(guestDeleted).toBe(false);
  });
});
