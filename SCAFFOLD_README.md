# Community Trust — Angular + Supabase pilot scaffold

Built and verified in this order: SQL migrations run against local Postgres with RLS
tests (see below), then `ng build` — both pass. Not yet tested against a live Supabase
project, so budget time for the inevitable first-integration surprises.

## What's here
```
supabase/
  migrations/0001_schema.sql   tables, enums, composite FKs for tenant integrity
  migrations/0002_rls.sql      RLS policies, masked directory_profiles view, reveal_contact RPC
  functions/                   Edge Functions (Deno) — the privileged operations Angular can't do itself
    request-attestation/       member asks someone to vouch for them
    redeem-invite/             turns an invite link + phone-OTP session into a profiles row
    guarantor-status/          public: names for the /g/:token page
    guarantor-send-otp/        public: texts the 6-digit code
    guarantor-submit/          public: verifies code, records the attestation
    _shared/                   cors, token/OTP helpers, Termii sender, service-role client
src/app/
  core/services/supabase.service.ts   session + own-profile signal, wraps the JS client
  core/guards/                        authGuard, adminGuard (UX only — RLS is the real gate)
  features/
    auth/login                phone OTP sign-in
    auth/redeem-invite         /invite/:token
    guarantor                  /g/:token — public, no account, own anonymous Supabase client
    directory                  browses directory_profiles, reveal-contact -> wa.me
    profile                    self-service editor incl. per-field visibility table
    trust                      request a guarantor, review testimonials
    admin                      placeholder — units list only; invite/moderation CRUD is next
```

## Why Edge Functions, not client-side Supabase calls
Angular ships to the browser, so it can only ever hold the **anon** key. Creating an
attestation, and everything in the guarantor flow (checking a token, sending an OTP,
verifying it), needs the **service-role** key to bypass RLS by design — those aren't
things the owning user's session is allowed to do directly. Those five operations are
Edge Functions; every other read/write in the app goes straight through the Supabase
client and is what RLS actually enforces.

## Setup
```bash
cd community-trust-app
npm install                      # already run once here; re-run after cloning
```
In `src/environments/environment.ts` (and `.prod.ts`), set `supabaseUrl` and `supabaseAnonKey`
from your project's API settings.

Push the schema (SQL editor in the Supabase dashboard, or CLI if it installs on your machine):
```bash
supabase link --project-ref <ref>
supabase db push
```

Deploy the functions and set their secrets:
```bash
supabase functions deploy request-attestation redeem-invite guarantor-status guarantor-send-otp guarantor-submit
supabase secrets set --env-file .env.functions   # copy from .env.functions.example first
```

Enable **Phone** auth in Supabase Auth settings, with Termii (or your SMS provider) wired
as the custom SMS hook, so `signInWithOtp({ phone })` actually sends a text.

Run it:
```bash
npm start        # ng serve, http://localhost:4200
```

## Auth: email OTP (for now)
Login is email OTP, not phone — Supabase's native phone OTP needs an SMS provider
(Twilio, MessageBird, Vonage, or TextLocal) configured under Authentication → Providers →
Phone before it'll send anything; email OTP needs zero setup, so it's what's wired up for
fast testing. Because of that, phone is no longer pulled from the auth session — it's
collected on the `/invite/:token` screen instead (required, checked for uniqueness) and is
what the "reveal contact → WhatsApp" button in the directory uses. `request-attestation`
still normalizes guarantor numbers to `234XXXXXXXXXX`.

Switching to phone login later: set up an SMS provider in Supabase, swap `sendLoginOtp`/
`verifyLoginOtp` in `supabase.service.ts` back to `{ phone }` / `type: 'sms'`, and update the
login component. `redeem-invite` can stay as-is (it already collects phone explicitly) or be
simplified back to reading `user.phone`, your call.

## Known gaps / assumptions to verify
- **Invite creation has no UI yet.** Admins currently need to insert into `invites` directly
  (SQL editor) with `token_hash = sha256(<token>)` and share `/invite/<token>` themselves.
  An admin Edge Function for this is the natural next piece.
- **Guarantor phone is member-supplied**, so a member could type a friend's number. The
  `request-attestation` function already links `guarantor_user_id` when the phone matches a
  registered profile in the same community — surface that as a "verified leader" badge in
  the UI before trusting unlinked guarantors.
- **No rate limiting at the network layer** on the three public `/g/:token` functions beyond
  the per-record OTP cooldown/attempt limits already in the code. Add Supabase's built-in
  rate limiting or a WAF rule before this is public.
- CORS in `_shared/cors.ts` is `*` for local development — restrict it to your real origin
  before going live.

## Next up (per the original build plan)
Admin invite creation + unit management, testimonial moderation UI polish, CV upload via
Storage signed URLs, PWA manifest, then Sentry/PostHog.
