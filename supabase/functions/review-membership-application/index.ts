import { json, withCors } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin-client.ts';
import { newToken, sha256 } from '../_shared/tokens.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please sign in first.' }, 401);

    const body = await req.json();
    const applicationId = String(body.applicationId ?? '');
    const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
    const reviewNote = String(body.reviewNote ?? '').trim().slice(0, 500);
    if (!applicationId || !decision) return json({ error: 'Choose an application and decision.' }, 400);

    const admin = adminClient();
    const [{ data: actor }, { data: application }] = await Promise.all([
      admin.from('profiles').select('community_id, role').eq('id', user.id).maybeSingle(),
      admin.from('membership_applications').select('*').eq('id', applicationId).maybeSingle(),
    ]);
    if (!actor || !application || actor.community_id !== application.community_id) {
      return json({ error: 'Application not found in your community.' }, 404);
    }
    const isAdmin = actor.role === 'community_admin' || actor.role === 'platform_admin';
    const { data: leadership } = await admin.from('memberships').select('profile_id')
      .eq('profile_id', user.id).eq('unit_id', application.unit_id)
      .eq('unit_role', 'leader').eq('status', 'verified').maybeSingle();
    if (!isAdmin && !leadership) return json({ error: 'You are not a leader of this Unit.' }, 403);
    if (application.status !== 'pending') return json({ error: 'This application has already been reviewed.' }, 409);

    if (decision === 'reject') {
      const { error } = await admin.from('membership_applications').update({
        status: 'rejected', review_note: reviewNote || null, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', application.id).eq('status', 'pending');
      if (error) return json({ error: 'Could not reject this application.' }, 500);
      await admin.from('audit_log').insert({ community_id: application.community_id, actor: user.id, action: 'membership_application.rejected', entity: 'membership_applications', entity_id: application.id });
      return json({ ok: true });
    }

    const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? req.headers.get('origin');
    if (!appBaseUrl) return json({ error: 'Configure APP_BASE_URL before approving applications.' }, 500);
    let photoUrl: string | null = null;
    if (application.wants_public_listing) {
      const { data: file, error: downloadError } = await admin.storage.from('applications').download(application.photo_path);
      if (downloadError || !file) return json({ error: 'Could not load the applicant photo.' }, 500);
      const photoName = `${application.community_id}/${application.id}.jpg`;
      const { error: uploadError } = await admin.storage.from('member-photos').upload(photoName, file, {
        contentType: file.type || 'image/jpeg', upsert: true,
      });
      if (uploadError) return json({ error: 'Could not publish the approved profile photo.' }, 500);
      photoUrl = admin.storage.from('member-photos').getPublicUrl(photoName).data.publicUrl;
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: invite, error: inviteError } = await admin.from('invites').insert({
      community_id: application.community_id,
      unit_id: application.unit_id,
      role: 'member',
      token_hash: await sha256(token),
      expires_at: expiresAt,
      created_by: user.id,
      invitee_email: application.email,
      invitee_name: application.full_name,
      invitee_phone: application.phone,
      invitee_photo_url: photoUrl,
      invitee_public_listing: application.wants_public_listing,
      application_id: application.id,
    }).select('id').single();
    if (inviteError || !invite) return json({ error: 'Could not create an approval invitation.' }, 500);

    const { error: updateError } = await admin.from('membership_applications').update({
      status: 'approved', review_note: reviewNote || null, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', application.id).eq('status', 'pending');
    if (updateError) return json({ error: 'Approval invitation created, but the application status could not be updated.' }, 500);

    await admin.from('audit_log').insert({ community_id: application.community_id, actor: user.id, action: 'membership_application.approved', entity: 'membership_applications', entity_id: application.id });
    return json({ ok: true, inviteUrl: new URL(`/invite/${token}`, appBaseUrl).toString(), expiresAt });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unexpected error.' }, 500);
  }
});