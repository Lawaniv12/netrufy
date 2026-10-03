// POST { guarantorName, guarantorPhone }  — called with the member's own auth JWT.
import { json, withCors } from '../_shared/cors.ts';
import { newToken, normalizeNgPhone, sha256 } from '../_shared/tokens.ts';
import { sendSms } from '../_shared/sms.ts';
import { adminClient } from '../_shared/admin-client.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please sign in.' }, 401);

    const { data: me } = await asUser.from('profiles').select('id, community_id, full_name, phone').eq('id', user.id).single();
    if (!me) return json({ error: 'Profile not found.' }, 404);

    const body = await req.json();
    const guarantorName = String(body.guarantorName ?? '').trim().slice(0, 80);
    const phone = normalizeNgPhone(String(body.guarantorPhone ?? ''));
    if (guarantorName.length < 2 || phone.length < 10) return json({ error: 'Check the name and phone number.' }, 400);
    if (phone === normalizeNgPhone(me.phone)) return json({ error: "You can't vouch for yourself." }, 400);

    const appUrl = Deno.env.get('APP_URL');
    if (!appUrl) return json({ error: 'The administrator must configure APP_URL for guarantor links.' }, 503);
    if (!Deno.env.get('TERMII_API_KEY') || !Deno.env.get('TERMII_SENDER_ID')) {
      return json({ error: 'SMS delivery is not configured. The administrator must add the Termii API key and sender ID.' }, 503);
    }

    const admin = adminClient();
    const { count } = await admin.from('attestations').select('id', { count: 'exact', head: true })
      .eq('profile_id', me.id).eq('status', 'pending');
    if ((count ?? 0) >= MAX_PENDING) return json({ error: 'Too many pending requests. Wait for a reply first.' }, 429);

    const { data: guarantor } = await admin.from('profiles').select('id, full_name')
      .eq('community_id', me.community_id).eq('phone', phone).maybeSingle();
    if (!guarantor) {
      return json({ error: 'The guarantor must already have a Netrufy profile in your community.' }, 403);
    }
    const { count: verifiedGroups } = await admin.from('memberships')
      .select('unit_id', { count: 'exact', head: true })
      .eq('profile_id', guarantor.id)
      .eq('community_id', me.community_id)
      .eq('status', 'verified');
    if (!verifiedGroups) {
      return json({ error: 'The guarantor must have an active verified Unit or Homecell membership.' }, 403);
    }

    const token = newToken();
    const { error } = await admin.from('attestations').insert({
      profile_id: me.id, community_id: me.community_id,
      guarantor_name: guarantor.full_name,
      guarantor_phone: phone,
      guarantor_user_id: guarantor.id,
      token_hash: await sha256(token),
      token_expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
    });
    if (error) return json({ error: 'Could not create the request.' }, 500);

    try {
      await sendSms(phone, `${me.full_name} asked you to vouch for them. Open: ${appUrl}/g/${token}`);
    } catch (smsError) {
      await admin.from('attestations').delete().eq('token_hash', await sha256(token));
      console.error('Guarantor SMS delivery failed', smsError);
      return json({ error: 'The request was not saved because the SMS could not be delivered. Check the Termii sender ID and phone number.' }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Unexpected error.' }, 500);
  }
});
