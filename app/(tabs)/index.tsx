import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Link } from 'expo-router';
import Colors from '@/constants/Colors';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTournaments } from '@/lib/hooks/useTournaments';
import type { Tournament } from '@/types';

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function TournamentsScreen() {
  const { data: tournaments = [], isLoading, isError, error } = useTournaments();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.scrollContent}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton height={22} width="70%" style={{ marginBottom: 8 }} />
              <Skeleton height={16} width="40%" style={{ marginBottom: 4 }} />
              <Skeleton height={16} width="50%" style={{ marginBottom: 8 }} />
              <Skeleton height={14} width="30%" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>{error?.message || 'Failed to load tournaments'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {(tournaments as Tournament[]).map((t) => (
          <Link key={t._id} href={`/tournament/${t._id}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>{t.name}</Text>
              <Text style={styles.cardDate}>{formatDate(t.date)}</Text>
              <Text style={styles.cardLocation}>{t.location}</Text>
              <Text style={styles.cardSpots}>{t.maxTeams} teams max</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
      <Link href="/tournament/create" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>+ Create</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  cardLocation: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  cardSpots: {
    fontSize: 12,
    color: Colors.yellow,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: Colors.yellow,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  errorContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
