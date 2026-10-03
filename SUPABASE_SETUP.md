# Supabase Setup: Netrufy Discovery and Membership Applications

## Database SQL

No new password or signup table is needed. Supabase Auth stores each account's email and password in `auth.users`; Netrufy's `profiles` table stores member details; the existing `invites` table stores single-use invite hashes; and `memberships` stores Unit/Homecell relationships.

For a new Supabase project, run these SQL files in order in **Supabase Dashboard → SQL Editor**:

1. [0001_schema.sql](supabase/migrations/0001_schema.sql)
2. [0002_rls.sql](supabase/migrations/0002_rls.sql)
3. [0003_services.sql](supabase/migrations/0003_services.sql)
4. [0004_home_cell_verification.sql](supabase/migrations/0004_home_cell_verification.sql)
5. [0005_public_discovery_and_applications.sql](supabase/migrations/0005_public_discovery_and_applications.sql)
6. [0006_member_references.sql](supabase/migrations/0006_member_references.sql)

If earlier migrations are already applied, run only the missing later migrations, in order. Public search, membership applications, the Unit review queue, and the 100 KB photo buckets require `0005_public_discovery_and_applications.sql`. These migrations are not repeatable; do not rerun one that has already succeeded.

## Supabase Auth Settings

In **Authentication → URL Configuration**:

- Set **Site URL** to the deployed Netrufy app origin.
- Add `http://localhost:4200/auth/callback` to **Redirect URLs** for local development.
- Add `https://YOUR-APP-DOMAIN/auth/callback` for the deployed app.
- Keep the Email provider enabled. Email confirmation can remain enabled; after confirmation, members return to the invitation that started signup.

## Edge Functions

Deploy the invite functions after setting the app's public origin:

```powershell
supabase secrets set APP_BASE_URL=https://YOUR-APP-DOMAIN
supabase functions deploy create-invite
supabase functions deploy validate-invite
supabase functions deploy redeem-invite
supabase functions deploy submit-membership-application
supabase functions deploy review-membership-application
supabase functions deploy manage-member-reference
supabase functions deploy request-attestation
```

Member-reference email notices are optional. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to send them; in-app reference requests remain available without email. `request-attestation` is retained for historical SMS attestations, while new Trust-page requests use member references.

```powershell
supabase secrets set RESEND_API_KEY=YOUR-RESEND-KEY RESEND_FROM_EMAIL="Netrufy <verified@your-domain.com>"
```

Guarantor requests send SMS through Termii. Configure these secrets before using that feature:

```powershell
supabase secrets set APP_URL=https://YOUR-APP-DOMAIN TERMII_API_KEY=YOUR-TERMII-KEY TERMII_SENDER_ID=YOUR-APPROVED-SENDER-ID
```

For local invite links, set `APP_BASE_URL=http://localhost:4200` in the Edge Function environment instead. Do not use the local URL for production.

## New Member Application

Visitors can search profiles at `/directory` without signing in. To apply, choose **Join your community**. The applicant selects a Unit and submits their details and a profile photo. The photo is compressed in the browser and capped at 100 KB; the private Storage bucket and Edge Function also enforce the limit.

The selected Unit's leader reviews the application in **Unit admin**. Approval generates a seven-day, single-use invitation bound to the applicant's email. The applicant follows that link, creates an email/password account, and confirms their email if required. Only after invite redemption is the member profile created.

If an applicant opts into public listing, their approved profile photo and fields explicitly set to **Anyone** can appear in anonymous search. Otherwise their profile remains private to the community and the member's own visibility settings. Existing profiles stay hidden by default after migration; each member can open **My profile**, enable **Show my profile in public search**, choose **Anyone** only for fields they want public, and save. Profile photo upload also requires public listing and Photo visibility set to Anyone because the image URL is public. Community and Unit approval verify membership, not professional skill.

Community administrators should assign a verified membership as a Unit leader from **Admin → Assign a Unit leader** before expecting that leader to access **Unit admin**. New pending applications appear in the Unit dashboard and trigger an in-app live notification while the dashboard is open.