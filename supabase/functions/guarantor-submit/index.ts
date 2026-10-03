// POST { token, code, relationship, yearsKnown, statement } — public, no auth.
import { json, withCors } from '../_shared/cors.ts';
import { safeEqual, sha256 } from '../_shared/tokens.ts';
import { adminClient } from '../_shared/admin-client.ts';

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const body = await req.json();
    const token = String(body.token ?? '');
    const code = String(body.code ?? '');
    const relationship = String(body.relationship ?? '').trim().slice(0, 80);
    const yearsKnown = Number(body.yearsKnown);
    const statement = String(body.statement ?? '').trim().slice(0, 600);

    if (!/^\d{6}$/.test(code)) return json({ error: 'code' }, 400);
    if (relationship.length < 2) return json({ error: 'form' }, 400);
    if (!Number.isFinite(yearsKnown) || yearsKnown < 0 || yearsKnown > 80) return json({ error: 'form' }, 400);
    if (statement.length < 20) return json({ error: 'form' }, 400);

    const admin = adminClient();
    const { data: att } = await admin.from('attestations')
      .select('id, community_id, otp_hash, otp_expires_at, otp_attempts')
      .eq('token_hash', await sha256(token)).eq('status', 'pending')
      .gt('token_expires_at', new Date().toISOString()).maybeSingle();
    if (!att?.otp_hash || !att.otp_expires_at) return json({ error: 'code' }, 400);
    if (att.otp_attempts >= MAX_ATTEMPTS || Date.parse(att.otp_expires_at) < Date.now()) {
      return json({ error: 'code' }, 400);
    }

    const codeHash = await sha256(code);
    if (!safeEqual(codeHash, att.otp_hash)) {
      await admin.from('attestations').update({ otp_attempts: att.otp_attempts + 1 }).eq('id', att.id);
      return json({ error: 'code' }, 400);
    }

    // Guard against a double-submit race: only succeeds while still 'pending'.
    const { data: done } = await admin.from('attestations').update({
      status: 'verified', verified_at: new Date().toISOString(),
      relationship, years_known: yearsKnown, statement,
      token_hash: null, otp_hash: null,
    }).eq('id', att.id).eq('status', 'pending').select('id').maybeSingle();

    if (done) {
      await admin.from('audit_log').insert({
        community_id: att.community_id, actor: `guarantor:${att.id}`,
        action: 'attestation.verified', entity: 'attestations', entity_id: att.id,
      });
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'invalid' }, 400);
  }
});
