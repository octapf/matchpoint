import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { formatTournamentDate } from '@/lib/utils/dateFormat';

type TournamentCardProps = {
  id: string;
  name: string;
  date: string;
  location: string;
  spotsLeft?: number;
  maxTeams?: number;
};

export function TournamentCard({
  id,
  name,
  date,
  location,
  spotsLeft = 0,
  maxTeams = 16,
}: TournamentCardProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/tournament/${id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.date}>{formatTournamentDate(date)}</Text>
      <Text style={styles.location}>{location}</Text>
      <View style={styles.footer}>
        <Text style={styles.spots}>
          {spotsLeft}/{maxTeams} spots
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.9,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  location: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  spots: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
