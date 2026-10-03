import { json, withCors } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin-client.ts';
import { newToken, sha256 } from '../_shared/tokens.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please sign in first.' }, 401);

    const admin = adminClient();
    const { data: actor } = await admin.from('profiles')
      .select('community_id, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!actor || !['community_admin', 'platform_admin'].includes(actor.role)) {
      return json({ error: 'Only community administrators can create invites.' }, 403);
    }

    const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? req.headers.get('origin');
    if (!appBaseUrl) return json({ error: 'Configure APP_BASE_URL before creating invitations.' }, 500);

    const body = await req.json();
    const unitId = typeof body.unitId === 'string' && body.unitId ? body.unitId : null;
    const requestedDays = Number(body.expiresInDays ?? 7);
    const expiresInDays = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 1), 30) : 7;
    if (unitId) {
      const { data: unit } = await admin.from('units')
        .select('id')
        .eq('id', unitId)
        .eq('community_id', actor.community_id)
        .maybeSingle();
      if (!unit) return json({ error: 'Choose a group in your community.' }, 400);
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: invite, error } = await admin.from('invites').insert({
      community_id: actor.community_id,
      unit_id: unitId,
      role: 'member',
      token_hash: await sha256(token),
      expires_at: expiresAt,
      created_by: user.id,
    }).select('id').single();
    if (error || !invite) {
      console.error(error);
      return json({ error: 'Could not create an invitation.' }, 500);
    }

    await admin.from('audit_log').insert({
      community_id: actor.community_id,
      actor: user.id,
      action: 'invite.created',
      entity: 'invites',
      entity_id: invite.id,
    });

    const inviteUrl = new URL(`/invite/${token}`, appBaseUrl).toString();
    return json({ inviteUrl, expiresAt });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unexpected error.' }, 500);
  }
});