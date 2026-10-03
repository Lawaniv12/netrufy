import { json, withCors } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin-client.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

async function sendNotice(to: string | null, subject: string, text: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from || !to) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please sign in first.' }, 401);

    const body = await req.json();
    const action = body.action === 'respond' ? 'respond' : body.action === 'request' ? 'request' : null;
    if (!action) return json({ error: 'Choose request or respond.' }, 400);
    const admin = adminClient();
    const { data: actor } = await admin.from('profiles').select('id, community_id, role, full_name')
      .eq('id', user.id).maybeSingle();
    if (!actor || actor.role !== 'member') return json({ error: 'An active community member account is required.' }, 403);

    if (action === 'request') {
      const recipientId = String(body.recipientId ?? '');
      if (!recipientId || recipientId === actor.id) return json({ error: 'Choose another member.' }, 400);
      const { data: recipient } = await admin.from('profiles').select('id, community_id, role, full_name')
        .eq('id', recipientId).eq('community_id', actor.community_id).eq('role', 'member').maybeSingle();
      if (!recipient) return json({ error: 'That member is not available in your community.' }, 404);
      const { data: myGroups } = await admin.from('memberships').select('unit_id')
        .eq('profile_id', actor.id).eq('community_id', actor.community_id).eq('status', 'verified');
      const myGroupIds = (myGroups ?? []).map((row) => row.unit_id);
      if (!myGroupIds.length) return json({ error: 'You need an active verified Unit or Homecell membership to request a reference.' }, 403);
      const { data: sharedGroup } = await admin.from('memberships').select('unit_id')
        .eq('profile_id', recipient.id).eq('community_id', actor.community_id).eq('status', 'verified')
        .in('unit_id', myGroupIds).limit(1).maybeSingle();
      if (!sharedGroup) return json({ error: 'You can request a reference only from an active member who shares a verified Unit or Homecell with you.' }, 403);

      const { data: created, error } = await admin.from('member_references').insert({
        community_id: actor.community_id,
        requester_id: actor.id,
        recipient_id: recipient.id,
      }).select('id').single();
      if (error) {
        if (error.code === '23505') return json({ error: 'A reference request is already waiting for this member.' }, 409);
        return json({ error: 'Could not create the reference request.' }, 500);
      }
      await admin.from('audit_log').insert({ community_id: actor.community_id, actor: actor.id, action: 'member_reference.requested', entity: 'member_references', entity_id: created.id });
      const { data: account } = await admin.auth.admin.getUserById(recipient.id);
      const emailSent = await sendNotice(account.user?.email ?? null, 'A community member requested a reference', `${actor.full_name} requested a member reference in Netrufy. Sign in to Netrufy and open Trust to respond.`);
      return json({ ok: true, emailSent });
    }

    const referenceId = String(body.referenceId ?? '');
    const decision = body.decision === 'accept' ? 'accepted' : body.decision === 'decline' ? 'declined' : null;
    if (!referenceId || !decision) return json({ error: 'Choose a request and response.' }, 400);
    const { data: reference } = await admin.from('member_references').select('*')
      .eq('id', referenceId).eq('recipient_id', actor.id).eq('status', 'pending').maybeSingle();
    if (!reference) return json({ error: 'This reference request is no longer available.' }, 404);

    const { data: myGroups } = await admin.from('memberships').select('unit_id')
      .eq('profile_id', actor.id).eq('community_id', actor.community_id).eq('status', 'verified');
    const myGroupIds = (myGroups ?? []).map((row) => row.unit_id);
    const { data: sharedGroup } = await admin.from('memberships').select('unit_id')
      .eq('profile_id', reference.requester_id).eq('community_id', actor.community_id).eq('status', 'verified')
      .in('unit_id', myGroupIds).limit(1).maybeSingle();
    if (!sharedGroup) return json({ error: 'You must still share an active verified group to respond to this request.' }, 403);

    const relationship = String(body.relationship ?? '').trim().slice(0, 80);
    const statement = String(body.statement ?? '').trim().slice(0, 600);
    const yearsKnown = Number(body.yearsKnown);
    if (decision === 'accepted' && (relationship.length < 2 || statement.length < 20 || !Number.isInteger(yearsKnown) || yearsKnown < 0 || yearsKnown > 80)) {
      return json({ error: 'For an accepted reference, provide your relationship, years known, and a statement of at least 20 characters.' }, 400);
    }
    const { error } = await admin.from('member_references').update({
      status: decision,
      relationship: decision === 'accepted' ? relationship : null,
      statement: decision === 'accepted' ? statement : null,
      years_known: decision === 'accepted' ? yearsKnown : null,
      responded_at: new Date().toISOString(),
    }).eq('id', reference.id).eq('recipient_id', actor.id).eq('status', 'pending');
    if (error) return json({ error: 'Could not save your response.' }, 500);

    await admin.from('audit_log').insert({ community_id: actor.community_id, actor: actor.id, action: `member_reference.${decision}`, entity: 'member_references', entity_id: reference.id });
    const { data: requester } = await admin.auth.admin.getUserById(reference.requester_id);
    const emailSent = await sendNotice(requester.user?.email ?? null, 'Your community reference request was answered', `${actor.full_name} ${decision} your reference request in Netrufy. Sign in to Netrufy and open Trust to view the response.`);
    return json({ ok: true, emailSent });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unexpected error.' }, 500);
  }
});