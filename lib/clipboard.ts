/**
 * Default / web: `navigator.clipboard` only — no expo-clipboard (required for `expo export -p web`).
 * Native builds use `clipboard.native.ts` (Metro resolves it before this file).
 */
export async function setClipboardString(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
