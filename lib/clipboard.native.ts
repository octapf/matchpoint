import * as Clipboard from 'expo-clipboard';

export async function setClipboardString(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
