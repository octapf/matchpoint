import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Team } from '@/types';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';

export function TeamsTab({
  t,
  canCreateTeam,
  onCreateTeam,
  organizerActions,
  teamsCountText,
  loadingTeams,
  filteredTeams,
  renderTeam,
  emptyTextStyle,
  teamsTabCreateRowStyle,
  teamCardStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  canCreateTeam: boolean;
  onCreateTeam: () => void;
  organizerActions?: React.ReactNode;
  teamsCountText?: string;
  loadingTeams: boolean;
  filteredTeams: Team[];
  renderTeam: (team: Team) => React.ReactNode;
  emptyTextStyle: unknown;
  teamsTabCreateRowStyle: unknown;
  teamCardStyle: unknown;
}) {
  const { tokens } = useTheme();
  return (
    <>
      {organizerActions}
      {canCreateTeam ? (
        <View style={teamsTabCreateRowStyle as never}>
          <Pressable
            style={teamCardStyle as never}
            onPress={onCreateTeam}
            accessibilityRole="button"
            accessibilityLabel={t('tournamentDetail.createTeamFromEntries')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', fontStyle: 'italic', color: Colors.text }} numberOfLines={1}>
                  {t('tournamentDetail.newTeamPlaceholder')}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={28} color={tokens.accentHover} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 10 }}>
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    flexGrow: 0,
                    flexShrink: 1,
                    maxWidth: '48%',
                    minWidth: 0,
                    paddingVertical: 2,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: Colors.surfaceLight,
                      borderWidth: 1,
                      borderColor: Colors.surfaceLight,
                    }}
                  />
                  <View
                    style={{
                      height: 10,
                      width: 70,
                      borderRadius: 6,
                      backgroundColor: Colors.surfaceLight,
                    }}
                  />
                </View>
              ))}
            </View>
          </Pressable>
        </View>
      ) : null}

      {teamsCountText ? (
        <Text
          style={{
            fontSize: 14,
            color: Colors.text,
            fontWeight: '700',
            fontStyle: 'italic',
            textTransform: 'uppercase',
            textAlign: 'left',
            paddingHorizontal: 6,
            marginTop: 4,
            marginBottom: 8,
          }}
        >
          {teamsCountText}
        </Text>
      ) : null}

      {loadingTeams ? (
        <View style={teamCardStyle as never}>
          <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton height={36} width={80} borderRadius={18} />
            <Skeleton height={36} width={80} borderRadius={18} />
          </View>
        </View>
      ) : filteredTeams.length === 0 ? (
        <Text style={emptyTextStyle as never}>{t('tournamentDetail.noTeamsYet')}</Text>
      ) : (
        <FlashList
          data={filteredTeams}
          keyExtractor={(tm) => tm._id}
          renderItem={({ item }) => renderTeam(item) as never}
        />
      )}
    </>
  );
}

