import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ThemeTokens } from '@/lib/theme/colors';
import Colors from '@/constants/Colors';
import { Skeleton } from '@/components/ui/Skeleton';
import { AppBackgroundGradient } from '@/components/ui/AppBackgroundGradient';
import { MPMark } from '@/components/ui/MPMark';

type Props = {
  topPad: number;
  bottomPad: number;
  tokens: ThemeTokens;
  appNameLabel: string;
};

/** Layout placeholder while tournament + matches load on the live match screen. */
export function MatchDetailLoadingShell({ topPad, bottomPad, tokens, appNameLabel }: Props) {
  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <AppBackgroundGradient />
      <View style={styles.topBar}>
        <View style={styles.topLeftLogo} pointerEvents="none">
          <MPMark size={44} accessibilityLabel={appNameLabel} />
        </View>
      </View>
      <View style={[styles.container, { paddingBottom: bottomPad }]}>
        <View style={styles.vsRow}>
          <Skeleton height={26} width="38%" borderRadius={8} style={{ backgroundColor: tokens.accentMuted }} />
          <Skeleton height={22} width={28} borderRadius={6} style={{ marginHorizontal: 8 }} />
          <Skeleton height={26} width="38%" borderRadius={8} style={{ backgroundColor: tokens.accentSecondaryMuted }} />
        </View>
        <View style={styles.timerBlock}>
          <Skeleton height={12} width={72} style={{ marginBottom: 6 }} />
          <Skeleton height={28} width={100} />
        </View>
        <Skeleton height={16} width="55%" style={{ alignSelf: 'center', marginBottom: 16 }} />
        <View style={styles.scoreBoard}>
          <View style={styles.scoreHalf}>
            <Skeleton height={160} width="100%" borderRadius={16} />
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreHalf}>
            <Skeleton height={160} width="100%" borderRadius={16} />
          </View>
        </View>
        <Skeleton height={44} width="100%" borderRadius={12} style={{ marginTop: 20 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  topBar: { paddingHorizontal: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center' },
  topLeftLogo: { width: 52, height: 52, alignItems: 'flex-start', justifyContent: 'center' },
  container: { flex: 1, paddingHorizontal: 16 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  timerBlock: { alignItems: 'center', marginBottom: 8 },
  scoreBoard: { flexDirection: 'row', alignItems: 'stretch', minHeight: 160 },
  scoreHalf: { flex: 1, minWidth: 0 },
  scoreDivider: { width: 8 },
});
