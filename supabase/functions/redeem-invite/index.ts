// POST { token, fullName, phone } — called with the newly signed-in member's own auth JWT.
// Creates their `profiles` row (clients have no INSERT grant there) and marks the invite used.
import { json, withCors } from '../_shared/cors.ts';
import { normalizeNgPhone, sha256 } from '../_shared/tokens.ts';
import { adminClient } from '../_shared/admin-client.ts';
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

    const body = await req.json();
    const token = String(body.token ?? '');
    if (token.length < 20) return json({ error: 'Missing invitation token.' }, 400);

    const admin = adminClient();

    // Already redeemed by this same account? Make the action idempotent.
    const { data: existing } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (existing) return json({ ok: true });

    const { data: invite } = await admin.from('invites')
      .select('id, community_id, unit_id, role, expires_at, used_at, invitee_email, invitee_name, invitee_phone, invitee_photo_url, invitee_public_listing')
      .eq('token_hash', await sha256(token)).maybeSingle();
    if (!invite) return json({ error: 'This invite link is invalid.' }, 404);
    if (invite.used_at) return json({ error: 'This invite has already been used.' }, 409);
    if (Date.parse(invite.expires_at) < Date.now()) return json({ error: 'This invite has expired.' }, 410);
    if (invite.invitee_email && invite.invitee_email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
      return json({ error: 'Sign in with the email address that was approved for this invitation.' }, 403);
    }

    const fullName = invite.invitee_name ?? String(body.fullName ?? user.user_metadata?.full_name ?? '').trim().slice(0, 120);
    const phone = normalizeNgPhone(invite.invitee_phone ?? String(body.phone ?? user.user_metadata?.phone ?? '')).slice(0, 15);
    if (fullName.length < 2 || phone.length < 10) return json({ error: 'Missing profile details.' }, 400);
    const publicListing = invite.invitee_public_listing === true;
    const visibility = publicListing ? {
      listed: 'public', headline: 'public', bio: 'public', skills: 'public', services: 'public',
      location: 'public', units: 'public', links: 'public', photo: 'public', contact: 'private', trust: 'private', cv: 'private',
    } : undefined;

    const { error: insertErr } = await admin.from('profiles').insert({
      id: user.id, community_id: invite.community_id, role: invite.role,
      full_name: fullName, phone,
      public_listing: publicListing,
      photo_url: publicListing ? invite.invitee_photo_url : null,
      ...(visibility ? { visibility } : {}),
    });
    if (insertErr) return json({ error: 'Could not create your profile.' }, 500);

    if (invite.unit_id) {
      const { data: group } = await admin.from('units').select('kind').eq('id', invite.unit_id).maybeSingle();
      await admin.from('memberships').insert({
        profile_id: user.id,
        unit_id: invite.unit_id,
        community_id: invite.community_id,
        unit_role: 'member',
        status: group?.kind === 'home_cell' ? 'pending' : 'verified',
      });
    }

    await admin.from('invites').update({ used_at: new Date().toISOString(), used_by: user.id }).eq('id', invite.id);
    await admin.from('audit_log').insert({
      community_id: invite.community_id, actor: user.id, action: 'invite.redeemed', entity: 'invites', entity_id: invite.id,
    });

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Unexpected error.' }, 500);
  }
});
