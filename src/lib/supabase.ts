import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key.
 *
 * Every read and write in this app goes through here. RLS on the tables
 * has no policies, so the anon key reaches nothing — which means this
 * key must never be exposed to the browser. Only import this module
 * from server components, server actions and route handlers.
 */
export function db(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill it in.'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js patches the global fetch to cache responses by default, even
    // on routes marked force-dynamic — this guarantees every Supabase
    // request bypasses that cache instead of silently serving stale rows.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });

  return cached;
}

export const MUGSHOT_BUCKET = 'mugshots';

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}
