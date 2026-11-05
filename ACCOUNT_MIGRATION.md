# Account migration — personal to CamoTech Solutions

Everything currently sits on Josh's **personal** accounts. It needs to sit on
**CamoTech Solutions** business accounts before the app ships.

Deferred on 2026-09-22, picked back up 2026-09-24. All four decisions are made
and the code change is merged (PR #40). Supabase, Expo and Gemini handled
2026-09-25.

**Picking this up in a new session — start here:**

- **Fully done:** Apple Developer (Individual, enrolled), app name + bundle ID
  (code merged), GitHub transfer (`joshcamotech/CTS-Fitness`), custom domain —
  DNS, Enforce HTTPS, and all three legal URLs verified returning 200 with the
  correct content on 2026-09-24. Supabase project transferred to the
  Camotech Solutions org, data verified intact, 2026-09-25. Expo project
  transferred to the `camotech` org, `expo.owner` updated, 2026-09-25.
- **Gemini key deliberately stays on the personal Google account** — see
  step 6 for why.
- **Migration complete 2026-09-25.** All loose ends closed: personal login
  removed from the Supabase org; first OTA run on the `camotech` robot token
  passed, then `joshcammo` removed from the Expo org and its old token
  deleted; unused CamoTech AI Studio keys deleted; secret scanning + push
  protection on (0 open alerts). Local EAS CLI verified logged in as
  `camotech-solutions` (Owner of `camotech`) via `npx eas-cli whoami`.
- **Next:** this doc is closed. Submission work continues in
  `APP_STORE_SUBMISSION.md` → "Pick up here" (demo accounts and device
  testing first, then the first `eas build --profile production --platform ios`).
  That build takes ~30 min: it prompts for the Apple ID + 2FA to create
  signing credentials (these land under the `camotech` org), then builds in
  the cloud.
- **Build from an up-to-date `main`**, not an older branch — branches cut
  before PR #42 still have `"owner": "joshcammo"` in `app.json`. Re-run
  `npx eas-cli whoami` first; it must show `camotech-solutions`.

---

## Why this has to happen before the first build

One item is still an effective one-way door:

1. **Apple Developer account type.** ~~An individual enrolment cannot be
   converted into an organization.~~ **Decided 2026-09-24: Individual
   enrolment**, using the CamoTech email as the Apple ID. CamoTech Solutions is
   an ABN sole trader, not a registered company — D-U-N-S numbers go to
   registered legal entities, so Organization enrolment isn't realistically
   available here. This is not a workaround; it's the correct enrolment type
   for a sole trader. Consequence to accept: the App Store **Seller** name will
   show Josh's personal legal name, not "CamoTech Solutions" — that's fixed by
   Apple for Individual accounts regardless of enrolment email. App icon, name
   and description are unaffected. This holds even for future apps — one
   Individual account can publish unlimited apps, but the Seller name is
   account-wide, not per-app. **Confirmed 2026-09-24: stay Individual, revisit
   only if CamoTech Solutions ever incorporates** (a future Organization
   enrolment would need its own D-U-N-S and Apple's app-transfer process to
   move existing apps over — not guaranteed per app, so not a decision to
   make speculatively now).
2. **The bundle identifier.** `com.gymtracker.app` becomes permanent the moment
   the App Store Connect record is created. It is also wrong twice over: it is
   reverse-DNS for `gymtracker.app`, a domain we do not own, and the app name
   is changing anyway.

Both `ios.bundleIdentifier` and `expo.owner` are **native config**, so a build
made before this migration is a build that gets thrown away. This work and the
app-name decision should land in the same pass, since both block the build for
the same reason.

---

## Decisions needed — all four settled 2026-09-24

| # | Decision | Notes |
|---|---|---|
| 1 | ~~Apple enrolment: organization~~ | **Decided & done:** Individual enrolment, CamoTech email as Apple ID. Enrolled 2026-09-24. |
| 2 | ~~Bundle identifier~~ | **Decided:** `au.com.camotechsolutions.ctsfitness`. Landed in `mobile/app.json`, not yet built. |
| 3 | ~~GitHub destination~~ | **Decided:** Josh's personal GitHub account signed in with the CamoTech email, username `joshcamotech`. Target repo `github.com/joshcamotech/CTS-Fitness`. |
| 4 | ~~Legal pages subdomain~~ | **Decided:** `ctsfitness.camotechsolutions.com.au`. Landed in `mobile/src/constants/legal.ts` and `docs/CNAME`. |

App name is also decided: **CTS Fitness**, checked clear against the App
Store on 2026-09-24 — see `APP_STORE_CONNECT.md` §1.

---

## Inventory

Where each piece lives today, and what moving it costs.

| Thing | Today | Move to | Effort | Changes app code? |
|---|---|---|---|---|
| Apple Developer | **enrolled** (Individual, CamoTech email) | — done | done | no |
| App name / Bundle ID | ~~GymTracker~~ / ~~`com.gymtracker.app`~~ | **CTS Fitness** / `au.com.camotechsolutions.ctsfitness` | done in code, needs a build | **yes — rebuild** |
| GitHub | ~~`joshcammo/GymApp`~~ | **`joshcamotech/CTS-Fitness`** — done | done | Pages URL only |
| Custom domain | ~~GitHub's default Pages URL~~ | **`ctsfitness.camotechsolutions.com.au`** — done, HTTPS on, all 3 URLs verified 200 | done | no |
| Supabase | ~~personal org~~ | **Camotech Solutions org** — done, ref unchanged | done | **no** |
| Expo / EAS | ~~owner `joshcammo`~~ | **`camotech` org** (owned by the CamoTech Expo account) — done | done | `app.json` owner — done |
| Gemini API key | personal Google | **stays personal, on purpose** — see step 6 | — | no |
| Domain, support email | already CamoTech | — | — | — |

**Next action: the first `eas build` from an up-to-date `main`** — now step 4 of
the ordered list in `APP_STORE_SUBMISSION.md` → "Pick up here", after the demo
accounts and device testing.

**Code change landed 2026-09-24** — name, bundle ID, legal URLs and the
custom-domain CNAME are all done:

```
mobile/app.json                  expo.name, ios.bundleIdentifier, android.package
mobile/src/constants/legal.ts    privacyUrl, termsUrl, supportUrl
docs/CNAME                       new file — ctsfitness.camotechsolutions.com.au
docs/privacy.html, terms.html,
  index.html, style.css          GymTracker → CTS Fitness throughout
README.md                        title
APP_STORE_SUBMISSION.md          URL table, blocker status
APP_STORE_CONNECT.md             enrolment type, app name, listing URLs
```

`expo.owner` was deliberately left as `joshcammo` at the time; it changed to
`camotech` on 2026-09-25, together with the Expo org transfer (step 5).

---

## Custom domain for the legal pages

Worth doing as part of this rather than separately.

The privacy policy and support URLs are baked into the app **and** submitted to
Apple. Today they are `https://joshcammo.github.io/GymApp/...`, which is tied
to the personal GitHub account — so transferring the repo moves them, and
moving them after submission means editing the App Store listing.

Pointing them at a domain we own (`ctsfitness.camotechsolutions.com.au`,
decided 2026-09-24) decouples them permanently: the URL survives any future
repo or account move, and it reads as a business rather than someone's
personal GitHub. `legal.ts` and `docs/CNAME` already point at it — it just
isn't live yet, pending the DNS record and Pages setting below.

GitHub Pages supports this free. It needs a DNS record and a `docs/CNAME` file.

> Do this **before** submitting to Apple. Afterwards, changing the privacy
> policy URL means updating the App Store Connect listing, and a dead privacy
> URL is a 2.1 rejection on its own.

---

## Runbook

Ordered so nothing blocks on something later in the list. Steps 2–6 can be done
in any order once step 1 is under way.

### 1. Apple Developer Program

- Enrol at [developer.apple.com/programs](https://developer.apple.com/programs/)
  as an **Individual**, using the CamoTech email as the Apple ID. CamoTech
  Solutions is an ABN sole trader, not a registered company, so Organization
  enrolment (which needs a D-U-N-S number) isn't realistically available —
  Individual is the correct type here, not a fallback.
- The App Store "Seller" name will show Josh's personal legal name, not
  "CamoTech Solutions" — that's an Apple rule for Individual accounts and
  isn't affected by which email you enrol with. App icon, name and
  description are unaffected.
- Once active, check **Agreements, Tax, and Banking**. A free app still needs
  the Free Applications agreement accepted, and an unaccepted agreement
  silently blocks submission.
- Do **not** create the App Store Connect app record yet — that is what locks
  the bundle ID, and the name is not decided.

### 2. GitHub — done 2026-09-24

- ~~Transfer `joshcammo/GymApp` to `joshcamotech`~~ — **done.** Repo is now
  `joshcamotech/CTS-Fitness`.
- **Verified 2026-09-25:**
  - `secrets.EXPO_TOKEN` exists (replaced 2026-09-25 with a `camotech` org
    robot token — see step 5).
  - `vars.EXPO_PUBLIC_SUPABASE_URL` and `vars.EXPO_PUBLIC_SUPABASE_ANON_KEY`
    exist. **If these are ever missing, the OTA workflow publishes a bundle
    that crashes on launch before any UI renders** — this has happened before,
    see the note in `.github/workflows/eas-update.yml`.
  - Actions are enabled; CI on `main` green after the transfer.
  - Local `gh` has two logins: `joshcammo` (active, has `workflow` scope) and
    `joshcamotech` (repo owner). Admin-level API calls (security settings,
    Actions permissions) need `gh auth switch -u joshcamotech`.
- **Secret scanning** and **Push protection** turned **on** 2026-09-25 (via
  the API as `joshcamotech`); history scan found 0 open alerts.

### 3. Custom domain — done 2026-09-24

- ~~DNS: `CNAME` record~~ — **done**: `ctsfitness.camotechsolutions.com.au` →
  `joshcamotech.github.io`.
- **Gotcha hit and fixed:** the Cloudflare DNS record was created **Proxied**
  (orange cloud) by default. GitHub Pages can't verify or issue a certificate
  through Cloudflare's proxy — it needs to see the CNAME resolve directly.
  Fixed by switching the record to **DNS only** (grey cloud) in Cloudflare.
  If this domain's DNS record is ever recreated, do that from the start.
- ~~Add `docs/CNAME`~~ — **done**, already in the repo.
- ~~Enforce HTTPS~~ — **on.**
- ~~Confirm all three URLs return 200~~ — **verified 2026-09-24**, including
  checking `/` actually serves the CTS Fitness page (not a cached/placeholder
  response):
  - `https://ctsfitness.camotechsolutions.com.au/` → 200, `<title>CTS Fitness
    — Support</title>`
  - `https://ctsfitness.camotechsolutions.com.au/privacy.html` → 200
  - `https://ctsfitness.camotechsolutions.com.au/terms.html` → 200

### 4. Supabase — done 2026-09-25

- Project "Gym App" now sits in the **Camotech Solutions** org (Free plan).
- **How it was done** (a transfer needs one login that is Owner of *both*
  orgs — a project belongs to an org, not a login): the CamoTech-email
  Supabase account created the org and invited the personal login as Owner;
  the personal login ran Project Settings → General → Transfer project.
  If the transfer dialog says "You do not have any organizations you can
  transfer your project to", that's the missing piece.
- **Data verified intact:** a read-only per-table row count (all `public`
  tables, `auth.users`, `storage.objects`) was exported before the transfer
  and matched exactly after it.
- **Project ref unchanged:** `dghklsegfqklwpjpnhry`. Auth health and a REST
  read with the app's anon key both returned 200 after the transfer — no app
  or GitHub-variable change needed. (The bare project URL returns
  `{"error":"requested path is invalid"}` — that's normal, it's an API host.)
- Correction to the earlier note: the free-tier limit is on active free
  projects per *user* across the orgs they own/admin, not "one per org".
- Personal login removed from the org's Team 2026-09-25 — the
  CamoTech-email account is the sole Owner.

### 5. Expo / EAS — done 2026-09-25

- Project now at `expo.dev/accounts/camotech/projects/gym-tracker`. The
  `camotech` org is owned by the **CamoTech-email Expo account**, fully
  separate from `joshcammo`. Same pattern as Supabase: CamoTech created the
  org and invited `joshcammo` temporarily so it could run the transfer.
- `expo.owner` in `mobile/app.json` → `camotech`. `expo.slug`
  (`gym-tracker`) and the EAS `projectId` (`ef0d32f5-…`) are unchanged — the
  project id is what `updates.url` points at, so existing Expo Go group links
  keep working.
- `secrets.EXPO_TOKEN` replaced with a token for a **robot user** in the
  `camotech` org, so CI doesn't depend on a personal login.
- Closed out 2026-09-25, in this order: (1) the OTA workflow run for PR #42
  on `main` passed on the robot token; (2) `joshcammo` removed from the org's
  Members and its old access token deleted; (3) local CLI switched —
  `npx eas-cli whoami` shows `camotech-solutions`, Owner of `camotech` and
  `camotech-solutions`, no `joshcammo`. The first `eas build` will create
  Apple credentials under the org.

### 6. Google Gemini key — stays on the personal account, deliberately

- Tried 2026-09-25: a key from the CamoTech Google Workspace account got
  `403 PERMISSION_DENIED — "Your project has been denied access"`, and the
  AI Studio playground on that account demands a paid upgrade. Workspace
  accounts don't get the Gemini free tier here, and paying isn't justified
  for a nice-to-have feature.
- **Decision:** `GEMINI_API_KEY` is back on the personal key. Don't revoke
  the personal key — it's the live one.
- Tradeoff accepted: AI Workout depends on the personal Google account.
  Nothing else does. If that ever matters, a free consumer Gmail owned by the
  business (e.g. `ctsfitness.app@gmail.com`) gets the free tier — swap the
  secret, no code change.
- Free tier means Google may use prompts to improve its products — unchanged
  from before, but the privacy policy should reflect it.
- Gemini 503 "model is currently experiencing high demand" is transient and
  proves the key authenticated. The function doesn't retry, and failed
  attempts count toward the 15/day per-user cap.
- Unused key(s) in the CamoTech AI Studio deleted 2026-09-25.

---

## The code change — done 2026-09-24

Landed: `mobile/app.json` (`expo.name`, `ios.bundleIdentifier`,
`android.package` — **not** `expo.owner`, which followed on 2026-09-25 with
the Expo transfer), `mobile/src/constants/legal.ts`, `docs/CNAME` (new),
`docs/privacy.html`/`terms.html`/`index.html`/`style.css`, `README.md`,
`APP_STORE_SUBMISSION.md`, `APP_STORE_CONNECT.md`.

Not touched, deliberately: `supabase/migrations/023_moderation_and_account_deletion.sql`
still has a "GymTracker" string in a user-facing moderation error message —
that migration is already applied to production, so fixing it needs a *new*
migration, not an edit to an applied one. Separate task if wanted.
`supabase/scripts/seed_demo_account.sql` untouched — demo email addresses
didn't change.

Do **not** change `expo.slug` or the EAS `projectId`. The slug is tied to the
existing EAS project, and the project id is what `updates.url` points at.
Neither changed.

The OTA workflow will warn on the next push to `main` that `app.json` changed
and an update cannot deliver it. That warning is correct: **`bundleIdentifier`
needs a fresh `eas build`, not an OTA update.** Don't build yet — wait until
the GitHub transfer and custom domain are done, so the build's baked-in legal
URLs are already live.

---

## What is not affected

- **No database migration.** Data stays in the same Supabase project; only the
  owning organization changes.
- **No user impact.** Nothing is in the App Store yet and the OTA channel has
  no store-installed users on it.
- **No secrets in the repo to rotate.** The Supabase anon key lives in GitHub
  Actions variables and is safe to expose regardless — RLS is the access
  boundary. The Gemini key lives only in the Edge Function environment.
- Git history, issues and PRs survive a GitHub repo transfer, and the old repo
  URL redirects. The old **Pages** URL is the thing not to rely on, which is
  what the custom domain solves.
