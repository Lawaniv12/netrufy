// POST { token } — public, no auth. Texts a 6-digit code to the guarantor's own phone.
import { json, withCors } from '../_shared/cors.ts';
import { newOtp, sha256 } from '../_shared/tokens.ts';
import { sendSms } from '../_shared/sms.ts';
import { adminClient } from '../_shared/admin-client.ts';

const COOLDOWN_MS = 60_000, OTP_TTL_MS = 10 * 60_000, MAX_SENDS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const { token } = await req.json();
    if (typeof token !== 'string') return json({ error: 'invalid' }, 400);

    const admin = adminClient();
    const { data: att } = await admin.from('attestations')
      .select('id, guarantor_phone, otp_sent_at, otp_send_count')
      .eq('token_hash', await sha256(token)).eq('status', 'pending')
      .gt('token_expires_at', new Date().toISOString()).maybeSingle();
    if (!att) return json({ error: 'invalid' }, 404);
    if (att.otp_send_count >= MAX_SENDS) return json({ error: 'limit' }, 429);
    if (att.otp_sent_at && Date.now() - Date.parse(att.otp_sent_at) < COOLDOWN_MS) {
      return json({ error: 'wait' }, 429);
    }

    const code = newOtp();
    await admin.from('attestations').update({
      otp_hash: await sha256(code), otp_sent_at: new Date().toISOString(),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0, otp_send_count: att.otp_send_count + 1,
    }).eq('id', att.id);

    await sendSms(att.guarantor_phone, `Your verification code is ${code}. It expires in 10 minutes.`);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'invalid' }, 400);
  }
});
