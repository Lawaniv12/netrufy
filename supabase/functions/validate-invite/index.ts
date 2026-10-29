import { json, withCors } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin-client.ts';
import { sha256 } from '../_shared/tokens.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const body = await req.json();
    const token = String(body.token ?? '');
    if (token.length < 20) return json({ valid: false }, 400);

    const admin = adminClient();
    const { data: invite } = await admin.from('invites')
      .select('id, community_id, unit_id, expires_at, used_at, invitee_email, invitee_name, invitee_phone')
      .eq('token_hash', await sha256(token))
      .maybeSingle();
    if (!invite || invite.used_at || Date.parse(invite.expires_at) <= Date.now()) {
      return json({ valid: false });
    }

    const [{ data: community }, { data: group }] = await Promise.all([
      admin.from('communities').select('name').eq('id', invite.community_id).maybeSingle(),
      invite.unit_id
        ? admin.from('units').select('name, kind').eq('id', invite.unit_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [memberCountResult, recentCountResult, recentJoinResult] = invite.unit_id
      ? await Promise.all([
        admin.from('memberships').select('profile_id', { count: 'exact', head: true })
          .eq('unit_id', invite.unit_id).eq('status', 'verified'),
        admin.from('memberships').select('profile_id', { count: 'exact', head: true })
          .eq('unit_id', invite.unit_id).eq('status', 'verified').gte('joined_at', since),
        admin.from('memberships').select('joined_at')
          .eq('unit_id', invite.unit_id).eq('status', 'verified').gte('joined_at', since)
          .order('joined_at', { ascending: false }).limit(3),
      ])
      : await Promise.all([
        admin.from('profiles').select('id', { count: 'exact', head: true })
          .eq('community_id', invite.community_id).eq('role', 'member'),
        admin.from('profiles').select('id', { count: 'exact', head: true })
          .eq('community_id', invite.community_id).eq('role', 'member').gte('created_at', since),
        admin.from('profiles').select('created_at')
          .eq('community_id', invite.community_id).eq('role', 'member').gte('created_at', since)
          .order('created_at', { ascending: false }).limit(3),
      ]);
    const recentJoins = (recentJoinResult.data ?? []).map((row) => ({
      at: 'joined_at' in row ? row.joined_at : row.created_at,
    }));
    return json({
      valid: true,
      communityName: community?.name ?? null,
      groupName: group?.name ?? null,
      groupKind: group?.kind ?? null,
      memberCount: memberCountResult.count ?? null,
      newMemberCount: recentCountResult.count ?? null,
      recentJoins,
      inviteeEmail: invite.invitee_email,
      inviteeName: invite.invitee_name,
      inviteePhone: invite.invitee_phone,
    });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not validate this invitation.' }, 500);
  }
});