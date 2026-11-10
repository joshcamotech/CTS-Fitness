# App Store Connect — submission pack

Everything that has to be typed into App Store Connect, written down so it is
decided once rather than improvised in the submission form at 11pm.

Companion to `APP_STORE_SUBMISSION.md`, which tracks the code work. This file
is Phase 6. Nothing here is code; all of it is manual.

Most of it happens **after** a build is uploaded, but **§0 (Apple Developer
enrolment), §1 (the app name) and §2 (demo accounts) all have to happen
before** — §0 because enrolment can take days, §1 because the name is a native
change baked into the build, and §2 because the seed wants an account that
already exists. §7 is the order to do everything in.

---

## 0. Apple Developer Program — check this first

None of the rest of this document is reachable without an active **Apple
Developer Program** membership ($149 AUD/year). It is needed last and should be
checked first, because enrolment is not instant — identity verification can
take days, and for a company entity it needs a D-U-N-S number, which is slower
again.

Confirm at [developer.apple.com/account](https://developer.apple.com/account):

- Membership is **active**, not expired or pending.
- The **Agreements, Tax, and Banking** section has no outstanding agreement.
  A free app still needs the Free Applications agreement accepted, and an
  unaccepted agreement silently blocks the app from being submitted.

**Enrol as an Individual, using the CamoTech email as the Apple ID.**
Decided 2026-09-24, superseding the 2026-09-22 org-enrolment plan. CamoTech
Solutions is an ABN sole trader, not a registered company, and D-U-N-S numbers
go to registered legal entities — Organization enrolment isn't realistically
available here. **Enrolled 2026-09-24.**

Consequence: the App Store **Seller** name shows Josh's personal legal name,
not "CamoTech Solutions" — fixed by Apple for Individual accounts regardless
of enrolment email. This holds for any future CamoTech app on this account
too, since Seller name is account-wide. Revisit only if CamoTech Solutions
ever incorporates — see `ACCOUNT_MIGRATION.md`.

This is part of a wider move off personal accounts — see
**`ACCOUNT_MIGRATION.md`**, which covers GitHub, Supabase, Expo and the Gemini
key as well. Nothing was verified in any working session; it is recorded here
because it is the one prerequisite nothing else in the repo tracks.

---

## 1. App name — decided: CTS Fitness

**"GymTracker" is taken.** Checked against the iTunes Search API on 2026-09-22
(AU storefront), and there are two near-exact matches already shipping:

- *GymTracker – Workout Log* — Krystian Zajc
- *GymTracker: Track workouts* — Mael Romanin Bluteau

Apple will not reject you purely for a similar name, but 2.3.7 governs name and
subtitle, a confusingly similar name invites a dispute from the incumbent, and
being the third "GymTracker" is bad for discovery regardless of review.

Candidates checked the same way. "Collides" means an app already leads with
that word:

| Candidate | Result |
|---|---|
| GymTracker | **collides** — two near-exact matches |
| LiftLog | **collides** — at least four |
| IronLog | **collides** — at least four |
| PlateLoad | **collides** — at least three |
| Barbell Diary | clear |
| Setgrid | clear |
| Liftwell | clear |
| Rackside | clear |
| **CTS Fitness** | **clear** — checked 2026-09-24, no exact match in AU storefront top results. **Decided.** |

Trade mark register not yet checked — do that before submitting, not before
building; a name collision costs a review cycle, a trade mark collision costs
the listing, but it doesn't block the code change below.

Re-check immediately before submitting — the store moves:

```bash
curl -s "https://itunes.apple.com/search?term=YOUR+NAME&country=au&entity=software&limit=10" \
  | python -c "import json,sys; [print(r['trackName'],'|',r['sellerName']) for r in json.load(sys.stdin)['results']]"
```

Also search the [trade mark register](https://search.ipaustralia.gov.au/trademarks/search/quick)
for class 9 / 42 before committing. A name collision costs a review cycle; a
trade mark collision costs the listing.

**When you decide**, the name lives in three places:

1. `mobile/app.json` → `expo.name` — the label under the icon on the home
   screen. Changing it is a **native change**, so it needs a fresh
   `eas build`, not an OTA update.
2. App Store Connect → the listing name (30 characters, 2.3.7).
3. `docs/*.html` and `mobile/src/constants/legal.ts` if the name appears in
   the legal copy.

`expo.slug` and the EAS project id should **not** change — the slug is tied to
the existing EAS project and the project id is what `updates.url` points at.

**`ios.bundleIdentifier` changed too, for a different reason.** It was
`com.gymtracker.app`, reverse-DNS for a domain we do not own, and it is
permanent once the App Store Connect record exists. It is now
`au.com.camotechsolutions.ctsfitness` — see `ACCOUNT_MIGRATION.md`. Name and
bundle ID landed together in one PR, as planned.

---

## 2. Demo account (Guideline 2.1)

The app is login-gated. Review fails without credentials, and it fails just as
surely with credentials that open onto an empty app — a reviewer who cannot
find a feed, a friend or a history cannot verify the social and moderation
features, and a 1.2 rejection follows.

**Two accounts, not one.** The reviewer needs someone else's content to report
and block; they cannot demonstrate moderation against their own posts.

1. Create both accounts in the Supabase dashboard — Authentication → Users →
   Add user → Create new user, with **Auto Confirm User** ticked. This goes
   through Supabase Auth, so the user, identity and profile rows are written
   the normal way, and it needs no email delivery (Supabase's built-in email
   service is test-only and may not deliver to addresses outside the org). Do
   not hand-insert `auth.users` rows with SQL:
   - `demo@camotechsolutions.com.au` → `demo_lifter`
   - `demo2@camotechsolutions.com.au` → `demo_friend`
2. Use a unique, strong password you are willing to put in the review notes in
   plain text. Keep it in a password manager, not the repo.
3. Run `supabase/scripts/seed_demo_account.sql` in the Supabase SQL editor. It
   sets the usernames and display names itself.

The seed gives the main account six weeks of training on a four-day split with
progressive loading (so the 1RM trend, volume chart, muscle-group breakdown and
PR detection all have real data), an accepted friendship, posts
from both sides, and comments in both directions. It is idempotent and scoped
strictly to those two user ids (including any block between them, but not
`content_reports`, which you clear by hand) — **re-run it immediately before
submitting and before any resubmission** to freshen the dates. The Workout
screen shows only the current week by default, and `demo_friend`'s sessions are
2, 9 and 16 days before the run, so a stale seed looks empty.

Put **both** sets of credentials in the review notes.

---

## 3. Notes for Review (2.3.1(a))

Generic descriptions get rejected. A reviewer who cannot find Report and Block
rejects under 1.2. Paste this, with the credentials filled in:

> Demo account: demo@camotechsolutions.com.au / [password]
> Second account (for testing Report and Block on another user's content):
> demo2@camotechsolutions.com.au / [password]
> The two accounts are already friends, so the social feed has content in it.
>
> Social features are friends-only and require an accepted friend request.
> Report and Block are on the overflow menu of any post or comment, and on the
> overflow menu of any user in Friends. Blocked users are managed in
> Settings → Blocked Users. Account deletion is Settings → Delete Account.
>
> All user-generated text (post captions, comments, usernames and display
> names) passes through a server-side content filter before it is stored.
> Reports are queued for review within 24 hours, as stated in the Terms of Use.
>
> The AI Workout screen sends the user's typed prompt and a summary of their
> last 30 days of training to Google's Gemini API to generate a suggestion.
> This is disclosed on that screen and in the privacy policy. Generated
> workouts are labelled as suggestions, not medical or professional advice.

---

## 4. Privacy nutrition label

Must match `docs/privacy.html`. If they disagree, the policy is the thing
Apple treats as binding, and the mismatch is itself a rejection.

Every category below is **linked to the user's identity** and **not used for
tracking**. The app has no analytics SDK, no ad network and no third-party
tracker, so the answer to "Do you or your third-party partners use data for
tracking?" is **No**, and no ATT prompt is required.

| Category | Data type | Purpose |
|---|---|---|
| Contact Info | Email Address | App Functionality (account, sign-in, password reset) |
| Health & Fitness | Fitness | App Functionality (the workout history) |
| User Content | Other User Content | App Functionality (post captions, comments) |
| Identifiers | User ID | App Functionality (account id, username) |

**Not collected:** precise or coarse location, contacts, photos, browsing
history, search history, purchases, financial info, sensitive info, diagnostics,
crash data, performance data, advertising data.

The privacy policy names four processors — Supabase, Google (Gemini API),
Expo/EAS and Apple. The nutrition label has no field for processors; the policy
is where 5.1.1(i) is satisfied.

> Adding any analytics, ad or attribution SDK later changes **both** this label
> and the privacy policy, and would likely trigger an ATT prompt. Don't do it
> casually.

---

## 5. Age rating

Answer the questionnaire honestly. The answers that matter here:

- **User-generated content: yes.** The app has captions and comments visible to
  accepted friends. Friends-only visibility does **not** exempt you.
- When asked whether the app includes moderation controls, the honest answer is
  yes, and this is worth getting right because it affects the rating: there is
  a content filter on every write path, in-app reporting with a stated 24-hour
  review commitment, and per-user blocking.
- **No** to: gambling, contests, unrestricted web access, violence, sexual
  content, drugs, horror, profanity as app content.

Apple has revised the age-rating questionnaire more than once recently, so the
exact questions will not match this list word for word. Answer what is actually
asked; do not pattern-match against this table.

**Do not understate the UGC answer to chase a lower rating.** A wrong age
rating is a rejection under 2.3.1 for misrepresenting the app, and it is the
kind of thing that gets found.

---

## 6. Listing

| Field | Value |
|---|---|
| Primary category | Health & Fitness |
| Secondary category | leave empty, or Sports |
| Privacy policy URL | `https://ctsfitness.camotechsolutions.com.au/privacy.html` |
| Support URL | `https://ctsfitness.camotechsolutions.com.au/` |
| Marketing URL | leave empty |
| Copyright | `2026 Camo Tech Solutions` |
| Export compliance | already answered by `ITSAppUsesNonExemptEncryption: false` in `app.json` |

These are the **new** custom-domain URLs, decided 2026-09-24 — they replace the
`joshcammo.github.io/GymApp/...` URLs confirmed serving 200 on 2026-09-22.
**Do not submit until the new URLs also return 200** — DNS + GitHub Pages
custom domain setup is still an outstanding manual step. See
`ACCOUNT_MIGRATION.md` → "Custom domain".

### Screenshots

Required sizes change; confirm the current set in App Store Connect rather than
trusting this list. At the time of writing, iPhone 6.9" is the required set and
others are derived from it. `supportsTablet` is `false`, so no iPad screenshots
are needed.

Show the features the review notes describe, so the reviewer sees them before
they go looking:

1. Dashboard with the hero metric and trend
2. Logging a set on Day Detail
3. Progress — the 1RM chart
4. The AI Workout screen, **with the Gemini disclosure visible**
5. The social feed
6. A post's overflow menu, **with Report and Block visible**

Screenshot 6 is the cheapest insurance in this whole document.

---

## 7. Order of operations

0. Confirm Apple Developer Program enrolment is active and agreements are
   accepted (§0). Do this first; it can take days.
1. Decide the app name (§1). If it changes, update `app.json` **before**
   building — it is a native change.
2. Create and seed the demo accounts (§2) — done 2026-11-10; re-seed right
   before Submit.
3. Run the **iOS release** workflow with `submit: false`, confirm the build
   succeeds, and check the icon has no alpha channel.
4. Re-run with `submit: true`, or upload from the EAS dashboard.
5. Watch for an ITMS-91053 email about privacy-manifest reasons. None is
   expected — the app calls no required-reason APIs directly and async-storage
   ships its own manifest — but confirm rather than assume.
6. Fill in §3–§6 in App Store Connect.
7. Walk the device test list in `APP_STORE_SUBMISSION.md` → "What has not been
   tested" before hitting Submit. Most of it has never been run.

---

## If it gets rejected

Rejections arrive in Resolution Center and are usually specific. The three most
likely for this app:

- **1.2 (UGC)** — the reviewer could not find Report or Block. Reply with the
  exact navigation path and a screenshot. This is why §3 spells out the
  locations and why screenshot 6 exists.
- **2.1 (incomplete)** — demo credentials failed, or the app opened empty.
  Re-run the seed script and reply with fresh credentials.
- **5.1.1(i)** — privacy policy unreachable or not matching the nutrition
  label. Check the Pages URLs are still serving.

Reply in Resolution Center rather than resubmitting blind; a reply keeps the
existing review slot, a resubmission goes back into the queue.
