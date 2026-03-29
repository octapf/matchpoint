import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function canVibrate(): boolean {
  return Platform.OS !== 'web';
}

/** Light tap — successful save, join, leave waitlist */
export function hapticSuccess(): void {
  if (!canVibrate()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Selection changed (tabs, pickers) */
export function hapticSelection(): void {
  if (!canVibrate()) return;
  void Haptics.selectionAsync();
}

export function hapticWarning(): void {
  if (!canVibrate()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
