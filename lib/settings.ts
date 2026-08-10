// Global portal settings (key/value), stored in the `portal_settings` table.
//
// Currently holds the global default feature allowlist — the set of tabs that
// new members and any ungated member fall back to. Admins manage this from the
// admin panel; per-member overrides (portal_users.features) still win.

import { db } from '@/lib/kv';
import { ALL_FEATURE_IDS, DEFAULT_FEATURES, type FeatureId } from '@/lib/features';

const SETTINGS_TABLE = 'portal_settings';
const DEFAULT_FEATURES_KEY = 'default_features';

function sanitize(features: unknown): FeatureId[] {
  if (!Array.isArray(features)) return [];
  const valid = ALL_FEATURE_IDS as string[];
  return features.filter((id): id is FeatureId => typeof id === 'string' && valid.includes(id));
}

// The global default feature set. Falls back to DEFAULT_FEATURES when unset or
// when the settings table doesn't exist yet (migration not run).
export async function getDefaultFeatures(): Promise<FeatureId[]> {
  try {
    const { data } = await db()
      .from(SETTINGS_TABLE)
      .select('value')
      .eq('key', DEFAULT_FEATURES_KEY)
      .single();
    const features = sanitize(data?.value);
    if (features.length) return features;
  } catch {
    // table missing / no row — fall through to default
  }
  return [...DEFAULT_FEATURES];
}

export async function setDefaultFeatures(features: string[]): Promise<FeatureId[]> {
  const clean = sanitize(features);
  const { error } = await db()
    .from(SETTINGS_TABLE)
    .upsert(
      { key: DEFAULT_FEATURES_KEY, value: clean, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) throw new Error(error.message);
  return clean;
}
