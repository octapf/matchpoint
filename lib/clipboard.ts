import { Platform } from 'react-native';

/** Web static export cannot resolve expo-clipboard at bundle time; native uses it at runtime. */
export async function setClipboardString(text: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    return;
  }
  const { setStringAsync } = require('expo-clipboard') as typeof import('expo-clipboard');
  await setStringAsync(text);
}
