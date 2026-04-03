import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Classification settings now live in the tournament edit screen (organizer).
 * Keeps old deep links working.
 */
export default function ClassificationSettingsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <Redirect href={`/admin/tournament/${id}`} />;
}
