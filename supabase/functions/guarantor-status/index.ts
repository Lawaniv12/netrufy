// POST { token } — public, no auth. Returns just enough to render the page.
import { json, withCors } from '../_shared/cors.ts';
import { sha256 } from '../_shared/tokens.ts';
import { adminClient } from '../_shared/admin-client.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const { token } = await req.json();
    if (typeof token !== 'string' || token.length < 20) return json({ error: 'invalid' }, 400);

    const admin = adminClient();
    const { data } = await admin.from('attestations')
      .select('guarantor_name, profiles!attestations_profile_id_community_id_fkey(full_name)')
      .eq('token_hash', await sha256(token)).eq('status', 'pending')
      .gt('token_expires_at', new Date().toISOString()).maybeSingle();

    if (!data) return json({ error: 'invalid' }, 404);
    const memberName = (data as unknown as { profiles?: { full_name?: string } }).profiles?.full_name ?? 'this member';
    return json({ memberName, guarantorName: data.guarantor_name });
  } catch (e) {
    console.error(e);
    return json({ error: 'invalid' }, 400);
  }
});
