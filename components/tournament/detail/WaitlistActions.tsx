import React from 'react';
import { View, Text } from 'react-native';
import { Button } from '@/components/ui/Button';

export function WaitlistActions({
  t,
  show,
  waitlistPosition,
  onJoin,
  onLeave,
  joinPending,
  leavePending,
  wrapStyle,
  waitlistRowStyle,
  waitlistPositionTextStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  show: boolean;
  waitlistPosition: number | null;
  onJoin: () => void;
  onLeave: () => void;
  joinPending: boolean;
  leavePending: boolean;
  wrapStyle: unknown;
  waitlistRowStyle: unknown;
  waitlistPositionTextStyle: unknown;
}) {
  if (!show) return null;
  return (
    <View style={wrapStyle as never}>
      {waitlistPosition == null ? (
        <Button
          title={t('tournaments.waitlistJoin')}
          variant="secondary"
          onPress={onJoin}
          disabled={joinPending}
          size="sm"
        />
      ) : (
        <View style={waitlistRowStyle as never}>
          <Text style={waitlistPositionTextStyle as never}>{t('tournaments.waitlistYouAre', { n: waitlistPosition })}</Text>
          <Button
            title={t('tournaments.waitlistLeave')}
            variant="outline"
            onPress={onLeave}
            disabled={leavePending}
            size="sm"
          />
        </View>
      )}
    </View>
  );
}

