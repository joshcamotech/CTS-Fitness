# App Store Submission — working checklist

Living document. Started 2026-09-21 on branch `feat/app-store-compliance`.
Audited against the [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
as published September 2026.

**If you are picking this up in a new session: read "Pick up here" directly
below, then "Current state". Everything in Phases 0–9 is done and merged.**

---

## Pick up here — as of 2026-09-26

**The account migration is finished** (`ACCOUNT_MIGRATION.md`, all loose
ends closed 2026-09-25). **All app code for v1 is merged** and live over OTA.
What's left is manual: demo accounts, device testing, credentials, the first
store build, and the App Store Connect listing.

Do **not** change `expo.slug` or the EAS `projectId` — the slug is tied to the
existing EAS project and the project id is what `updates.url` points at.

### Next steps, in order

Steps 1–3 need no build and can run in parallel. 4–8 are sequential.

1. **Demo accounts — in progress as of 2026-09-26.** Full procedure in
   `APP_STORE_CONNECT.md` §2. Short version:
   - `demo@camotechsolutions.com.au` and `demo2@camotechsolutions.com.au` must
     be able to **receive email** — sign-up requires confirming the address
     before the first sign-in. Easiest: add both as aliases on Josh's CamoTech
     Workspace mailbox before signing up.
   - Sign both up **in the app** (Expo Go is fine — it uses the same
     production Supabase project), confirm the emails, set usernames
     `demo_lifter` / `demo_friend`.
   - Run `supabase/scripts/seed_demo_account.sql` in the SQL editor.
     **It has never been run** — expect to iterate; bring any error back to a
     coding session.
   - Sign in as `demo_lifter` and check Home, Progress, Workout, feed and
     Friends all have data. Keep both passwords for the review notes.
2. **Walk the device test list** in "What has not been tested" (9 steps:
   sign-up terms gate, legal links, content filter, report, block, unblock,
   delete account). The moderation flows are what Guideline 1.2 review
   checks hardest, and none have been exercised end to end.
3. **Trademark check** on "CTS Fitness" (IP Australia register) — the App
   Store name collision check is done, this isn't.
4. **First store build, locally** — it needs the Apple ID + 2FA to create
   signing credentials, so CI can't do the first one. Check
   `npx eas-cli whoami` shows `camotech-solutions` (it did on 2026-09-25), then
   from `mobile/` on an up-to-date `main`:
   `eas build --profile production --platform ios`. Allow ~30 min. Also run
   `eas credentials -p ios` and add an App Store Connect API key, so later
   builds and submits can run from the **iOS release** workflow unattended.
5. **Check the build** — icon has no alpha channel; watch for an ITMS-91053
   email after upload (Phase 5). Later builds: Actions → **iOS release** →
   Run workflow (`submit: false` until you're ready).
6. **TestFlight on a real phone** — first standalone build (not Expo Go):
   re-check icon, splash, login and the Back/Next/Done keyboard bar.
7. **App Store Connect listing** — create the app record (permanently locks
   `au.com.camotechsolutions.ctsfitness`, which is final), then everything
   in Phase 6 / `APP_STORE_CONNECT.md`.
8. **Submit.**

Optional, not blocking: clear the 18 parked React Compiler lint findings
(`cd mobile && npm run lint:compiler`) — needs a device to verify against.

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
- Work branches from `origin/main`. **Next free migration number is 025.**
  022 is reserved by `022_pr_source_location.sql` on the unmerged branch
  `feat/pr-source-location` (Current PR chip → jump to the day it was hit;
  pushed, no PR yet). That branch needs a rebase onto `main` before it can
  merge — it conflicts with the keyboard-chaining code in
  `AddExerciseScreen.tsx` — and 022 must be applied to production before or
  with it.

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

**Outstanding** — see "Next steps, in order" under "Pick up here" above:

7. **Create the demo accounts** — in progress.
8. **Test on a real device** — see "What has not been tested".
9. **Signing credentials**, then **run the iOS release workflow**, then
   TestFlight, the App Store Connect listing, and submit.

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
      failed — 022 is legitimately reserved by an unmerged branch.

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
rules Expo 57 enables — are **off**, flagging 18 real sites. Each fix is a
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
- **No app code has been run from a coding session.** There is no simulator,
  emulator or device available here. Lint and typecheck both pass and both
  gate CI (Phase 7), but neither runs the app. There are still **no tests**
  in this repo, which is the honest gap. Josh has exercised the app on an
  iPhone via Expo Go (the weight/reps entry and keyboard bar were checked
  there on 2026-09-26), but the Phase 3/4 moderation UI has not been walked
  through yet — that's the list below.
- ~~The legal pages have not been served~~ — **served and verified 2026-09-22**,
  all three returning 200.
- **No iOS build has been produced**, so the icon-alpha and privacy-manifest
  items above are unverified.
- **The demo seed script has never been executed.** Same constraint as
  migration 023: no local Postgres on this machine. It was reviewed statically,
  and its strings were checked against the content filter's blocklist by
  re-implementing `normalize_for_filter()` and the word-boundary match — none
  of the demo captions, comments or usernames trip it. Expect to iterate on
  first run anyway.

Worth walking through on a real device once the migration is applied, in this
order, since later steps depend on earlier ones:

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
   Login and that the rows really are gone across every table.

---

## Assessed as fine, no action needed

- **3.1 Payments** — no IAP, no subscriptions, free app.
- **4.2 Minimum functionality** — substantial native app, comfortably clear.
- **4.8 Login services** — email/password against the app's own Supabase auth.
  Sign in with Apple is **not** required, because the app uses no third-party or
  social login. Adding Google or Facebook sign-in later would trigger 4.8.
- **2.5.1** — Expo SDK 57 / RN 0.86, current, public APIs only.
- **2.5.2** — EAS Update ships JS and assets only, which is permitted; it does
  not change the app's advertised purpose.
- **5.1.5 Location** — no location APIs used.
- No analytics, ad or tracking SDKs, so no ATT prompt is needed.
