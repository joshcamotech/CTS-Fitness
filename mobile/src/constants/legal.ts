/**
 * ─────────────────────────────────────────────────────────────
 * Legal and support links
 *
 * Served from /docs in this repo via GitHub Pages, so the pages
 * are versioned alongside the code they describe.
 *
 * App Store Review Guideline 5.1.1(i) requires the privacy policy
 * to be reachable from inside the app, not only from the App Store
 * listing, and 1.5 requires an easy way to contact the developer.
 * Both are linked from the Settings screen.
 * ─────────────────────────────────────────────────────────────
 */

export const LEGAL = {
  privacyUrl:   'https://ctsfitness.camotechsolutions.com.au/privacy.html',
  termsUrl:     'https://ctsfitness.camotechsolutions.com.au/terms.html',
  supportUrl:   'https://ctsfitness.camotechsolutions.com.au/',
  // Where the email-confirmation link lands. Must be in Supabase's Redirect
  // URLs allow-list (Authentication -> URL Configuration).
  confirmedUrl: 'https://ctsfitness.camotechsolutions.com.au/confirmed.html',
  supportEmail: 'josh@camotechsolutions.com.au',
} as const;
