/**
 * Cloud settings, read from the .env file at the project root.
 *
 * Both blank = "local mode": the app works fully, but each phone keeps its own
 * data. Fill them in (see .env.example) to share data across the team.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const CLOUD_CONFIGURED = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
