// ─── App environment configuration template ────────────────────────────────────
// Copy this file to env.js and fill in your real values.
// env.js is gitignored — env.example.js is safe to commit.

export const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
export const API_URL           = 'YOUR_RAILWAY_API_URL';

// Build-time flag. Set to TRUE for TestFlight archives so every new signup
// auto-applies the lifetime beta rate ($9.99/month). Set to FALSE for the
// public App Store build so new users see regular pricing.
export const BETA_BUILD        = true;
export const BETA_PROMO_CODE   = 'BETALAUNCH2026';

// ── Google Places ─────────────────────────────────────────────────────────────
// The GOOGLE_PLACES_API_KEY does NOT live in this file.
// It lives in Railway environment variables (see README.md → Environment Variables).
// The backend proxies all Places API calls so the key is never shipped in the app.
