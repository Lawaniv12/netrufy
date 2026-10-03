import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Service-role client for Edge Functions — bypasses RLS. Only ever used server-side. */
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}
