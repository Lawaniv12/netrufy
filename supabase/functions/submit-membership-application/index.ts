import { json, withCors } from '../_shared/cors.ts';
import { adminClient } from '../_shared/admin-client.ts';
import { normalizeNgPhone } from '../_shared/tokens.ts';

const MAX_PHOTO_BYTES = 102_400;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  try {
    const body = await req.json();
    const applicationId = String(body.applicationId ?? '');
    const unitId = String(body.unitId ?? '');
    const fullName = String(body.fullName ?? '').trim().slice(0, 120);
    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 320);
    const phone = normalizeNgPhone(String(body.phone ?? '')).slice(0, 15);
    const headline = String(body.headline ?? '').trim().slice(0, 120);
    const bio = String(body.bio ?? '').trim().slice(0, 1000);
    const skills = Array.isArray(body.skills) ? body.skills.map(String).map((value: string) => value.trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [];
    const services = Array.isArray(body.services) ? body.services.map(String).map((value: string) => value.trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [];
    const wantsPublicListing = body.wantsPublicListing === true;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) return json({ error: 'Invalid application.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email.' }, 400);
    if (fullName.length < 2 || phone.length < 10 || !unitId) return json({ error: 'Complete your name, phone number and Unit.' }, 400);

    const admin = adminClient();
    const { data: unit } = await admin.from('units')
      .select('id, community_id, kind')
      .eq('id', unitId)
      .maybeSingle();
    if (!unit || unit.kind !== 'unit') return json({ error: 'Choose a valid Unit.' }, 400);

    const photoPath = `${applicationId}/photo`;
    const { data: photo, error: photoError } = await admin.storage.from('applications').download(photoPath);
    if (photoError || !photo) return json({ error: 'Upload a profile photo before submitting.' }, 400);
    if (photo.size > MAX_PHOTO_BYTES || !ALLOWED_TYPES.has(photo.type)) {
      await admin.storage.from('applications').remove([photoPath]);
      return json({ error: 'Photo must be JPEG, PNG or WebP and no larger than 100 KB.' }, 400);
    }

    const { error } = await admin.from('membership_applications').insert({
      id: applicationId,
      community_id: unit.community_id,
      unit_id: unit.id,
      full_name: fullName,
      email,
      phone,
      headline,
      bio,
      skills,
      services,
      wants_public_listing: wantsPublicListing,
      photo_path: photoPath,
    });
    if (error) {
      if (error.code === '23505') return json({ error: 'An application for this email and Unit is already open.' }, 409);
      console.error(error);
      return json({ error: 'Could not submit your application.' }, 500);
    }

    return json({ ok: true, unitName: unit.id });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unexpected error.' }, 500);
  }
});