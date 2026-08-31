import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Same real Supabase project the current Capacitor app uses
 * (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the main
 * repo's .env.local — both intentionally public values, already embedded
 * in every deployed page's client bundle today; the anon key is meant to
 * ship in client code, unlike the service role key, which never appears
 * here or anywhere in this React Native project).
 *
 * Per the migration's explicit "don't rebuild the backend" rule
 * (docs/react-native-migration/00-protection-and-rollback.md): this is
 * the SAME backend, SAME auth, SAME RPCs, SAME permissions as the
 * Capacitor app — nothing about Supabase itself changes for this
 * migration.
 */
const SUPABASE_URL = 'https://jgrlefclttoazamzvwca.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpncmxlZmNsdHRvYXphbXp2d2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MzM1NDUsImV4cCI6MjEwMTAwOTU0NX0.Xy7TqPjBSsCvbJCIff8Ns1PezRAOM66LqeHw7wDBRLM';

/**
 * The Next.js app's own base URL — needed because `/api/pos/login` (the
 * rate-limited PIN-login proxy this app must keep using, not call
 * supabase.auth.signInWithPassword directly — see
 * src/application/authService.ts) is a same-origin fetch in the browser/
 * Capacitor version but a cross-origin absolute-URL fetch from a native
 * app with no "origin" of its own.
 */
export const RAKEEN_API_BASE_URL = 'https://rakeenapp.com';

/**
 * AsyncStorage, not MMKV, for auth session persistence specifically —
 * Supabase's own documented React Native setup uses AsyncStorage directly
 * as the storage adapter, and auth token reads/writes are infrequent
 * (nothing about this path benefits from MMKV's raw synchronous-read
 * speed advantage, unlike the offline order/print queues evaluated in
 * docs/react-native-poc/phase8-offline-storage.md, which is a genuinely
 * different, higher-frequency usage pattern). A deliberate choice per
 * usage, not the POC's storage recommendation applied blindly everywhere.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
