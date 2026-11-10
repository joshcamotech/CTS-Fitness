# App Store Submission — working checklist

Living document. Started 2026-09-21 on branch `feat/app-store-compliance`.
Audited against the [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
as published September 2026.

**If you are picking this up in a new session: read "Pick up here" directly
below, then "Current state". Everything in Phases 0–9 is done and merged.**

---

## Pick up here — as of 2026-11-10 (end of session)

**State in one paragraph.** The account migration is finished
(`ACCOUNT_MIGRATION.md`). All app code for v1 is merged through PR #60 and live
over OTA: Expo SDK 58 / RN 0.88, app version 1.2.0, migrations **025, 026 and
027 applied to production**. Auth email runs through Resend with Confirm email
ON, forgot-password works (tested on device), demo accounts are created and
seeded. **No iOS build exists yet** (`eas build:list` empty on 2026-11-10).
Device tests 1–8 passed on 2026-11-10; **test 9 (delete account) and the two
027 proofs are still to do.** A pre-flight check on 2026-11-10 found two things
to fix before the first build (the EAS production variables and a flat RGB
icon); **both are fixed** (section A). The build itself is the next step.

Do **not** change `expo.slug` or the EAS `projectId` — the slug is tied to the
existing EAS project and the project id is what `updates.url` points at.

### Next steps, in order

#### A. Pre-flight fixes — DONE 2026-11-10

Both were found by a pre-flight check on 2026-11-10 and fixed the same day (PR
touching `mobile/eas.json` and `mobile/assets/icon.png`, plus EAS project
configuration).

1. ~~**Give the build its Supabase settings.**~~ **Done.** `eas env:list
   --environment production` had returned *No variables found*, and `eas.json`
   had no `env` block. The app reads `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` at build time and throws in
   `src/config/index.ts` before rendering if they are missing, so a build
   without them would crash on launch. A cloud build cannot read the local
   gitignored `.env`, and `ios-release.yml` only sets them in the runner's
   shell, which Expo's docs do not confirm reaches the cloud build.
   - Both variables now exist as **plain-text** variables in the **production**
     environment of `@camotech/gym-tracker`, copied from the GitHub Actions
     variables of the same names (public by design; the anon key is protected
     by RLS). Created with `eas env:set --name … --value … --environment
     production --visibility plaintext` (eas-cli 24.8; `env:create` is
     deprecated). Values were never printed or committed.
   - `mobile/eas.json`: the `production` profile now has
     `"environment": "production"`. Profile names are not mapped
     automatically. The `preview` profile has no environment set and the
     `preview` EAS environment has no variables, so a preview build would
     still crash on launch — add the variables there first if one is ever
     needed.
   - **Verified:** `eas config --platform ios --profile production` reports
     *"Environment variables … loaded from the production environment on EAS:
     EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_URL"* and resolves the
     profile with `"environment": "production"`.
   - If the Supabase URL or anon key ever changes, update **both** the GitHub
     Actions variables (used by `eas-update.yml`, which bundles on the runner)
     **and** the EAS `production` variables (used by cloud builds).
   - `ios-release.yml` still sets the same variables in the runner shell and
     says they are inlined at build time. That is now redundant for cloud
     builds (EAS supplies them) and harmless; the comment is slightly
     misleading. Not changed, because a push touching `.github/workflows`
     needs the `workflow` token scope.
2. ~~**Flatten the iOS icon.**~~ **Done.** `mobile/assets/icon.png` was
   1024×1024 and fully opaque (0 transparent pixels) but saved RGBA, which
   Apple's validator can reject. Re-saved as plain RGB (PNG colour type 2),
   verified pixel-identical to the original. `adaptive-icon.png` and
   `splash-icon.png` were left alone: they are transparent by design and Apple
   does not check them. Still confirm the icon in the built app (step D2).

#### B. Josh's prerequisites

- **Node 22.13 or newer** — the PC had v22.12.0 on 2026-11-10 (tooling warns).
- Optional: `npm install -g eas-cli` (27.5.0 was available; older works).
- **Apple Developer account**: membership shows *active*, and **Agreements,
  Tax, and Banking** has nothing left to accept.
- Have the **Apple ID and 2FA device** to hand: the first build prompts for them
  to create the distribution certificate and provisioning profile. Say yes to
  EAS generating and managing credentials (stored under the `camotech` org).

#### C. Finish testing and manual items (before Submit; some before the build)

1. **Prove migration 027.** As `demo_friend`, report one of `demo_lifter`'s
   posts and leave the report in place, then re-run
   `supabase/scripts/seed_demo_account.sql`. It must complete, and the report
   must survive with its target id null and snapshot intact. Then delete the
   test report: `delete from public.content_reports where reporter_id is not
   null;` (check first that only test reports are in the table).
2. **Device test 9 — Delete Account, extended.** On a **throwaway** account
   (never a demo one): have another account report one of its posts, then delete
   the throwaway. It must succeed and land on Login; verify
   `select count(*) from auth.users where email = '<throwaway>'` returns 0.
3. Supabase → Authentication → Emails → Templates → **Reset Password** still
   contains `{{ .Token }}` (forgot-password depends on it).
4. Supabase → URL Configuration → Redirect URLs contains
   `https://ctsfitness.camotechsolutions.com.au/**` and `ctsfitness://**`;
   remove the stale `gymtracker://*` and the `exp://192.168.50.115…` entry.
5. **Accept Resend's data processing agreement** (the privacy policy relies on
   it).
6. Confirm the deployed `generate-workout` Edge Function matches `main`
   (CI does not deploy it).
7. **Trademark check** on "CTS Fitness" on the IP Australia register.

#### D. Build, test, list, submit

1. **First store build, locally and interactively** (CI cannot do the first
   one). Check `npx eas-cli whoami` shows `camotech-solutions`, then from
   `mobile/` on an up-to-date `main`:
   `eas build --profile production --platform ios`. Allow ~30 min. Afterwards
   run `eas credentials -p ios` and add an App Store Connect API key so later
   builds and submits can run from the **iOS release** workflow unattended.
2. **Check the build** — an `.ipa` exists; watch for an ITMS-91053 email after
   upload (Phase 5). Later builds: Actions → **iOS release** → Run workflow
   (`submit: false` until ready).
3. **TestFlight on a real phone** — first standalone build (not Expo Go):
   re-check icon, splash, login, the sign-up confirmation email and its
   Open CTS Fitness button (the `ctsfitness://` scheme only works in a
   standalone build), forgot-password, and the keyboard bar.
4. **App Store Connect listing** — create the app record (permanently locks
   `au.com.camotechsolutions.ctsfitness`, which is final), then everything in
   Phase 6 / `APP_STORE_CONNECT.md`.
5. **Re-run the demo seed immediately before Submit**, and before any
   resubmission (dates are relative to the run day). Put both demo passwords in
   the review notes.
6. **Submit.**

Demo accounts (done 2026-11-10): both created in the Supabase dashboard
(Authentication → Users → Add user, **Auto Confirm User** ticked) and seeded
with `supabase/scripts/seed_demo_account.sql`. Procedure in
`APP_STORE_CONNECT.md` §2. `demo_friend`'s three sessions are 2, 9 and 16 days
before the seed run, so on that account the history is in the *previous*
weeks, not the current one. Keep both passwords in a password manager, never
the repo.

Optional, not blocking: clear the parked React Compiler lint findings (18 on
2026-11-10, none from new code) with `cd mobile && npm run lint:compiler` —
needs a device to verify against.

### Changed since 2026-09-26

All merged to `main` 2026-09-28 to 2026-11-05. None of it changes the manual
steps above; it does mean a build made now includes it.

- **PRs #48 / #49 (2026-09-28):** the Back / Next / Done keypad bar now
  measures its offset (`useKeyboardOffset`) instead of hardcoding 96, and keeps
  working on iOS.
- **PR #50 (2026-11-05): Expo SDK 58** (`expo ^58.0.23`, RN 0.88.1). Node
  22.13+ is the floor for local work (`README.md`). `app.json` went 1.1.0 →
  1.2.0 and `runtimeVersion` follows `appVersion`, so 1.2.0 is a new OTA
  runtime: installs on 1.1.x do not receive it. The OTA workflow's
  native-change warning on that push was expected.
- **PR #51 + migration 025 (applied):** remaining "GymTracker" strings
  renamed to CTS Fitness, including the content-filter error shown to users
  (`enforce_content_filter()`, same body as 023), `Logo.tsx` and `schema.sql`.
- **PR #52 + migration 026 (applied): Current PR chip is tappable** and jumps
  to the day and set the record was hit. `get_exercise_pr` now returns a `date`
  per record. This supersedes the unmerged `feat/pr-source-location` branch
  (its migration 022 was never merged). Same PR hardened the AI workout
  generator (below).
- **PR #53:** when the AI generator fails, the message now includes Google's
  error code (e.g. `Google error 429 RESOURCE_EXHAUSTED`) so a failure is
  diagnosable from the phone. Worth knowing before App Review: if a reviewer
  hits a Gemini quota or outage, they will see that code.
- **AI generator model handling** (`supabase/functions/generate-workout`): the
  function now tries `GEMINI_MODEL` (optional secret), `gemini-3.7-flash`,
  `gemini-3.6-flash`, then `gemini-flash-latest`, moving to the next model on
  404, 429 or 5xx. The API key moved from the URL to the `x-goog-api-key`
  header. A missing `GEMINI_API_KEY` returns a clear 503. Edge Functions are
  deployed by hand, not by CI — confirm the deployed version matches `main`.

#### Added 2026-11-10 after device testing

- **PR #57:** comment box and preset editor now measure the keyboard offset
  (`useKeyboardOffset`) — the keypad no longer covers the comment input.
- **Custom SMTP (dashboard config, not in the repo):** Supabase's built-in email
  only delivers to org team members at 2/hour, so no real user could confirm an
  email. Auth email now goes through **Resend** (`smtp.resend.com:465`, sender
  `no-reply@camotechsolutions.com.au`, domain verified, free plan). **Confirm
  email is ON.** Resend is named in the privacy policy (PR #58).
- **PR #58:** the confirmation link lands on `docs/confirmed.html`; adds the
  `ctsfitness://` scheme (native config — needs the first build to take effect).
  Needs `https://ctsfitness.camotechsolutions.com.au/**` in Supabase → Redirect
  URLs, or Supabase falls back to the Site URL.
- **Forgot password (new):** "Forgot password?" on the sign-in screen opens
  `ForgotPasswordModal`: email → 6-digit emailed code + new password →
  `verifyOtp(recovery)` then `updateUser`, then other sessions are signed out.
  **Requires the Supabase "Reset Password" email template to contain
  `{{ .Token }}`** (Authentication → Emails → Templates); the default template
  only has a link and the flow cannot work without the code. Re-check the
  template before submitting.
- **Migration 027 (PR #60) — found in device testing (test 5 + re-seed):**
  migration 023 had `content_reports` targets `ON DELETE SET NULL` *and* a
  CHECK requiring exactly one target id, so deleting reported content (or a
  reported user's account) aborted with `content_reports_target_matches_type`.
  That would have broken `delete_my_account()` (Guideline 5.1.1(v)) for anyone
  who had ever been reported, and the demo seed's wipe step. 027 relaxes the
  CHECK and narrows the one-report-per-reporter index. **Applied by Josh in the
  SQL editor and its definitions verified, 2026-11-10.** Still unproven in
  behaviour: see "Pick up here" C1 and C2 (seed re-run with a report in place,
  and deleting an account whose post has been reported).

### Changed since 2026-09-24

- **Account migration closed out 2026-09-25:** Supabase, Expo (`camotech`
  org, robot token for CI) done; personal logins removed; unused CamoTech AI
  Studio keys deleted; secret scanning + push protection on. Gemini key stays on the
  personal Google account on purpose (`ACCOUNT_MIGRATION.md` step 6).
- **PRs #44 / #45 (2026-09-26):** set entry is weight-then-reps everywhere,
  including AI Workout; set summaries read `60 KG × 8`, collapsed cards
  `3 sets · 60 KG × 8`; iOS number pads get a per-field **Back / Next / Done**
  bar (`KeyboardFieldBar` + `useFieldChain` — one bar per input because a
  shared `inputAccessoryViewID` breaks on RN ≥ 0.76).
- **PR #46 + migration 024 (applied 2026-09-26): cardio removed** from the
  app, database, privacy policy, support page, App Store docs and demo seed.
  `cardio_sessions` and its RPCs are dropped; the hero card's second stat is
  now Sets. The privacy label wording for Health & Fitness is "App
  Functionality (the workout history)".

---

## Current state

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Audit + this checklist | done |
| 1 | Legal pages (privacy / terms / support) | done — all three serving, verified 2026-09-22 |
| 2 | Migration 023: blocks, reports, content filter, account deletion | applied to production 2026-09-21 |
| 3 | Settings: legal links, blocked users, delete account | done |
| 4 | Report + block UI, sign-up terms gate, AI disclaimer | done |
| 5 | `app.json` / `eas.json` build + submit config | done |
| 6 | App Store Connect submission pack | drafted in `APP_STORE_CONNECT.md`; manual entry still to do |
| 7 | CI/CD pipeline | done — merged as PR #37, green on `main` 2026-09-22 |
| 8 | Move off personal accounts to CamoTech | done — closed out 2026-09-25. Log in `ACCOUNT_MIGRATION.md` |
| 9 | Pre-submission app changes | done — weight-first set entry + keyboard bar (PRs #44, #45), cardio removed (PR #46, migration 024 applied 2026-09-26) |
| 10 | Post-freeze changes | done — Expo SDK 58 (#50), CTS Fitness rename + migration 025 (#51), tappable PR chip + migration 026 + AI generator hardening (#52, #53), keypad offset fix (#48, #49, #57). 025/026 applied to production. Also: Resend SMTP + Confirm email on + confirmation redirect page (#58), forgot-password (#59), migration 027 `content_reports` delete fix (#60, applied). |

Decisions made 2026-09-21:

- Legal pages hosted on **GitHub Pages from `/docs` in this repo**.
- **The repo was made public** on 2026-09-21, because GitHub Pages requires it
  on the Free plan. Consequences, checked at the time:
  - Git history was scanned and contains **no committed secrets** — no `.env`
    has ever been tracked on any branch, and the only key-shaped match in the
    whole history was a substring of an npm `sha512` integrity hash.
  - The Supabase anon key is not in the repo (it lives in GitHub Actions
    variables), and is safe to expose regardless — RLS is the access boundary.
  - The RLS model in `supabase/migrations/` is now world-readable. That is
    fine: the security model is the policies themselves, not obscurity.
  - **The blocklist seed in migration 023 is now world-readable**, which
    partly undercuts the reason `blocked_terms` has RLS with no policies. The
    table stays locked because it keeps the list out of the app and the REST
    API, but anyone who thinks to read the migration on GitHub can see it.
    Accepted: the filter's job is to stop casual and accidental posting, and
    report + block are what cover a determined evader. If that stops being
    good enough, move the seed list out of the repo rather than loosening the
    table.
  - `eas-update.yml` triggers only on `push` to `main`, not `pull_request`, so
    a fork cannot reach `secrets.EXPO_TOKEN`.
  - Worth turning on: repo Settings → Code security → **Secret scanning** and
    **Push protection**. Both are free on public repos and would catch a
    future accidental key commit before it lands.
- Moderation backend is **reports table + instant block**, no email alerts and
  no admin screen. Reports are read by querying `content_reports` in the SQL
  editor.
- Work branches from `origin/main`. **Next free migration number is 028.**
  022 is a permanent gap: it was reserved by the unmerged branch
  `feat/pr-source-location`, whose feature shipped instead as migration 026
  (PR #52). Do not merge that branch — it would collide with the shipped
  code. `scripts/check-migrations.mjs` will keep reporting 022 as unused;
  that is not an error.

---

## Blocking manual steps

None of this can be done from a coding session. All of it has to happen before
submission.

**Done:**

1. ~~Run migration 023~~ — **done 2026-09-21**. Confirm it applied *completely*
   with the verification query in Phase 2 before trusting it; a partial apply
   is worse than none.
2. ~~Enable GitHub Pages~~ — **done 2026-09-21**, and ~~confirm the URLs
   serve~~ — **done 2026-09-22**: PR #36 merged, and all three legal URLs
   return 200. Re-check immediately before submitting; a dead privacy policy
   link is a 2.1 rejection on its own.

**Done, as of 2026-09-24:**

3. ~~Enrol in the Apple Developer Program~~ — **enrolled as an Individual**,
   using the CamoTech email. See `ACCOUNT_MIGRATION.md` for why Individual,
   not Organization.
4. ~~Decide on the app name~~ — **"CTS Fitness"**. `mobile/app.json`, the
   `docs/*.html` legal pages and `mobile/src/constants/legal.ts` all updated
   in one PR, along with the bundle ID.

**Done, as of 2026-09-26:**

5. ~~Move off personal accounts~~ — **done**, all loose ends closed. See
   `ACCOUNT_MIGRATION.md`.
6. ~~Migration 024 (remove cardio)~~ — **applied 2026-09-26**.

**Done, as of 2026-11-10:**

6a. ~~Migrations 025 (branding) and 026 (PR date)~~ — **applied to production**,
    confirmed by Josh.

**Outstanding** — see "Next steps, in order" under "Pick up here" above:

6b. ~~Apply migration 027~~ (`content_reports` delete fix) — **applied and
    verified 2026-11-10**; behaviour proofs still open (Pick up here C1, C2).
7. ~~Create the demo accounts~~ — **done 2026-11-10**.
8. **Test on a real device** — tests 1–8 passed 2026-11-10; **test 9 still
   open** (see "What has not been tested").
9. ~~Pre-flight fixes~~ (EAS production variables, flat RGB icon) — **done
   2026-11-10**. Then **signing credentials**, **the first build**, TestFlight, the App Store
   Connect listing, and submit. All in "Pick up here" A–D.

---

## Why this app is a harder submission than it looks

The app is not just a workout logger. It has a **social layer** — usernames,
display names, friend requests, shared PR posts with free-text captions, and
comments — which makes it a user-generated-content app under **Guideline 1.2**,
even though visibility is friends-only. Apple does not exempt friends-only
feeds. It also sends user prompts and 30 days of training history to **Google
Gemini**, which triggers the third-party-AI disclosure wording in **5.1.2(i)**.

---

## Phase 1 — Legal pages (done)

Apple requires a public privacy policy URL (5.1.1(i)), a support URL with a
working contact method (1.5), and, for UGC apps, terms the user agrees to that
carry a zero-tolerance clause (1.2).

- [x] `docs/index.html` — support / contact landing page
- [x] `docs/privacy.html` — privacy policy
- [x] `docs/terms.html` — terms of use / EULA with zero-tolerance clause
- [x] `docs/style.css` — shared styling, mirrors the app's dark palette
- [x] `docs/.nojekyll` so Pages serves the HTML verbatim
- [x] **Manual:** enable GitHub Pages — done 2026-09-21
- [x] **Manual:** confirm all three URLs load publicly — done 2026-09-22, all
      three return 200. Re-check immediately before submitting.

URLs once Pages is on — these are what the app links to and what goes into App
Store Connect:

Target URLs, decided 2026-09-24 (not yet live — DNS + Pages custom domain is
still an outstanding manual step, see `ACCOUNT_MIGRATION.md`):

| Page | URL |
|------|-----|
| Support | `https://ctsfitness.camotechsolutions.com.au/` |
| Privacy policy | `https://ctsfitness.camotechsolutions.com.au/privacy.html` |
| Terms of use | `https://ctsfitness.camotechsolutions.com.au/terms.html` |

The old `joshcammo.github.io/GymApp/...` URLs returned 200 as of 2026-09-22,
but will stop working once the repo is transferred off that account — re-verify
the new URLs return 200 before submitting, not the old ones.

The privacy policy names every processor and confirms equivalent protection, as
5.1.1(i) requires:

| Third party | What it receives | Why |
|-------------|------------------|-----|
| Supabase | all account and workout data | hosting, database, auth |
| Resend | email address + account email content (confirmation, password-reset code) | custom SMTP for Supabase Auth, added 2026-11-10 |
| Google (Gemini API) | AI prompt + 30 days of training history | AI workout generation |
| Expo / EAS | device platform, app version, IP | over-the-air app updates |
| Apple | purchase/download metadata | App Store distribution |

No analytics SDK, no ad network, no tracking, no data sale. **Keep it that way**
— adding any of them changes both this policy and the privacy nutrition label.

**Contact address** is `josh@camotechsolutions.com.au`, which becomes publicly
visible on the Pages site. Swap it for a dedicated support alias if you would
rather not publish your business address; it appears in `docs/*.html` and in
`mobile/src/constants/legal.ts`.

---

## Phase 2 — Migration 023 (applied 2026-09-21)

`supabase/migrations/023_moderation_and_account_deletion.sql`.

### Verify it applied completely

Run this in the SQL editor. Every row should read `ok`; anything else means the
migration stopped partway and the objects after that point are missing.

```sql
select 'table user_blocks'     as object, case when to_regclass('public.user_blocks')     is not null then 'ok' else 'MISSING' end as status
union all select 'table content_reports',  case when to_regclass('public.content_reports')   is not null then 'ok' else 'MISSING' end
union all select 'table blocked_terms',    case when to_regclass('public.blocked_terms')     is not null then 'ok' else 'MISSING' end
union all select 'fn is_blocked',          case when to_regproc('public.is_blocked')         is not null then 'ok' else 'MISSING' end
union all select 'fn block_user',          case when to_regproc('public.block_user')         is not null then 'ok' else 'MISSING' end
union all select 'fn unblock_user',        case when to_regproc('public.unblock_user')       is not null then 'ok' else 'MISSING' end
union all select 'fn my_blocked_users',    case when to_regproc('public.my_blocked_users')   is not null then 'ok' else 'MISSING' end
union all select 'fn report_content',      case when to_regproc('public.report_content')     is not null then 'ok' else 'MISSING' end
union all select 'fn is_objectionable',    case when to_regproc('public.is_objectionable')   is not null then 'ok' else 'MISSING' end
union all select 'fn delete_my_account',   case when to_regproc('public.delete_my_account')  is not null then 'ok' else 'MISSING' end
union all select 'blocklist seeded',       case when (select count(*) from public.blocked_terms) >= 50 then 'ok'
                                                else 'ONLY ' || (select count(*) from public.blocked_terms)::text end
union all select 'content filter triggers', case when (select count(*) from pg_trigger
                                                       where tgname in ('trg_posts_content_filter',
                                                                        'trg_post_comments_content_filter',
                                                                        'trg_profiles_content_filter')) = 3
                                                then 'ok' else 'MISSING' end;
```

If anything is missing, the migration is **not** safely re-runnable as a whole —
`create table` and `create function` (without `or replace`) will fail on the
objects that did land. Drop what it created and re-run the whole file, or apply
just the missing tail by hand.

- [x] `public.user_blocks` — per-direction, cascade from `auth.users`
- [x] `public.is_blocked(a, b)` — direction-agnostic, `security definer`
- [x] Blocking folded into `are_friends()`, so all six dependent policies on
      `posts` / `post_likes` / `post_comments` inherit it, as does anything
      added later that reuses the helper
- [x] Explicit author checks added to the comment and like select policies — a
      block has to hold between two people commenting under a *mutual friend's*
      post, which the friendship check alone does not cover
- [x] `profiles` search hides blocked users, or the block is worked around by
      re-sending a friend request
- [x] `send_friend_request()` refuses across a block, using the same error text
      as "no such user" so the block is not disclosed to the sender
- [x] `block_user()` also deletes any friendship or pending request, both
      directions; `unblock_user()` deliberately does not restore it
- [x] `my_blocked_users()` — `security definer`, because `profiles` search now
      hides the very users the blocker needs to see listed
- [x] `public.content_reports` + `report_content()` — write-only for users,
      snapshots the reported text so a report outlives both the content and the
      accounts (`ON DELETE SET NULL`, not `CASCADE`)
- [x] `public.blocked_terms` + `normalize_for_filter()` + `is_objectionable()` +
      BEFORE triggers on `posts.caption`, `post_comments.body`,
      `profiles.username`, `profiles.display_name`
- [x] `public.delete_my_account()` — `security definer`, deletes the caller's
      `auth.users` row. Every user-owned table cascades from `auth.users`, so
      this is sufficient. Verified 2026-09-21 across `exercises`,
      `exercise_defs`, `presets`, `profiles`, `friendships`, `posts`,
      `post_likes`, `post_comments`, `ai_generation_log`, `cardio_sessions`
      (the last since dropped in migration 024).
- [x] **Manual:** run it in the Supabase SQL editor — done 2026-09-21

> **Applied to production 2026-09-21 by Josh.** It was never executed from a
> coding session — there is no local Postgres, Docker or Supabase CLI on this
> machine — so it went to production reviewed statically rather than tested.
> Run the verification query above, and treat the first real use of each
> feature as the actual test. Static review caught and fixed four defects
> before it was applied: a duplicated character in the `translate()` leet map; a
> two-character term failing the three-character minimum on
> `blocked_terms.term`, which would have aborted the entire migration;
> `INSERT ... RETURNING` in `report_content()` requiring a SELECT policy that
> the write-only report queue deliberately does not have; and a
> substring-matching pass that rejected "scraped my shin". **Expect to iterate
> on first run.**

Target Postgres is **17.6** (from `supabase/.temp/postgres-version`), so the
`NULLS NOT DISTINCT` index (PG15+) is supported.

### Reviewing reports

There is no admin UI, by design. In the Supabase SQL editor:

```sql
select id, created_at, target_type, target_username, reason, details, target_snapshot
from public.content_reports
where status = 'open'
order by created_at desc;
```

Then action it and close the loop:

```sql
update public.content_reports
set status = 'actioned', reviewed_at = now(), reviewer_notes = 'removed the post'
where id = 1;
```

The terms and the support page both promise review **within 24 hours**. That is
a commitment a reviewer may test, and it is the standard for UGC apps.

To extend the filter from what reports actually surface, insert into
`public.blocked_terms`. Terms must be lowercase `a-z0-9`, 3–40 characters.
Normalisation handles leetspeak and repeated letters, so only the plain
spelling is needed.

---

## Phase 3 — Settings (done)

- [x] Support & Contact, Privacy Policy, Terms of Use — open the Pages URLs
- [x] Blocked Users — list and unblock
- [x] **Delete Account** — typed confirmation, then `delete_my_account()`
- [x] Settings reorganised into ACCOUNT / SAFETY / ABOUT sections with a scroll
      container, having grown from five rows to ten

Deviation from the original plan: **Blocked Users is a modal, not a stack
screen.** It matches the existing picker-modal pattern, and it avoids editing
`RootStackParamList` in `mobile/src/types/index.ts` while unrelated
work-in-progress is sitting uncommitted in that file.

Delete uses a typed `DELETE` confirmation rather than `Alert.prompt`, which is
iOS-only. It signs out with `scope: 'local'`, because the user the session
belongs to no longer exists server-side and a normal sign-out would fail and
strand the app on a dead session.

---

## Phase 4 — Moderation UI (done)

- [x] Overflow menu on `PostCard` — delete on your own posts, report/block on
      everyone else's (replaces the own-post-only trash button)
- [x] Overflow menu on each comment in `PostDetailScreen`
- [x] Overflow menu on `FriendsScreen` search results and friend rows
- [x] `ReportModal` — reason picker, optional detail, and an "also block" toggle
- [x] `useContentActions` holds the Alert, the sheet and the post-block cleanup,
      so the three screens don't each reimplement them
- [x] Sign-up gate in `LoginScreen`: required checkbox with tappable Terms and
      Privacy links and the zero-tolerance line; Sign Up stays disabled until it
      is ticked
- [x] `AiWorkoutScreen` discloses the Gemini call at the point it happens
      (5.1.2(i)) and disclaims generated training as non-medical advice (1.4.1)

Deviation from the original plan: **no client-side copy of the blocklist.** The
trigger raises a user-facing message, and all four content-write paths —
caption, comment, username setup, username change — already surface
`error.message` verbatim in an Alert. Shipping the terms in the bundle would
only hand an evasion guide to anyone who unzips the IPA.

Blocking triggers a local list cleanup in each screen, because RLS hides the
blocked user's content from the *next* fetch while the list on screen was loaded
before the block existed. On `PostDetailScreen`, blocking the post's author
makes the post itself unreadable, so it pops back to the feed.

---

## Phase 5 — Build and submit config (done)

- [x] `app.json` — `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`, so you
      stop answering the export-compliance prompt on every build
- [x] `eas.json` — `production` build profile with `distribution: "store"` and
      `autoIncrement: true`; a `preview` profile for internal builds; a named
      `submit.production` profile
- [ ] **Manual:** run the **iOS release** workflow (Actions → iOS release →
      Run workflow). It runs the same gate a PR does, then
      `eas build --platform ios --profile production`. Run it with
      `submit: false` first.
- [ ] **Manual:** upload App Store Connect credentials to EAS once, with
      `eas credentials`, so the workflow's submit step can run
      non-interactively. Until then, submit from the EAS dashboard by hand.
      The submit profile in `eas.json` stays empty rather than carrying
      guessed Apple ID / team ID values.
- [ ] **Manual: verify the built IPA's app icon has no alpha channel.** All four
      PNGs in `mobile/assets/` are RGBA (colour type 6). Expo normally flattens
      the iOS icon during prebuild, but Apple rejects icons with transparency,
      so confirm it in the actual build rather than assuming.
- [ ] **Manual:** after the first upload, watch for an ITMS-91053 email about
      missing privacy-manifest reasons. The app's own code calls no
      required-reason APIs directly, and async-storage ships its own manifest,
      so none is expected — but confirm rather than assume.

Corrected from the original plan: **no `ios.buildNumber` in `app.json`.** With
`cli.appVersionSource: "remote"`, EAS owns the build number, so a local value is
ignored; `autoIncrement` on the build profile is the correct pairing.

Note that `.github/workflows/eas-update.yml` publishes OTA updates on every push
to `main`. Native and config changes are **not** covered by OTA — the Phase 5
changes need a fresh `eas build`.

---

## Phase 6 — App Store Connect (drafted)

Not code. Do this after a build is uploaded.

**Written up in full in `APP_STORE_CONNECT.md`** — the name collision check,
the demo-account procedure, copy-paste review notes, the nutrition label, the
age-rating answers, the screenshot list and what to do about a rejection. The
summary below stays here so this checklist reads end to end.

- [x] **App name** — **decided: "CTS Fitness"**, 2026-09-24. "GymTracker" was
      confirmed taken (iTunes Search API, 2026-09-22). "CTS Fitness" checked
      clear the same way on 2026-09-24 — see `APP_STORE_CONNECT.md` §1. Trade
      mark register check still outstanding, do before submitting.
- [ ] **Demo account** (2.1) — the app is login-gated, so review *will* fail
      without working credentials in the review notes. **Two** accounts: the
      reviewer needs someone else's content to report and block. Sign both up
      through the app, then run `supabase/scripts/seed_demo_account.sql`,
      which fills six weeks of progressive training, an
      accepted friendship, posts from both sides and comments in both
      directions. Idempotent and scoped to the two demo users.
- [ ] **Notes for Review** (2.3.1(a)) — describe the AI generator and the social
      features *specifically*; generic descriptions get rejected. State where
      Report and Block live, because a reviewer who cannot find them will reject
      under 1.2. Suggested wording:

  > Social features are friends-only and require an accepted friend request.
  > Report and Block are on the overflow menu of any post or comment, and on the
  > overflow menu of any user in Friends. Blocked users are managed in
  > Settings → Blocked Users. Account deletion is Settings → Delete Account.
  > The AI Workout screen sends the user's typed prompt and a summary of their
  > last 30 days of training to Google's Gemini API to generate a suggestion;
  > this is disclosed on that screen and in the privacy policy.

- [ ] **Privacy nutrition label** — email address, user content, health &
      fitness, identifiers. Linked to identity; **not** used for tracking.
- [ ] **Age rating** — answer honestly; the UGC and social features drive this.
- [ ] Category: Health & Fitness
- [ ] Screenshots for every required device size
- [ ] Privacy policy URL and support URL from Phase 1

---

---

## Phase 7 — CI/CD (done, merged as PR #37)

Added 2026-09-22, because the pipeline was the weakest part of the submission
and nothing in Phases 0–6 covered it. Before this the repo had **one** workflow
and no gate anywhere: `eas-update.yml` pushed an over-the-air bundle to every
installed production app on each push to `main` with nothing verified first.
An OTA update reaches users' phones with no App Store review in between, so
that was the widest hole in the lifecycle — wider than anything the guidelines
audit found.

| Workflow | Trigger | What it does |
|---|---|---|
| `checks.yml` | called by the others | migration numbering, `npm ci`, lint, typecheck |
| `ci.yml` | every PR, and `main` after merge | runs the gate |
| `eas-update.yml` | push to `main` (mobile paths) | **gate, then** publish OTA |
| `ios-release.yml` | manual only | gate, then `eas build`, optionally `eas submit` |

- [x] ESLint added — `eslint-config-expo` 57, zero errors and zero warnings,
      so `npm run lint` is a hard gate rather than advisory noise. ESLint 9,
      not 10: `eslint-plugin-react` caps its peer range at `^9.7` and crashes
      on 10 inside the Expo config.
- [x] `npm run typecheck` and `npm run lint` scripts, so local and CI run the
      same commands
- [x] `.nvmrc` pins the Node version for CI and local nvm alike
- [x] OTA publishes now require the gate to pass first
- [x] `eas-update.yml` warns in the job summary when a push touched
      `app.json`, `eas.json` or the lockfile — with `runtimeVersion` on the
      `appVersion` policy an OTA cannot deliver those, and the failure mode is
      silence rather than an error
- [x] `ios-release.yml` builds from a clean checkout of a known commit rather
      than a laptop working tree. App Store Connect credentials live in EAS,
      not in GitHub secrets.
- [x] `scripts/check-migrations.mjs` fails on duplicate migration numbers and
      malformed names. Migrations are applied by hand in the SQL editor, so
      this is the only automated check they get. Gaps are reported, not
      failed — 022 is a permanent gap (see Phase 1 decisions).

Verified by reproducing the CI path locally: `rm -rf node_modules`, `npm ci`,
`npm run lint`, `npm run typecheck`, all green, plus the migration check
against both a clean tree and a seeded duplicate.

**Then verified in production on merge**, which matters more: the PR run went
green in 36s, and the push to `main` ran `checks` first, published the OTA
update only after it passed, and correctly raised the native-change warning
(`Changed: mobile/package-lock.json mobile/package.json`). The whole pipeline
has now executed for real rather than only on paper.

Expect that warning to fire on any dependency change, including a
dev-only one like the ESLint install that triggered it here. It is
deliberately conservative — a warning that is occasionally unnecessary is the
right side to err on when the alternative is silently shipping an OTA update
that users cannot receive.

### Two rules are deliberately not enforced

`react/no-unescaped-entities` is **off**. It is a web rule: React Native has no
HTML, so "fixing" `<Text>it's</Text>` to `&apos;` renders those six characters
literally on screen. It flagged 21 sites and every fix would have been a
visible regression.

`react-hooks/set-state-in-effect` and `react-hooks/refs` — the React Compiler
rules Expo 57 enabled (and 58 keeps) — are **off**, flagging 18 real sites
as of 2026-09-26. Each fix is a
behavioural refactor of working screens, and this project has no tests, no
simulator and no device in CI (see "What has not been tested"). Refactoring
them blind immediately before an App Store submission is the wrong trade.
`npm run lint:compiler` re-enables both so the debt stays greppable. **This is
the first thing to work through once a device is available.**

### Still manual, by choice

Database migrations. They are applied by hand in the Supabase SQL editor;
CI only checks their numbering. Automating `supabase db push` on merge would
need the database password in GitHub secrets and a rollback story, against a
single production database with no staging environment. Not worth it at this
size — but it does mean a migration is still the least-protected change this
project can make. Treat every one as production surgery.

## What has not been tested

Being explicit, because none of this was verifiable from a coding session on
this machine:

- **Migration 023 was applied to production without ever being executed in a
  test environment.** Its behaviour is unverified beyond static review.
- **Migration 024 (remove cardio) was applied 2026-09-26 after a parse check
  only** (Postgres's own parser via `pglast`, including every function body),
  not a test run. Worth confirming the Home trend chart and badges load.
- **Migrations 025 and 026** are applied, and Josh reports the app works on
  current `main` (2026-11-10). Not tested on a standalone build, and the
  SDK 58 upgrade has only been exercised in Expo Go so far.
- **No app code has been run from a coding session.** There is no simulator,
  emulator or device available here. Lint and typecheck both pass and both
  gate CI (Phase 7), but neither runs the app. There are still **no tests**
  in this repo, which is the honest gap. Josh has exercised the app on an
  iPhone via Expo Go (the weight/reps entry and keyboard bar were checked
  there on 2026-09-26). The Phase 3/4 moderation UI was walked through on
  2026-11-10: tests 1–8 below passed, **test 9 has not been run**.
- ~~The legal pages have not been served~~ — **served and verified 2026-09-22**,
  all three returning 200.
- **No iOS build has been produced**, so the icon-alpha and privacy-manifest
  items above are unverified.
- ~~The demo seed script has never been executed.~~ **Run by Josh on
  2026-11-10** against production, after a static review against migrations
  001–026 (PR #55 fixed three issues found then). Both demo logins work and the
  shared feed shows on both. Not re-verified: the Progress, Home trend and
  PR-chip screens on `demo_lifter`, and the moderation flows (device list below).

Device test list, in this order since later steps depend on earlier ones.
**Results 2026-11-10 (Expo Go, real iPhone): 1–8 PASSED; 9 NOT RUN.**
Note the order for 7 and 8: do **8 before 7**, because the block must still be
active to prove a blocked user cannot find you. Use `demo@` / `demo2@` for 5–8
(re-run the seed afterwards to restore the friendship and clear any block, after
deleting test reports) and a **throwaway** account for 9, never a demo one:

1. Sign up — Sign Up should stay disabled until the terms box is ticked, and
   both links should open.
2. Settings → Privacy Policy / Terms / Support — all three should load.
3. Set a username containing a blocked term — should be refused with a readable
   message, not a raw Postgres error.
4. Post a caption, then a comment, containing a blocked term — same.
5. From a second account, report a post and then a comment, with "also block"
   off. Check `content_reports` has both rows with the snapshot populated.
6. Block from the overflow menu — content should vanish immediately, and the
   friendship should disappear from both accounts.
7. Settings → Blocked Users → Unblock — the user should reappear in search, but
   **not** as a friend.
8. Confirm a blocked user cannot find you in search or send you a friend request.
9. Settings → Delete Account on a throwaway account — verify it lands back on
   Login and that the rows really are gone across every table. **Extended
   (post-027):** first have another account report one of the throwaway's
   posts, then delete it. Before migration 027 this failed.

---

## Assessed as fine, no action needed

- **3.1 Payments** — no IAP, no subscriptions, free app.
- **4.2 Minimum functionality** — substantial native app, comfortably clear.
- **4.8 Login services** — email/password against the app's own Supabase auth.
  Sign in with Apple is **not** required, because the app uses no third-party or
  social login. Adding Google or Facebook sign-in later would trigger 4.8.
- **2.5.1** — Expo SDK 58 / RN 0.88, current, public APIs only.
- **2.5.2** — EAS Update ships JS and assets only, which is permitted; it does
  not change the app's advertised purpose.
- **5.1.5 Location** — no location APIs used.
- No analytics, ad or tracking SDKs, so no ATT prompt is needed.
