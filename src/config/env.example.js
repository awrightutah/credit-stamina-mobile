// ─── App environment configuration template ────────────────────────────────────
// Copy this file to env.js and fill in your real values.
// env.js is gitignored — env.example.js is safe to commit.

export const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
export const API_URL           = 'YOUR_RAILWAY_API_URL';

// ── Google Places ─────────────────────────────────────────────────────────────
// The GOOGLE_PLACES_API_KEY does NOT live in this file.
// It lives in Railway environment variables (see README.md → Environment Variables).
// The backend proxies all Places API calls so the key is never shipped in the app.
