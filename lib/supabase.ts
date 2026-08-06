import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ----------------------------------------------------------------------------
// BROWSER CLIENT
// Safe to use in client components. Uses the anon key, which is subject to
// the Row Level Security policies defined in supabase/schema.sql.
// ----------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // These are the library defaults, spelled out because the app depends on
    // them: the session is written to localStorage and refreshed in the
    // background, so signing in once survives closing the tab, and a one-time
    // sign-in link keeps working long after the link itself has expired.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ----------------------------------------------------------------------------
// SERVER CLIENT (service role)
// ONLY import this from files under app/api/** (server route handlers).
// Never import into a "use client" component -- the service role key
// bypasses Row Level Security entirely and must never reach the browser.
// ----------------------------------------------------------------------------
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
